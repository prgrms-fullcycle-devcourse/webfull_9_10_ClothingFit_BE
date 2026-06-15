import sharp from 'sharp';
import { uuidv7 } from 'uuidv7';
import { Prisma, type ClothingType } from '@prisma/client';
import { StatusCodes } from 'http-status-codes';
import { meshFetch, MeshApiError } from '@/lib/ai/mesh';
import { generateMultimodalImage, generateText, GeminiApiError, type ImageGenOptions } from '@/lib/ai/gemini';
import { AppError } from '@/common/errors/app-error';
import { ErrorCode } from '@/common/errors/error-code';
import { logger } from '@/lib/logger/logger';
import prisma from '@/lib/prisma/extensions';
import { uploadFittingModel, deleteFittingModel } from '@/lib/storage/fitting-model';
import { uploadClosetImage, deleteClosetImage } from '@/lib/storage/closet-image';
import { COORDI_BACKGROUND_BASE64, COORDI_BACKGROUND_MIME } from '@/assets/coordi-background';
import { fittingStore, type FittingSession, type CoordiResult } from './fitting.store';
import type { CoordiMeasurements } from './fitting.schema';
import { CATEGORY_LABEL, CATEGORY_EN, buildCoordiPrompt, buildOutfitNamePrompt, parseOutfitName } from './fitting.prompt';
import { createFitCompleteNotification } from '../notifications/notifications.service';

const TTL_MS = 24 * 60 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;
const RATE_LIMIT_BACKOFF_MS = 30_000; // Mesh AI 429 응답 시 대기
const MAX_CONCURRENT = 10;
const MAX_QUEUE_SIZE = 100;
const MAX_PER_USER = 1;

const MAX_ERROR_COUNT = 10;
const MAX_PROCESSING_MS = 30 * 60 * 1000;

/**
 * PROCESSING이 끝날 때 슬롯·사용자 카운트를 해제하고 다음 대기 작업을 시작합니다.
 * @params sessionId
 **/
function releaseSlot(sessionId: string): void {
    const session = fittingStore.getSession(sessionId);
    if (!session) return;
    fittingStore.decrementActive();
    fittingStore.decrementUserCount(session.userId);
    processQueue().catch((err) => console.error('[Fitting] processQueue error:', err));
}

/**
 * 세션을 삭제하면서 보유 중이던 슬롯·사용자 카운트를 상태에 맞게 해제합니다.
 * 모든 삭제 경로(만료 조회/큐 정리/TTL)가 이 함수를 통하게 하여 카운트 누수를 방지합니다.
 * @params sessionId
 **/
function cleanupSession(sessionId: string): void {
    const session = fittingStore.getSession(sessionId);
    if (!session) return;
    if (session.status === 'QUEUED' || session.status === 'PROCESSING') {
        fittingStore.decrementUserCount(session.userId);
    }
    if (session.status === 'PROCESSING') {
        fittingStore.decrementActive();
        processQueue().catch((err) => console.error('[Fitting] cleanup 후 processQueue 에러:', err));
    }
    fittingStore.deleteSession(sessionId);
}

/**
 * 대기열에 등록된 3D 피팅 작업을 처리합니다.
 * 사용 가능한 동시 처리 슬롯만큼 작업을 선점한 후 병렬로 Meshy 작업을 시작합니다.
 */
async function processQueue(): Promise<void> {
    const slots = MAX_CONCURRENT - fittingStore.getActiveCount();
    if (slots <= 0 || fittingStore.getQueueLength() === 0) return;

    const toStart: Array<{ sessionId: string; imageUrl: string }> = [];

    // 슬롯 예약을 동기로 처리해 race condition 방지
    while (toStart.length < slots && fittingStore.getQueueLength() > 0) {
        const nextSessionId = fittingStore.dequeue();
        if (!nextSessionId) break;

        const session = fittingStore.getSession(nextSessionId);
        if (!session || session.expiresAt < Date.now()) {
            // 큐에서 만료된 세션 정리 — 카운트 해제까지 한 번에 (누수 방지)
            cleanupSession(nextSessionId);
            continue;
        }

        fittingStore.incrementActive(); // await 이전에 슬롯 선점
        toStart.push({ sessionId: nextSessionId, imageUrl: session.imageUrl });
    }

    // 빈 슬롯만큼 병렬 시작
    await Promise.all(
        toStart.map(({ sessionId, imageUrl }) =>
            startMeshTask(sessionId, imageUrl).catch((err) =>
                console.error(`[Fitting] startMeshTask error for ${sessionId}:`, err),
            ),
        ),
    );
}

/**
 * Meshy 3D 생성 작업을 시작합니다.
 * 작업 ID를 세션에 저장하고 PROCESSING 상태로 전환한 뒤 상태 조회(Polling)를 예약합니다.
 * @params sessionId
 * @params imageUrl
 */
async function startMeshTask(sessionId: string, imageUrl: string): Promise<void> {
    // activeCount는 호출 전에 이미 증가됨
    const session = fittingStore.getSession(sessionId);
    if (!session) {
        fittingStore.decrementActive();
        return;
    }

    let meshData: { result?: string };
    try {
        const meshRes = await meshFetch('/image-to-3d', {
            method: 'POST',
            body: JSON.stringify({
                image_url: imageUrl,
                ai_model: 'latest', // Meshy-6 (hd_texture 지원 조건 명시)
                should_texture: true,
                enable_pbr: true,
                hd_texture: true, // 베이스컬러 텍스처 4K → 선명도 ↑ (추가 크레딧 없음)
                target_formats: ['glb'],
                // 리메시를 끄면 Meshy-6 기본대로 최고 정밀 원본 메시를 받는다.
                // 리메시(quad/폴리곤 고정)는 형태 디테일을 깎으므로 화질 우선이면 끈다.
                should_remesh: false,
            }),
        });
        // .json() 파싱도 try 안에 둬야 본문이 비정상일 때 슬롯/카운트가 누수되지 않는다.
        meshData = (await meshRes.json()) as { result?: string };
    } catch (err) {
        // meshFetch는 non-2xx 응답에서 MeshApiError를 throw한다.
        console.error(`[Fitting] Mesh API 요청 실패 (${sessionId}):`, err);
        session.status = 'FAILED';
        fittingStore.setSession(sessionId, session);
        releaseSlot(sessionId);
        return;
    }

    if (!meshData.result) {
        console.error(`[Fitting] Mesh API task ID 없음 (${sessionId})`);
        session.status = 'FAILED';
        fittingStore.setSession(sessionId, session);
        releaseSlot(sessionId);
        return;
    }

    session.meshTaskId = meshData.result;
    session.status = 'PROCESSING';
    session.startedAt = Date.now();
    fittingStore.setSession(sessionId, session);
    // activeCount는 pollMeshStatus에서 작업 종료 시 감소
    setTimeout(() => pollMeshStatus(sessionId), POLL_INTERVAL_MS);
}

