import { EventEmitter } from 'node:events';
import prisma from '@/lib/prisma/extensions';
import { buildPaginationResult } from '@/common/utils/pagination';
import { NotificationType } from '@prisma/client';
import type {
  GetNotificationsQuery,
  GetNotificationsResponse,
  NotificationDto,
  NotificationSettingsResponse,
  UpdateNotificationSettingsBody,
} from './notifications.schema';
import { CreateNotificationInput, RawNotification } from './notifications.types';
import { ErrorCode } from '@/common/errors/error-code';
import { AppError } from '@/common/errors/app-error';
import { StatusCodes } from 'http-status-codes';
import { sendExpoPush } from '@/lib/expo-push';

// SSE 이벤트 허브
export const notificationEmitter = new EventEmitter();
notificationEmitter.setMaxListeners(0);

const userChannel = (userId: string) => `user:${userId}`;

// 알림 객체 형태로 변환
export const toNotificationDto = (
  n: RawNotification,
  refs: { post?: { id: string; image: string | null } | null } = {},
): NotificationDto => {
  const actor = n.actor
    ? { id: n.actor.id, nickname: n.actor.profile?.nickname ?? null, imageUrl: n.actor.profile?.imageUrl ?? null }
    : null;

  const isActorType =
    n.type === 'LIKE' || n.type === 'FOLLOW' || n.type === 'FEED_FROM_FOLLOWING';
  const isPostType = n.type === 'LIKE' || n.type === 'FEED_FROM_FOLLOWING';
  const isArchiveType =
    n.type === 'FIT_2D_COMPLETE' || n.type === 'FIT_3D_COMPLETE';

  return {
    id: n.id,
    type: n.type,
    message: n.message,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
    actor: isActorType ? actor : null,
    post: isPostType ? refs.post ?? null : null,
    closetArchive: isArchiveType && n.targetId ? { id: n.targetId } : null,
  };
};

// 조회
export const getNotifications = async (
  userId: string,
  query: GetNotificationsQuery,
): Promise<GetNotificationsResponse> => {
  const { cursor, limit } = query;

  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { receiverId: userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        actor: { select: { id: true, profile: { select: { nickname: true, imageUrl: true } } } },
      },
    }),
    prisma.notification.count({
      where: { receiverId: userId, isRead: false },
    }),
  ]);

  const { data, nextCursor, hasMore } = buildPaginationResult(rows, limit);

  // targetId 타입별로 한 번씩 배치 로드
  const postIds = data
    .filter((n) => n.type === 'LIKE' || n.type === 'FEED_FROM_FOLLOWING')
    .map((n) => n.targetId)
    .filter((id): id is string => Boolean(id));

  const posts = postIds.length
    ? await prisma.post.findMany({
        where: { id: { in: postIds } },
        select: {
          id: true,
          postImages: { orderBy: { order: 'asc' }, take: 1, select: { imageUrl: true } },
        },
      })
    : [];

  const postMap = new Map(
    posts.map((p) => [p.id, { id: p.id, image: p.postImages[0]?.imageUrl ?? null }]),
  );

  return {
    unreadCount,
    data: data.map((it) => toNotificationDto(it, {
      post: it.targetId ? postMap.get(it.targetId) ?? null : null,
    })),
    nextCursor,
    hasMore,
  };
};

// 전체 알림 읽음
export const markAllAsRead = async (userId: string): Promise<void> => {
  await prisma.notification.updateMany({
    where: { receiverId: userId, isRead: false },
    data: { isRead: true },
  });
};

// 알림 설정 조회
export const getSettings = async (
  userId: string,
): Promise<NotificationSettingsResponse> => {
  const setting = await prisma.notificationSetting.findUnique({
    where: { userId },
  });

  if (!setting) {
    throw new AppError(ErrorCode.NOTIFICATION_SETTING_NOT_FOUND, '해당 유저의 알림 설정 정보가 존재하지 않습니다.', StatusCodes.INTERNAL_SERVER_ERROR);
  }

  return { enabled: setting.pushEnabled };
};

// 알림 설정 변경
export const updateSettings = async (
  userId: string,
  body: UpdateNotificationSettingsBody,
): Promise<NotificationSettingsResponse> => {
  const setting = await prisma.notificationSetting.upsert({
    where: { userId },
    create: { userId, pushEnabled: body.enabled },
    update: { pushEnabled: body.enabled },
  });
  return { enabled: setting.pushEnabled };
};

// 알림 전체 삭제
export const deleteAll = async (userId: string): Promise<void> => {
  await prisma.notification.deleteMany({
    where: { receiverId: userId },
  });
};

// 알림 개별 삭제
export const deleteOne = async (userId: string, id: string): Promise<void> => {
  await prisma.notification.deleteMany({
    where: { id, receiverId: userId },
  });
};

// 알림 생성 서비스
const createNotification = async (
  input: CreateNotificationInput,
): Promise<void> => {
  const created = await prisma.notification.create({
    data: {
      receiverId: input.receiverId,
      type: input.type,
      message: input.message,
      actorId: input.actorId ?? null,
      targetId: input.targetId ?? null,
    },
    include: {
      actor: { select: { id: true, profile: { select: { nickname: true, imageUrl: true } } } },
    },
  });

  const setting = await prisma.notificationSetting.findUnique({
    where: { userId: input.receiverId },
  });
  if (setting?.pushEnabled === false) return;

  let post: { id: string; image: string | null } | null = null;
  if (
    (created.type === 'LIKE' || created.type === 'FEED_FROM_FOLLOWING') &&
    created.targetId
  ) {
    const p = await prisma.post.findUnique({
      where: { id: created.targetId },
      select: {
        id: true,
        closetArchive: { select: { imageUrl: true } },
      },
    });
    post = p ? { id: p.id, image: p.closetArchive?.imageUrl ?? null } : null;
  }
  const dto = toNotificationDto(created, { post });

  notificationEmitter.emit(userChannel(input.receiverId), dto); // SSE 팬아웃
  sendPushToUser(input.receiverId, dto); // 백그라운드 알림 전송
};

