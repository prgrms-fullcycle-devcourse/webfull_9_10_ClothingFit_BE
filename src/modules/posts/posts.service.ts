
import prisma from '@/lib/prisma/extensions';
import { buildPaginationResult } from '@/common/utils/pagination';
import type { GetPostsQuery } from './posts.schema';
import { AppError } from '@/common/errors/app-error';
import { ErrorCode } from '@/common/errors/error-code';
import { StatusCodes } from 'http-status-codes';
import { createLikeNotification } from '../notifications/notifications.service';

// 게시글 목록 조회 (필터/정렬/검색)
export const getPostsService = async (query: GetPostsQuery, userId: string) => {
  const { follow, gender, sort, keyword, height, weightMin, weightMax, cursor, limit } = query;

  const hasBodyFilter = height !== undefined || weightMin !== undefined || weightMax !== undefined;

  const orderBy =
    sort === 'LIKE'
      ? { postLikes: { _count: 'desc' as const } }
      : { createdAt: sort === 'OLDEST' ? ('asc' as const) : ('desc' as const) };

  const results = await prisma.post.findMany({
    where: {
      deletedAt: null,
      user: {
        ...(follow && {
          followers: {
            some: { followerId: userId },
          }
        }),
        profile: {
          ...(gender && { gender }),
          ...(keyword && { nickname: { contains: keyword, mode: 'insensitive' } }),
        },
        ...(hasBodyFilter && {
          bodyInfo: {
            is: {
              ...(height !== undefined && { height }),
              ...((weightMin !== undefined || weightMax !== undefined) && {
                weight: {
                  ...(weightMin !== undefined && { gte: weightMin }),
                  ...(weightMax !== undefined && { lte: weightMax }),
                },
              }),
            },
          },
        }),
      },
    },
    orderBy,
    take: limit + 1, // hasMore 판별용
    select: {
      id: true,
      user: {
        select: {
          profile: { select: { nickname: true } }
        }
      },
      closetArchive: {
        select: { imageUrl: true },
      },
      _count: {
        select: {
          postLikes: true,
          postBookmarks: true,
        }
      },
      postLikes: {
        where: { userId },
        select: { id: true },
        take: 1,
      },
      postBookmarks: {
        where: { userId },
        select: { id: true },
        take: 1,
      },
    },
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  });

  const items = results.map((item) => ({
      id: item.id,
      nickname: item.user.profile?.nickname ?? null,
      imageUrl: item.closetArchive?.imageUrl ?? null,
      likeCount: item._count.postLikes,
      isLiked: item.postLikes.length > 0,
      bookmarkCount: item._count.postBookmarks,
      isBookmarked: item.postBookmarks.length > 0,
  }));

  return buildPaginationResult(items, limit);
};