/**
 * 3D 피팅 세션을 조회하고 유효성·소유권을 검증합니다.
 * 존재하지 않거나 만료된 세션은 삭제 후 예외를 발생시키며,
 * 소유자가 아니면 존재 여부를 노출하지 않기 위해 동일하게 404를 던집니다.
 * @param sessionId
 * @param userId 소유권 검증 대상 사용자
 */
function getSession(sessionId: string, userId: string): FittingSession {
    const session = fittingStore.getSession(sessionId);
    if (!session || session.expiresAt < Date.now()) {
        // 만료 세션 삭제 시 보유 카운트도 함께 해제 (누수 방지)
        cleanupSession(sessionId);
        throw new AppError(ErrorCode.FITTING_NOT_FOUND, '세션을 찾을 수 없거나 만료되었습니다.', StatusCodes.NOT_FOUND);
    }
    if (session.userId !== userId) {
        throw new AppError(ErrorCode.FITTING_NOT_FOUND, '세션을 찾을 수 없거나 만료되었습니다.', StatusCodes.NOT_FOUND);
    }
    return session;
}

/**
 * Meshy 작업 상태를 주기적으로 조회하여
 * 진행률 및 결과 정보를 세션에 반영합니다.
 * @param sessionId
 */
async function pollMeshStatus(sessionId: string): Promise<void> {
    const session = fittingStore.getSession(sessionId);
    if (!session || session.expiresAt < Date.now() || session.status !== 'PROCESSING') return;

    if (Date.now() - (session.startedAt ?? 0) > MAX_PROCESSING_MS) {
        console.error(`[Fitting] 최대 처리 시간 초과 (${sessionId})`);
        session.status = 'FAILED';
        fittingStore.setSession(sessionId, session);
        releaseSlot(sessionId);
        return;
    }

    if (session.errorCount >= MAX_ERROR_COUNT) {
        console.error(`[Fitting] 최대 에러 횟수 초과 (${sessionId})`);
        session.status = 'FAILED';
        fittingStore.setSession(sessionId, session);
        releaseSlot(sessionId);
        return;
    }

    try {
        const meshRes = await meshFetch(`/image-to-3d/${session.meshTaskId}`);

        const meshData = (await meshRes.json()) as {
            status?: string;
            progress?: number;
            model_urls?: { glb?: string };
            thumbnail_url?: string;
        };

        if (!meshData.status) {
            console.error(`[Fitting] Mesh API 상태 없음 (${sessionId})`);
            session.status = 'FAILED';
            fittingStore.setSession(sessionId, session);
            releaseSlot(sessionId);
            return;
        }

        if (meshData.status === 'SUCCEEDED') {
            session.status = 'SUCCEEDED';
            session.glbUrl = meshData.model_urls?.glb;
            session.thumbnailUrl = meshData.thumbnail_url;
            fittingStore.setSession(sessionId, session);
            releaseSlot(sessionId);

            // 알림 실패가 피팅 성공에 영향을 주지 않도록 fire-and-forget 하되, reject는 반드시 삼켜
            // unhandledRejection으로 프로세스가 죽지 않게 한다.
            createFitCompleteNotification({
                receiverId: session.userId,
                dimension: '3D',
                closetArchiveId: session.closetArchiveId,
            }).catch((err) => console.error(`[Fitting] 완료 알림 생성 실패 (${sessionId}):`, err));
        } else if (meshData.status === 'FAILED' || meshData.status === 'EXPIRED') {
            session.status = 'FAILED';
            fittingStore.setSession(sessionId, session);
            releaseSlot(sessionId);
        } else {
            session.progress = meshData.progress;
            session.errorCount = 0;
            fittingStore.setSession(sessionId, session);
            setTimeout(() => pollMeshStatus(sessionId), POLL_INTERVAL_MS);
        }
    } catch (err) {
        // meshFetch는 non-2xx에서 MeshApiError를 throw한다.
        // 429(레이트리밋)는 에러 카운트 없이 더 긴 백오프 후 재시도한다.
        if (err instanceof MeshApiError && err.status === 429) {
            setTimeout(() => pollMeshStatus(sessionId), RATE_LIMIT_BACKOFF_MS);
            return;
        }

        console.error(`[Fitting] 폴링 에러 (${sessionId}):`, err);
        session.errorCount += 1;
        fittingStore.setSession(sessionId, session);
        setTimeout(() => pollMeshStatus(sessionId), POLL_INTERVAL_MS);
    }
}

/**
 * 3D 피팅 작업을 생성합니다.
 * 사용자별 요청 수를 제한하고 세션을 생성한 뒤 즉시 실행하거나 대기열에 등록합니다.
 * @param userId
 * @param closetArchiveId
 */