// 좋아요 알림
export const createLikeNotification = async (params: {
  actorId: string;
  postId: string;
}) => {
  const [post, actorProfile] = await Promise.all([
    prisma.post.findUnique({
      where: { id: params.postId },
      select: { userId: true },
    }),
    prisma.profile.findUnique({
      where: { userId: params.actorId },
      select: { nickname: true },
    }),
  ]);

  if (!post || !actorProfile || post.userId === params.actorId) return;

  return createNotification({
    receiverId: post.userId,
    type: NotificationType.LIKE,
    message: `${actorProfile.nickname}님이 회원님의 게시물을 좋아합니다.`,
    actorId: params.actorId,
    targetId: params.postId,
  });
};

// 팔로우 알림
export const createFollowNotification = (params: {
  receiverId: string;
  actorId: string;
  actorNickname: string;
}) =>
  createNotification({
    receiverId: params.receiverId,
    type: NotificationType.FOLLOW,
    message: `${params.actorNickname}님이 회원님을 팔로우하기 시작했습니다.`,
    actorId: params.actorId,
    targetId: params.actorId,
  });

// post 획득
const getNotificationPost = async (
  postId: string,
): Promise<{ id: string; image: string | null } | null> => {
  const p = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      closetArchive: { select: { imageUrl: true } },
    },
  });
  return p ? { id: p.id, image: p.closetArchive?.imageUrl ?? null } : null;
};

// 다수에게 알림
const createFanoutNotification = async (input: {
  receiverIds: string[];
  type: NotificationType;
  message: string;
  actorId: string;
  targetId: string;
}): Promise<void> => {
  if (input.receiverIds.length === 0) return;

  // 공통 데이터 조회
  const [post, pushDisabledSettings] = await Promise.all([
    input.type === NotificationType.FEED_FROM_FOLLOWING ? getNotificationPost(input.targetId) : null,
    prisma.notificationSetting.findMany({
      where: { userId: { in: input.receiverIds }, pushEnabled: false },
      select: { userId: true },
    }),
  ]);

  const created = await prisma.notification.createManyAndReturn({
    data: input.receiverIds.map((receiverId) => ({
      receiverId,
      type: input.type,
      message: input.message,
      actorId: input.actorId,
      targetId: input.targetId,
    })),
    include: {
      actor: { select: { id: true, profile: { select: { nickname: true, imageUrl: true } } } },
    },
  });

  // push 꺼진 수신자는 SSE 제외
  const pushDisabled = new Set(pushDisabledSettings.map((s) => s.userId));

  for (const n of created) {
    if (pushDisabled.has(n.receiverId)) continue;
    notificationEmitter.emit(userChannel(n.receiverId), toNotificationDto(n, { post }));
  }
};

// 팔로잉 피드 알림
export const createFeedNotification = async (params: {
  actorId: string;
  postId: string;
}) => {
  const [actorProfile, followers] = await Promise.all([
    prisma.profile.findUnique({
      where: { userId: params.actorId },
      select: { nickname: true },
    }),
    prisma.follow.findMany({
      where: { followingId: params.actorId },
      select: { followerId: true },
    }),
  ]);

  if (!actorProfile || followers.length === 0) return;

  await createFanoutNotification({
    receiverIds: followers.map((f) => f.followerId),
    type: NotificationType.FEED_FROM_FOLLOWING,
    message: `${actorProfile.nickname}님이 새 게시물을 올렸습니다.`,
    actorId: params.actorId,
    targetId: params.postId,
  });
};

// 모델 완료 알림
export const createFitCompleteNotification = (params: {
  receiverId: string;
  dimension: '2D' | '3D';
  closetArchiveId: string;
}) =>
  createNotification({
    receiverId: params.receiverId,
    type:
      params.dimension === '2D'
        ? NotificationType.FIT_2D_COMPLETE
        : NotificationType.FIT_3D_COMPLETE,
    message: `${params.dimension} 피팅 모델이 완성되었습니다.`,
    targetId: params.closetArchiveId,
  });

// 토큰 등록
export const registerDeviceToken = async (
  userId: string,
  token: string,
): Promise<void> => {
  await prisma.deviceToken.upsert({
    where: { token },
    create: { userId, token },
    update: { userId },
  });
};

// 토큰 삭제
export const removeDeviceToken = async (token: string, userId: string): Promise<void> => {
  await prisma.deviceToken.deleteMany({
    where: { token, userId },
  });
};

// 백그라운드 알림 전송
const sendPushToUser = async (
  receiverId: string,
  dto: NotificationDto,
): Promise<void> => {
  const tokens = await prisma.deviceToken.findMany({
    where: { userId: receiverId },
    select: { token: true },
  });
  if (!tokens.length) return;

  const { invalidTokens } = await sendExpoPush(
    tokens.map((t) => ({
      to: t.token,
      title: '알림', // 필요하면 타입별로 분기 가능
      body: dto.message,
      data: {
        notificationId: dto.id,
        type: dto.type,
        actor: { id: dto.actor?.id },
        post: { id: dto.post?.id } ,
        closetArchive: { id: dto.closetArchive?.id },
      },
    })),
  );

  // 죽은 토큰 정리
  if (invalidTokens.length) {
    await prisma.deviceToken.deleteMany({
      where: { token: { in: invalidTokens } },
    });
  }
};