// 게시글 상세 조회
export const getPostByIdService = async (id: string, userId: string) => {
  const post = await prisma.post.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      createdAt: true,

      user: {
        select: {
          id: true,
          profile: { select: { nickname: true, imageUrl: true } },
          followers: {
            where: { followerId: userId },
            select: { id: true },
            take: 1,
          },
          posts: {
            where: { id: { not: id }, deletedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 8,
            select: {
              id: true,
              closetArchive: { select: { imageUrl: true } },
              _count: { select: { postLikes: true } },
              postLikes: { where: { userId: userId }, select: { id: true }, take: 1 },
            },
          },
        },
      },

      closetArchive: {
        select: {
          imageUrl: true,
          modelUrl: true,
          bodyInfo: true,
          title: true,
          closetItems: {
            select: {
              imageUrl: true,
              brand: true,
              name: true,
              size: true,
              externalLink: true,
              type: true,
            },
          },
        },
      },

      postImages: {
        orderBy: { order: 'asc' },
        select: { imageUrl: true, order: true },
      },

      _count: { select: { postLikes: true, postBookmarks: true } },
      postLikes: { where: { userId: userId }, select: { id: true }, take: 1 },
      postBookmarks: { where: { userId: userId }, select: { id: true }, take: 1 },
    },
  });

  if (!post) throw new AppError(ErrorCode.POST_NOT_FOUND, '게시글이 존재하지 않습니다.', StatusCodes.NOT_FOUND);

  // 최근 조회 기록 저장 (upsert로 원자적 처리 → 동시 요청 시 race condition 방지)
  await prisma.postView.upsert({
    where: { userId_postId: { userId, postId: id } },
    update: { createdAt: new Date() },
    create: { userId, postId: id },
  });

  const bodyInfo = post.closetArchive?.bodyInfo as { height?: number; weight?: number } | null;

  return {
    id: post.id,
    createdAt: post.createdAt,
    title: post.closetArchive?.title ?? null,
    user: {
      id: post.user.id,
      nickname: post.user.profile?.nickname ?? null,
      imageUrl: post.user.profile?.imageUrl ?? null,
      height: bodyInfo?.height ?? null,
      weight: bodyInfo?.weight ?? null,
      isFollowing: post.user.followers.length > 0,
    },
    image2dUrl: post.closetArchive?.imageUrl ?? null,
    model3dUrl: post.closetArchive?.modelUrl ?? null,
    images: post.postImages.map((img) => img.imageUrl),
    likeCount: post._count.postLikes,
    isLiked: post.postLikes.length > 0,
    bookmarkCount: post._count.postBookmarks,
    isBookmarked: post.postBookmarks.length > 0,
    items: post.closetArchive?.closetItems.map((it) => ({
      imageUrl: it.imageUrl,
      brand: it.brand,
      name: it.name,
      size: it.size,
      link: it.externalLink,
      type: it.type,
    })) ?? [],
    otherPosts: post.user.posts.map((p) => ({
      id: p.id,
      imageUrl: p.closetArchive?.imageUrl ?? null,
      likeCount: p._count.postLikes,
      isLiked: p.postLikes.length > 0,
    })),
  };
};

// 게시글 삭제 (소프트딜리트)
export const deletePostService = async (id: string, userId: string): Promise<void> => {
  const post = await prisma.post.findUnique({ where: { id } });

  if (!post || post.deletedAt) {
    throw new AppError(ErrorCode.POST_NOT_FOUND, '게시글이 존재하지 않습니다.', StatusCodes.NOT_FOUND);
  }

  if (post.userId !== userId) {
    throw new AppError(ErrorCode.NOT_POST_OWNER, '게시글을 삭제할 권한이 없습니다.', StatusCodes.FORBIDDEN);
  }

  await prisma.post.update({ where: { id }, data: { deletedAt: new Date(), closetArchiveId: null } });
};

// 좋아요
export const likePostService = async (userId: string, postId: string) => {
  const [, likeCount] = await prisma.$transaction([
    prisma.postLike.upsert({
      where: { userId_postId: { userId, postId } },
      create: { userId, postId },
      update: {},
    }),
    prisma.postLike.count({
      where: { postId },
    }),
  ]);

  createLikeNotification({
    actorId: userId,
    postId,
  });

  return { liked: true, likeCount };
};

// 좋아요 취소
export const unlikePostService = async (userId: string, postId: string) => {
  const [, likeCount] = await prisma.$transaction([
    prisma.postLike.deleteMany({
      where: { userId, postId },
    }),
    prisma.postLike.count({
      where: { postId },
    }),
  ]);

  return { liked: false, likeCount };
};

// 북마크
export const bookmarkPostService = async (userId: string, postId: string) => {
  const [, bookmarkCount] = await prisma.$transaction([
    prisma.postBookmark.upsert({
      where: { userId_postId: { userId, postId } },
      create: { userId, postId },
      update: {},
    }),
    prisma.postBookmark.count({
      where: { postId },
    }),
  ]);

  return { bookmarked: true, bookmarkCount };
};

// 북마크 취소
export const unbookmarkPostService = async (userId: string, postId: string) => {
  const [, bookmarkCount] = await prisma.$transaction([
    prisma.postBookmark.deleteMany({
      where: { userId, postId },
    }),
    prisma.postBookmark.count({
      where: { postId },
    }),
  ]);

  return { bookmarked: false, bookmarkCount };
};