export const start3DFitting = async (userId: string, closetArchiveId: string): Promise<string> => {
    // 사용자당 동시 요청 제한 - await 이전에 선점해 race condition 방지
    if (fittingStore.getUserCount(userId) >= MAX_PER_USER) {
        throw new AppError(ErrorCode.FITTING_IN_PROGRESS, '이미 진행 중인 3D 피팅이 있습니다.', StatusCodes.CONFLICT);
    }
    fittingStore.incrementUserCount(userId);

    let archive: { imageUrl: string } | null;
    try {
        archive = await prisma.closetArchive.findFirst({
            where: { id: closetArchiveId, userId },
            select: { imageUrl: true },
        });
    } catch (err) {
        fittingStore.decrementUserCount(userId);
        throw err;
    }

    if (!archive) {
        fittingStore.decrementUserCount(userId);
        throw new AppError(ErrorCode.CLOSET_NOT_FOUND, '옷장 아카이브를 찾을 수 없습니다.', StatusCodes.NOT_FOUND);
    }

    const now = Date.now();
    const sessionId = uuidv7();

    fittingStore.setSession(sessionId, {
        userId,
        closetArchiveId,
        imageUrl: archive.imageUrl,
        status: 'QUEUED',
        expiresAt: now + TTL_MS,
        errorCount: 0,
    });

    // TTL 만료 시 정리 (카운트 해제 포함)
    setTimeout(() => cleanupSession(sessionId), TTL_MS);

    if (fittingStore.getActiveCount() < MAX_CONCURRENT) {
        fittingStore.incrementActive(); // await 이전에 슬롯 선점
        await startMeshTask(sessionId, archive.imageUrl);
    } else {
        if (fittingStore.getQueueLength() >= MAX_QUEUE_SIZE) {
            fittingStore.deleteSession(sessionId);
            fittingStore.decrementUserCount(userId);
            throw new AppError(ErrorCode.TOO_MANY_REQUESTS, '현재 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.', StatusCodes.TOO_MANY_REQUESTS);
        }
        fittingStore.enqueue(sessionId);
    }

    return sessionId;
};

/**
 * 3D 피팅 작업의 현재 상태를 조회합니다.
 * 세션 소유권을 검증한 후 진행 상태와 결과 정보를 반환합니다.
 * @param userId
 * @param sessionId
 */
export const get3DFittingStatus = (userId: string, sessionId: string) => {
    const session = getSession(sessionId, userId);

    return {
        status: session.status,
        progress: session.progress,
        glbUrl: session.glbUrl ?? null,
        thumbnailUrl: session.thumbnailUrl ?? null,
    };
};

/**
 * 3D 피팅 결과(옷장 아카이브)의 제목을 변경합니다.
 * 소유권을 쿼리에 포함해(id + userId), 본인 소유가 아니거나 없으면 404를 반환합니다.
 * @param userId
 * @param closetArchiveId
 * @param titleInput
 */
export const updateFittingTitle = async (userId: string, closetArchiveId: string, titleInput: string): Promise<void> => {
    const { count } = await prisma.closetArchive.updateMany({
        where: { id: closetArchiveId, userId },
        data: { title: titleInput },
    });

    if (count === 0) {
        throw new AppError(ErrorCode.CLOSET_NOT_FOUND, '옷장 아카이브를 찾을 수 없습니다.', StatusCodes.NOT_FOUND);
    }
};

/**
 * Meshy가 내려준 glb를 우리 S3에 업로드한 뒤, closet_archive.model_url에 그 링크를 저장합니다.
 * @param userId
 * @param sessionId 저장할 피팅 세션 ID
 */
export const updateFittingModel = async (userId: string, sessionId: string): Promise<{ modelUrl: string }> => {
    const session = getSession(sessionId, userId);

    // 저장 가능한 상태(완료 + glb 존재) 확인
    if (session.status !== 'SUCCEEDED' || !session.glbUrl) {
        throw new AppError(ErrorCode.FITTING_IN_PROGRESS, '저장할 수 있는 3D 피팅 결과가 없습니다.', StatusCodes.CONFLICT);
    }

    // 업로드 전에 대상 아카이브 소유권/존재 확인 + 이전 model_url 확보 (orphan 방지)
    const archive = await prisma.closetArchive.findFirst({
        where: { id: session.closetArchiveId, userId },
        select: { modelUrl: true },
    });
    if (!archive) {
        throw new AppError(ErrorCode.CLOSET_NOT_FOUND, '옷장 아카이브를 찾을 수 없습니다.', StatusCodes.NOT_FOUND);
    }

    // Meshy glb 다운로드 → 우리 S3 업로드 (실패는 만료/업스트림 문제이므로 502로 매핑)
    let modelUrl: string;
    try {
        modelUrl = await uploadFittingModel(userId, session.glbUrl);
    } catch (err) {
        console.error(`[Fitting] glb 저장 실패 (${sessionId}):`, err);
        throw new AppError(ErrorCode.MESHY_API_ERROR, '3D 결과를 가져오지 못했습니다. (결과 링크가 만료되었을 수 있습니다)', StatusCodes.BAD_GATEWAY);
    }

    // closet_archive.model_url 저장 (소유권은 위 findFirst에서 검증됨)
    try {
        await prisma.closetArchive.update({
            where: { id: session.closetArchiveId },
            data: { modelUrl },
        });
    } catch (err) {
        // DB 반영 실패 시 방금 업로드한 객체 보상 삭제
        await deleteFittingModel(modelUrl);
        // 조회~수정 사이에 아카이브가 삭제된 경우(P2025)는 404로 매핑
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
            throw new AppError(ErrorCode.CLOSET_NOT_FOUND, '옷장 아카이브를 찾을 수 없습니다.', StatusCodes.NOT_FOUND);
        }
        throw err;
    }

    // 저장 성공 후 이전 모델 객체 정리 (재저장 시 orphan 방지)
    await deleteFittingModel(archive.modelUrl);

    return { modelUrl };
};

// ───────────────────────────── 2D 코디 생성 (Gemini) ─────────────────────────────
// 프롬프트 구성/파싱(순수 함수)은 ./fitting.prompt 로 분리되어 있다.

/** 코디 생성에 사용할 의류 1건 (캡처 이미지 + 메타데이터). measurements는 선택 사이즈 기준 납작한 치수다. */
type CoordiGarment = {
    category: ClothingType;
    image: Express.Multer.File;
    measurements: CoordiMeasurements;
    selectedSize?: string;
    brand: string;
    name: string;
    sourceUrl?: string;
};

