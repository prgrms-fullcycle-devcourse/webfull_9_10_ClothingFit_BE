import { Upload } from '@aws-sdk/lib-storage';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { uuidv7 } from 'uuidv7';
import { env } from '@/config/env';
import { s3Client, S3_BUCKET } from './s3';

const S3_PUBLIC_PREFIX = `https://${S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/`;
const MODEL_PREFIX = 'fitting-models/';

// Meshy CDN이 응답하지 않을 때 무한 대기를 막기 위한 glb 다운로드 타임아웃
const GLB_FETCH_TIMEOUT_MS = 60_000;

/**
 * Meshy가 생성한 glb 모델을 우리 S3에 영속화하고 공개 URL을 반환합니다.
 * Meshy CDN URL은 만료성이므로, 피팅 완료(SUCCEEDED) 직후 저장하는 용도입니다.
 * 다운로드 → 업로드를 스트리밍(멀티파트)으로 흘려보내 glb 크기와 무관하게 일정 메모리만 사용합니다.
 * @param userId  S3 키 네임스페이스
 * @param sourceUrl  Meshy가 내려준 glb URL
 */
export const uploadFittingModel = async (userId: string, sourceUrl: string): Promise<string> => {
    let res: Response;
    try {
        res = await fetch(sourceUrl, { signal: AbortSignal.timeout(GLB_FETCH_TIMEOUT_MS) });
    } catch (err) {
        if (err instanceof Error && err.name === 'TimeoutError') {
            throw new Error(`glb 다운로드 타임아웃 (${GLB_FETCH_TIMEOUT_MS}ms 초과)`);
        }
        throw err;
    }
    if (!res.ok || !res.body) {
        throw new Error(`glb 다운로드 실패 (${res.status})`);
    }

    const key = `${MODEL_PREFIX}${userId}/${uuidv7()}.glb`;
    await new Upload({
        client: s3Client,
        params: {
            Bucket: S3_BUCKET,
            Key: key,
            Body: Readable.fromWeb(res.body), // 웹 ReadableStream → Node 스트림
            ContentType: 'model/gltf-binary',
        },
    }).done();

    return `${S3_PUBLIC_PREFIX}${key}`;
};

/**
 * 우리가 관리하는 fitting-models/ S3 객체를 삭제합니다 (교체/보상 정리용).
 * 정리 목적이라 실패해도 throw하지 않고 로깅만 합니다(best-effort).
 * 우리 버킷의 fitting-models/ 객체가 아니면 아무것도 하지 않습니다.
 */
export const deleteFittingModel = async (url: string | null | undefined): Promise<void> => {
    if (!url || !url.startsWith(S3_PUBLIC_PREFIX)) return;
    const key = url.slice(S3_PUBLIC_PREFIX.length);
    if (!key.startsWith(MODEL_PREFIX)) return;
    try {
        await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    } catch (err) {
        console.error('[FittingModel] 이전 S3 객체 삭제 실패:', err);
    }
};