/** 코디명 생성 프롬프트에 넘길 상품 표시명 ("브랜드 상품명"). 저장은 brand/name을 컬럼별로 따로 한다. */
function garmentDisplayName(g: CoordiGarment): string {
    return `${g.brand} ${g.name}`;
}

const AVATAR_FETCH_TIMEOUT_MS = 10_000; // 아바타 이미지가 무응답일 때 무한 대기 방지
const MAX_COORDI_PER_USER = 1; // 사용자당 동시 2D 코디 생성 수 (비용·메모리 폭증 방지)
// 전역 동시 2D 코디 생성 상한. 각 요청이 sharp 파이프라인 + base64 버퍼를 메모리에 들고 Gemini를 호출하므로,
// 트래픽이 몰리면 동시 호출이 폭증해 비용 스파이크·OOM으로 이어진다. 큐 없이 상한 초과 시 빠르게 429로 거절한다.
// (단일 프로세스 기준값. 멀티 인스턴스 전환 시 이 캡은 인스턴스별로 적용되므로 분산 세마포어로 올려야 한다.)
const MAX_CONCURRENT_COORDI = 5;
const COORDI_IDEMPOTENCY_TTL_MS = 10 * 60 * 1000; // 멱등성 키 보관 시간 (중복 제출 차단/결과 재반환)
const COORDI_CHARACTER_TEMPERATURE = 0.2; // 캐릭터: 색/디테일 재해석 억제 (보존 우선)
const COORDI_UPLOAD_TEMPERATURE = 0.5; // 업로드 사진: 원본 옷을 실제로 교체하도록 변형 자유도 부여 (옷 미교체 완화용 상향, 실험값)
const RESIZE_MAX_DIMENSION = 1024; // 의류 디테일(패턴·로고) 보존을 위해 입력 해상도 상향
// 색 틀어짐을 최소화하기 위해 고품질(q95)로 인코딩한다. (무손실 PNG는 사진 의류 이미지에서 용량이 과해 메모리 부담↑)
const RESIZE_JPEG_QUALITY = 95;

/** 업로드 이미지를 멀티모달 요청에 적합한 크기로 줄여 base64로 변환한다. */
async function toResizedBase64(buffer: Buffer): Promise<string> {
    return (
        await sharp(buffer)
            .resize(RESIZE_MAX_DIMENSION, RESIZE_MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: RESIZE_JPEG_QUALITY })
            .toBuffer()
    ).toString('base64');
}

// 의류 콘택트시트 레이아웃. 입력 이미지 "장수"가 늘수록 Gemini 생성이 급격히 느려져(=타임아웃),
// 의류를 라벨 붙인 한 장의 시트로 합쳐 항상 (인물 1 + 시트 1) = 2장만 보낸다.
const SHEET_CELL = 512; // 셀(의류 1칸) 한 변
const SHEET_LABEL_H = 56; // 셀 상단 라벨 띠 높이
const SHEET_MAX_COLS = 3; // 최대 열 수

/** 의류 이미지들을 카테고리 라벨이 붙은 그리드 한 장(JPEG base64)으로 합성한다. */
async function buildGarmentSheetBase64(garments: CoordiGarment[]): Promise<string> {
    const cols = Math.min(garments.length, SHEET_MAX_COLS);
    const rows = Math.ceil(garments.length / cols);
    const cellH = SHEET_CELL + SHEET_LABEL_H;

    // 각 셀: 상단 라벨 띠(SVG) + 흰 배경에 맞춘 의류 이미지
    const cells = await Promise.all(
        garments.map(async (g, i) => {
            const label = `${i + 1}. ${CATEGORY_EN[g.category]}`;
            const labelSvg = Buffer.from(
                `<svg width="${SHEET_CELL}" height="${SHEET_LABEL_H}">` +
                    `<rect width="100%" height="100%" fill="#eeeeee"/>` +
                    `<text x="${SHEET_CELL / 2}" y="${SHEET_LABEL_H / 2}" dy="0.35em" text-anchor="middle" ` +
                    `font-family="sans-serif" font-size="30" font-weight="bold" fill="#000">${label}</text></svg>`,
            );
            const garmentImg = await sharp(g.image.buffer)
                .resize(SHEET_CELL, SHEET_CELL, { fit: 'contain', background: '#ffffff' })
                .flatten({ background: '#ffffff' })
                .toBuffer();
            return sharp({ create: { width: SHEET_CELL, height: cellH, channels: 3, background: '#ffffff' } })
                .composite([
                    { input: labelSvg, top: 0, left: 0 },
                    { input: garmentImg, top: SHEET_LABEL_H, left: 0 },
                ])
                .png()
                .toBuffer();
        }),
    );

    const composites = cells.map((input, i) => ({
        input,
        left: (i % cols) * SHEET_CELL,
        top: Math.floor(i / cols) * cellH,
    }));

    return (
        await sharp({ create: { width: cols * SHEET_CELL, height: rows * cellH, channels: 3, background: '#ffffff' } })
            .composite(composites)
            .jpeg({ quality: RESIZE_JPEG_QUALITY })
            .toBuffer()
    ).toString('base64');
}

type CoordiContext = {
    avatarUrl: string;
    isUploadedImage: boolean; // true면 사용자가 올린 실제 사진, false면 프리셋 캐릭터(얼굴 없는 아바타)
    gender: string;
    height: number | null;
    weight: number | null;
    dbMeasurements: Record<string, number>;
};

/** 의류별 필수 치수를 검증한다. (measurements는 선택 사이즈 기준 납작한 치수) */
function validateGarments(garments: CoordiGarment[]): void {
    if (garments.length === 0) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, '의류가 최소 1개 필요합니다.', StatusCodes.BAD_REQUEST);
    }
    for (const g of garments) {
        if (Object.keys(g.measurements).length === 0) {
            throw new AppError(ErrorCode.VALIDATION_ERROR, `${CATEGORY_LABEL[g.category]} 치수 데이터가 필요합니다.`, StatusCodes.BAD_REQUEST);
        }
    }
}

/** 코디 생성에 필요한 아바타 URL과 신체/성별 정보를 조회한다. 아바타가 없으면 404. */
async function loadCoordiContext(userId: string): Promise<CoordiContext> {
    const [userCharacter, bodyInfo, profile] = await Promise.all([
        prisma.userCharacter.findUnique({
            where: { userId },
            // 프리셋 캐릭터: 화면 표시용 image_url은 누끼라, 코디 생성에는 배경 포함본(fitting_image_url)을 쓴다.
            select: { imageUrl: true, character: { select: { imageUrl: true, fittingImageUrl: true } } },
        }),
        prisma.bodyInfo.findFirst({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            select: { height: true, weight: true, measurements: true },
        }),
        prisma.profile.findUnique({ where: { userId }, select: { gender: true } }),
    ]);

    // UPLOAD면 userCharacter.imageUrl(사용자 사진), CHARACTER면 프리셋 아바타.
    // 프리셋은 코디 생성용 배경 포함본(fittingImageUrl)을 우선 쓰고, 없으면 표시용 image_url로 폴백한다.
    // 실제로 어떤 이미지를 보내는지와 정확히 일치하도록, 업로드 URL 존재 여부로 소스를 판별한다.
    const uploadedUrl = userCharacter?.imageUrl ?? null;
    const character = userCharacter?.character;
    const avatarUrl = uploadedUrl ?? character?.fittingImageUrl ?? character?.imageUrl;
    if (!avatarUrl) {
        throw new AppError(ErrorCode.FITTING_FAILED, '아바타 정보가 없습니다.', StatusCodes.NOT_FOUND);
    }

    const dbMeasurements =
        bodyInfo?.measurements && typeof bodyInfo.measurements === 'object' && !Array.isArray(bodyInfo.measurements)
            ? (bodyInfo.measurements as Record<string, number>)
            : {};

    return {
        avatarUrl,
        isUploadedImage: uploadedUrl !== null,
        gender: profile?.gender ?? '미제공',
        height: bodyInfo?.height ?? null,
        weight: bodyInfo?.weight ?? null,
        dbMeasurements,
    };
}

// Gemini 이미지 모델이 지원하는 출력 종횡비 [라벨, 가로/세로 값].
const SUPPORTED_ASPECT_RATIOS: Array<[string, number]> = [
    ['9:16', 9 / 16],
    ['2:3', 2 / 3],
    ['3:4', 3 / 4],
    ['1:1', 1],
    ['4:3', 4 / 3],
    ['3:2', 3 / 2],
    ['16:9', 16 / 9],
    ['21:9', 21 / 9],
];

/** 입력 이미지 비율에 가장 가까운 지원 종횡비를 고른다. (출력이 원본과 다른 비율로 잘리는 것 방지) */
function nearestAspectRatio(width: number, height: number): string {
    const ratio = width / height;
    let best = SUPPORTED_ASPECT_RATIOS[0];
    let bestDiff = Infinity;
    for (const entry of SUPPORTED_ASPECT_RATIOS) {
        const diff = Math.abs(Math.log(ratio / entry[1])); // 비율은 로그 스케일로 비교해야 비례적으로 가까운 값이 선택됨
        if (diff < bestDiff) {
            bestDiff = diff;
            best = entry;
        }
    }
    return best[0];
}

/** 생성 결과에서 입력 패딩분을 떼어내기 위한 크롭 영역(0~1 분율). */
type CropFractions = { left: number; top: number; width: number; height: number };

/** SUPPORTED_ASPECT_RATIOS 이름 → 수치(W/H). 못 찾으면 1. */
function aspectRatioValue(name: string): number {
    return SUPPORTED_ASPECT_RATIOS.find(([n]) => n === name)?.[1] ?? 1;
}

/**
 * 업로드 사진을 목표 비율(버킷)에 정확히 맞도록 가장자리 복제(extendWith:'copy') 패딩한다.
 * 입력 비율 == 출력 요청 비율이 되면 모델이 인물을 잘라 재구성하는 일이 줄고,
 * 생성 후 동일 분율로 패딩을 떼어내면(cropToFractions) 원본 비율을 정확히 복원할 수 있다.
 */
async function padUploadedToRatio(
    buffer: Buffer,
    width: number,
    height: number,
    targetRatio: number,
): Promise<{ buffer: Buffer; cropBack: CropFractions | null }> {
    const srcRatio = width / height;
    // 1% 이내면 이미 충분히 일치 → 패딩/크롭 불필요
    if (Math.abs(srcRatio - targetRatio) / targetRatio < 0.01) {
        return { buffer, cropBack: null };
    }
    if (srcRatio < targetRatio) {
        // 원본이 더 세로로 긺 → 좌우 패딩으로 가로를 늘린다
        const targetW = Math.round(height * targetRatio);
        const pad = targetW - width;
        const left = Math.floor(pad / 2);
        const padded = (await sharp(buffer)
            .extend({ left, right: pad - left, extendWith: 'copy' })
            .toBuffer()) as Buffer;
        return { buffer: padded, cropBack: { left: left / targetW, top: 0, width: width / targetW, height: 1 } };
    }
    // 원본이 더 가로로 긺 → 상하 패딩으로 세로를 늘린다
    const targetH = Math.round(width / targetRatio);
    const pad = targetH - height;
    const top = Math.floor(pad / 2);
    const padded = (await sharp(buffer)
        .extend({ top, bottom: pad - top, extendWith: 'copy' })
        .toBuffer()) as Buffer;
    return { buffer: padded, cropBack: { left: 0, top: top / targetH, width: 1, height: height / targetH } };
}

/** 생성 결과 버퍼에서 패딩분(분율)을 떼어내 원본 비율을 복원한다. 출력 포맷은 입력과 동일하게 유지. */
async function cropToFractions(buffer: Buffer, crop: CropFractions): Promise<Buffer> {
    const meta = await sharp(buffer).metadata();
    const W = meta.width ?? 1;
    const H = meta.height ?? 1;
    const left = Math.min(Math.round(crop.left * W), W - 1);
    const top = Math.min(Math.round(crop.top * H), H - 1);
    const width = Math.max(1, Math.min(Math.round(crop.width * W), W - left));
    const height = Math.max(1, Math.min(Math.round(crop.height * H), H - top));
    return (await sharp(buffer).extract({ left, top, width, height }).toBuffer()) as Buffer;
}

/**
 * 아바타(타임아웃 fetch)와 의류 시트를 리사이즈해 Gemini 멀티모달 parts를 만든다.
 * 인물 사진 비율에 맞춘 출력 종횡비(aspectRatio)도 함께 반환해 결과가 잘리지 않게 한다.
 * 업로드 사진은 버킷 비율에 맞춰 패딩해 보내고, 출력에서 떼어낼 cropBack 분율을 함께 반환한다.
 */
async function buildCoordiParts(
    avatarUrl: string,
    garments: CoordiGarment[],
    prompt: string,
    isUploadedImage: boolean,
): Promise<{ parts: object[]; aspectRatio: string; cropBack: CropFractions | null }> {
    let avatarResponse: Response;
    try {
        avatarResponse = await fetch(avatarUrl, { signal: AbortSignal.timeout(AVATAR_FETCH_TIMEOUT_MS) });
    } catch (err) {
        const timedOut = err instanceof Error && err.name === 'TimeoutError';
        throw new AppError(
            ErrorCode.FITTING_FAILED,
            timedOut ? '아바타 이미지 로딩 시간이 초과되었습니다.' : '아바타 이미지를 불러올 수 없습니다.',
            StatusCodes.BAD_GATEWAY,
        );
    }
    if (!avatarResponse.ok) {
        throw new AppError(ErrorCode.FITTING_FAILED, '아바타 이미지를 불러올 수 없습니다.', StatusCodes.BAD_GATEWAY);
    }

    // 인물 1장 + 의류 전체를 합친 콘택트시트 1장만 보낸다 (입력 장수 고정 → 생성 지연/타임아웃 방지)
    // 디코딩 실패는 소스별로 매핑한다: 아바타 원본은 우리 리소스 문제(502), 업로드 의류는 클라이언트 입력 문제(400).
    const avatarBuffer = Buffer.from(await avatarResponse.arrayBuffer());
    const meta = await sharp(avatarBuffer)
        .metadata()
        .catch((err) => {
            logger.warn('아바타 원본 디코딩 실패', { message: err instanceof Error ? err.message : String(err) });
            throw new AppError(ErrorCode.FITTING_FAILED, '아바타 이미지를 처리할 수 없습니다.', StatusCodes.BAD_GATEWAY);
        });
    const aspectRatio = nearestAspectRatio(meta.width ?? 1, meta.height ?? 1);

    // 업로드 사진은 버킷 비율과 원본 비율이 달라 모델이 인물을 잘라 재구성하는 문제가 있다.
    // 미리 버킷 비율로 패딩해 보내고(입력=출력 비율), 생성 후 cropBack으로 원본 비율을 복원한다.
    let subjectBuffer: Buffer = avatarBuffer;
    let cropBack: CropFractions | null = null;
    if (isUploadedImage) {
        const padded = await padUploadedToRatio(
            avatarBuffer,
            meta.width ?? 1,
            meta.height ?? 1,
            aspectRatioValue(aspectRatio),
        ).catch((err) => {
            logger.warn('업로드 사진 비율 패딩 실패, 원본 비율로 진행', {
                message: err instanceof Error ? err.message : String(err),
            });
            return { buffer: avatarBuffer, cropBack: null as CropFractions | null };
        });
        subjectBuffer = padded.buffer;
        cropBack = padded.cropBack;
    }

    const [avatarData, garmentSheet] = await Promise.all([
        toResizedBase64(subjectBuffer).catch((err) => {
            logger.warn('아바타 원본 리사이즈 실패', { message: err instanceof Error ? err.message : String(err) });
            throw new AppError(ErrorCode.FITTING_FAILED, '아바타 이미지를 처리할 수 없습니다.', StatusCodes.BAD_GATEWAY);
        }),
        buildGarmentSheetBase64(garments).catch((err) => {
            logger.warn('업로드 의류 이미지 처리 실패', { message: err instanceof Error ? err.message : String(err) });
            throw new AppError(ErrorCode.VALIDATION_ERROR, '업로드한 의류 이미지를 처리할 수 없습니다.', StatusCodes.BAD_REQUEST);
        }),
    ]);

    const parts: object[] = [
        { text: 'Image 1 — subject:' },
        { inlineData: { mimeType: 'image/jpeg', data: avatarData } },
        { text: 'Image 2 — garment contact sheet (each labeled cell is one garment to put on the subject):' },
        { inlineData: { mimeType: 'image/jpeg', data: garmentSheet } },
    ];

    // 프리셋 아바타는 배경이 매번 달라지는 문제가 있어, 고정 스튜디오 배경(Image 3)을 함께 줘 일관성을 높인다.
    // 업로드 실사진은 원본 배경을 그대로 유지해야 하므로 배경을 주지 않는다.
    if (!isUploadedImage) {
        parts.push(
            { text: 'Image 3 — background: the exact studio background to place the subject in.' },
            { inlineData: { mimeType: COORDI_BACKGROUND_MIME, data: COORDI_BACKGROUND_BASE64 } },
        );
    }

    parts.push({ text: prompt });

    return { parts, aspectRatio, cropBack };
}

/** Gemini 이미지 생성 호출. 전송 디테일은 lib/ai/gemini가 담당하고, 여기서는 실패 reason을 HTTP 상태로 매핑한다. */
async function runGemini(parts: object[], opts: ImageGenOptions): Promise<{ data: string; mimeType: string }> {
    try {
        return await generateMultimodalImage(parts, opts);
    } catch (err) {
        if (err instanceof GeminiApiError && err.reason === 'TIMEOUT') {
            throw new AppError(ErrorCode.GEMINI_API_ERROR, 'Gemini 응답 타임아웃', StatusCodes.GATEWAY_TIMEOUT);
        }
        // 모델 측 일시 과부하(503)·레이트리밋(429): 즉시 실패시키고 잠시 후 재시도를 안내한다.
        if (err instanceof GeminiApiError && err.reason === 'OVERLOADED') {
            throw new AppError(
                ErrorCode.GEMINI_API_ERROR,
                '현재 AI 이미지 생성 요청이 많아 일시적으로 처리할 수 없습니다. 잠시 후 다시 시도해주세요.',
                StatusCodes.SERVICE_UNAVAILABLE,
            );
        }
        throw new AppError(ErrorCode.GEMINI_API_ERROR, '코디 이미지 생성에 실패했습니다.', StatusCodes.BAD_GATEWAY);
    }
}

/**
 * 코디명을 텍스트 모델로 별도 생성한다 (이미지 생성과 분리해 이미지 누락을 방지).
 * 실패해도 코디 자체는 성공해야 하므로, 에러 시 기본값으로 폴백한다.
 */
async function generateOutfitName(garments: CoordiGarment[]): Promise<string> {
    try {
        const text = await generateText(
            buildOutfitNamePrompt(garments.map((g) => ({ category: g.category, title: garmentDisplayName(g) }))),
        );
        return parseOutfitName(text);
    } catch (err) {
        console.error('[Coordi] 코디명 생성 실패, 기본값 사용:', err);
        return parseOutfitName(''); // 빈 입력 → 기본 코디명
    }
}

/**
 * 코디 결과 + 각 캡처 의류 이미지를 S3에 올린다.
 * 부분 실패 시 성공분을 보상 삭제하고 throw하여 orphan을 막는다.
 * 반환: [코디 이미지, ...garments와 동일 순서의 의류 이미지]
 */
async function uploadCoordiImages(
    userId: string,
    coordiBuffer: Buffer,
    coordiContentType: string,
    garments: CoordiGarment[],
): Promise<{ coordiImageUrl: string; clothingImageUrls: string[] }> {
    const settled = await Promise.allSettled([
        uploadClosetImage(userId, coordiBuffer, coordiContentType, 'coordi'),
        ...garments.map((g) => uploadClosetImage(userId, g.image.buffer, g.image.mimetype || 'image/jpeg', 'clothing')),
    ]);

    const uploadedUrls = settled
        .filter((s): s is PromiseFulfilledResult<string> => s.status === 'fulfilled')
        .map((s) => s.value);
    const rejected = settled.filter((s): s is PromiseRejectedResult => s.status === 'rejected');

    if (rejected.length > 0) {
        await Promise.all(uploadedUrls.map(deleteClosetImage));
        console.error('[Coordi] 이미지 업로드 실패:', rejected.map((r) => r.reason));
        throw new AppError(ErrorCode.FITTING_FAILED, '코디 이미지 저장에 실패했습니다.', StatusCodes.BAD_GATEWAY);
    }

    return { coordiImageUrl: uploadedUrls[0], clothingImageUrls: uploadedUrls.slice(1) };
}

/** closet_archive + closet_items 저장. 실패 시 업로드된 S3 객체를 보상 삭제하고 throw. */
async function persistCoordi(
    userId: string,
    params: {
        coordiImageUrl: string;
        clothingImageUrls: string[];
        outfitName: string;
        height: number | null;
        weight: number | null;
        garments: CoordiGarment[];
    },
): Promise<string> {
    const { coordiImageUrl, clothingImageUrls, outfitName, height, weight, garments } = params;
    try {
        const archive = await prisma.closetArchive.create({
            data: {
                userId,
                imageUrl: coordiImageUrl,
                title: outfitName,
                bodyInfo: { height, weight }, // body_info에는 신체 정보만 기록
                closetItems: {
                    create: garments.map((g, i) => ({
                        brand: g.brand,
                        name: g.name,
                        imageUrl: clothingImageUrls[i],
                        externalLink: g.sourceUrl ?? null,
                        type: g.category,
                        size: g.selectedSize ?? null,
                    })),
                },
            },
            select: { id: true },
        });
        return archive.id;
    } catch (err) {
        // DB 저장 실패 시 방금 업로드한 S3 객체 보상 삭제 (orphan 방지)
        await Promise.all([coordiImageUrl, ...clothingImageUrls].map(deleteClosetImage));
        console.error('[Coordi] 옷장 아카이브 저장 실패:', err);
        throw new AppError(ErrorCode.FITTING_FAILED, '코디 저장에 실패했습니다.', StatusCodes.INTERNAL_SERVER_ERROR);
    }
}

/**
 * 코디 생성 본체. 검증 → 컨텍스트 조회 → 프롬프트/파트 구성 → Gemini 생성 → S3 업로드 → DB 저장.
 * 동시성·멱등성 제어는 호출부(generateCoordi)가 담당하고, 여기서는 순수 처리 흐름만 둔다.
 */
async function runCoordiGeneration(userId: string, garments: CoordiGarment[]): Promise<CoordiResult> {
    const ctx = await loadCoordiContext(userId);

    const prompt = buildCoordiPrompt({
        gender: ctx.gender,
        height: ctx.height,
        weight: ctx.weight,
        bodyMeasurements: ctx.dbMeasurements,
        garments,
        isUploadedImage: ctx.isUploadedImage,
    });
    const { parts, aspectRatio, cropBack } = await buildCoordiParts(ctx.avatarUrl, garments, prompt, ctx.isUploadedImage);

    // 업로드 사진은 "옷 교체"를 실제로 일으키려면 자유도(temperature)가 더 필요하다.
    // 캐릭터는 색/디테일 보존을 위해 낮게 유지한다.
    const temperature = ctx.isUploadedImage ? COORDI_UPLOAD_TEMPERATURE : COORDI_CHARACTER_TEMPERATURE;

    // 이미지(image 모델)와 코디명(text 모델)을 분리·병렬 실행. 코디명은 실패해도 기본값으로 폴백된다.
    const geminiStartedAt = Date.now();
    const [generated, outfitName] = await Promise.all([
        runGemini(parts, { aspectRatio, temperature }),
        generateOutfitName(garments),
    ]);
    const geminiMs = Date.now() - geminiStartedAt;

    let coordiBuffer: Buffer = Buffer.from(generated.data, 'base64');
    const coordiContentType = generated.mimeType.startsWith('image/') ? generated.mimeType : 'image/png';
    // 업로드 사진: 전송 전 넣은 패딩분을 떼어내 원본 비율을 복원한다. 실패해도 코디 자체는 살린다(패딩 포함본 사용).
    if (cropBack) {
        coordiBuffer = await cropToFractions(coordiBuffer, cropBack).catch((err) => {
            logger.warn('업로드 사진 결과 크롭(비율 복원) 실패, 패딩 포함본 사용', {
                message: err instanceof Error ? err.message : String(err),
            });
            return coordiBuffer;
        });
    }
    const { coordiImageUrl, clothingImageUrls } = await uploadCoordiImages(userId, coordiBuffer, coordiContentType, garments);

    const closetArchiveId = await persistCoordi(userId, {
        coordiImageUrl,
        clothingImageUrls,
        outfitName,
        height: ctx.height,
        weight: ctx.weight,
        garments,
    });

    // #6 관측: Gemini 호출 지연을 분리해 기록 (지연 원인 진단용)
    console.log('[Coordi] Gemini 생성 완료', { userId, garmentCount: garments.length, geminiMs });

    return { closetArchiveId, imageUrl: coordiImageUrl, outfitName };
}

/**
 * 2D 코디 이미지를 생성하고 옷장 아카이브에 저장한다.
 * 사용자당 동시 생성 수를 제한(#1)하고, Idempotency-Key로 중복 제출을 차단(#4)하며,
 * 처리 시간·결과를 구조화 로깅(#6)한다. 실제 생성 흐름은 runCoordiGeneration이 담당한다.
 * @param userId
 * @param garments  카테고리 순서로 들어오는 의류(이미지 + 치수 + 상품 정보). 최대 5개.
 * @param idempotencyKey  선택. 동일 키 재요청 시 진행 중이면 409, 완료됐으면 캐시된 결과를 반환.
 */
export const generateCoordi = async (
    userId: string,
    garments: CoordiGarment[],
    idempotencyKey?: string,
): Promise<CoordiResult> => {
    validateGarments(garments); // 카운터 선점 전에 저렴한 검증부터 (400 빠른 실패)

    const idemKey = idempotencyKey ? `${userId}:${idempotencyKey}` : null;

    // #4 멱등성: 동일 키 재요청 처리 (만료 전 레코드만 유효)
    if (idemKey) {
        const existing = fittingStore.getIdempotency(idemKey);
        if (existing && existing.expiresAt > Date.now()) {
            if (existing.status === 'done') return existing.result; // 완료된 결과 재반환
            throw new AppError(ErrorCode.FITTING_IN_PROGRESS, '동일한 요청이 이미 처리 중입니다.', StatusCodes.CONFLICT);
        }
    }

    // #1-a 전역 동시 2D 생성 상한 — 비용·메모리(OOM) 폭증 방지. 초과 시 큐 없이 빠르게 429로 거절.
    // 사용자별 제한보다 먼저 확인해, 전역이 꽉 차면 카운터를 건드리기 전에 즉시 빠져나간다.
    if (fittingStore.getActiveCoordiCount() >= MAX_CONCURRENT_COORDI) {
        throw new AppError(ErrorCode.TOO_MANY_REQUESTS, '현재 코디 생성 요청이 많습니다. 잠시 후 다시 시도해주세요.', StatusCodes.TOO_MANY_REQUESTS);
    }

    // #1-b 사용자당 동시 2D 생성 제한 (await 이전에 선점)
    if (fittingStore.getCoordiCount(userId) >= MAX_COORDI_PER_USER) {
        throw new AppError(ErrorCode.FITTING_IN_PROGRESS, '이미 진행 중인 코디 생성이 있습니다.', StatusCodes.CONFLICT);
    }
    // 두 카운터는 await 없이 연속 증가시켜 단일 프로세스에서 원자적으로 선점한다.
    fittingStore.incrementCoordiCount(userId);
    fittingStore.incrementActiveCoordiCount();

    const idemExpiresAt = Date.now() + COORDI_IDEMPOTENCY_TTL_MS;
    if (idemKey) {
        fittingStore.setIdempotency(idemKey, { status: 'pending', expiresAt: idemExpiresAt });
        setTimeout(() => fittingStore.deleteIdempotency(idemKey), COORDI_IDEMPOTENCY_TTL_MS);
    }

    const startedAt = Date.now();
    try {
        const result = await runCoordiGeneration(userId, garments);
        if (idemKey) fittingStore.setIdempotency(idemKey, { status: 'done', result, expiresAt: idemExpiresAt });
        
        createFitCompleteNotification({
            receiverId: userId,
            dimension: '2D',
            closetArchiveId: result.closetArchiveId,
        }).catch((err) => console.error('[Coordi] 알림 전송 실패', { userId, error: err }));
        
        console.log('[Coordi] 생성 성공', { userId, garmentCount: garments.length, durationMs: Date.now() - startedAt });
        return result;
    } catch (err) {
        // 실패 시 pending 제거 → 클라이언트가 같은 키로 재시도 가능
        if (idemKey) fittingStore.deleteIdempotency(idemKey);
        console.error('[Coordi] 생성 실패', { userId, garmentCount: garments.length, durationMs: Date.now() - startedAt, error: err });
        throw err;
    } finally {
        fittingStore.decrementCoordiCount(userId);
        fittingStore.decrementActiveCoordiCount();
    }
};