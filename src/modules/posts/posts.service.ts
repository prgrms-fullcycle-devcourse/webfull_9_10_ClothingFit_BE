
import prisma from '@/lib/prisma/extensions';
import { buildPaginationResult } from '@/common/utils/pagination';
import type { GetPostsQuery } from './posts.schema';
import { AppError } from '@/common/errors/app-error';
import { ErrorCode } from '@/common/errors/error-code';
import { StatusCodes } from 'http-status-codes';

// 게시글 목록 조회 (필터/정렬/검색)
export const getPostsService = async (query: GetPostsQuery, userId: string) => {
  const { follow, gender, sort, keyword, height, weightMin, weightMax, cursor, limit } = query;

  const hasBodyFilter = height !== undefined || weightMin !== undefined || weightMax !== undefined;

  const results = await prisma.post.findMany({
    where: {
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
            some: {
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
    orderBy: { createdAt: sort === 'OLDEST' ? 'asc' : 'desc' },
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
      imageUrl: item.closetArchive.imageUrl,
      likeCount: item._count.postLikes,
      isLiked: item.postLikes.length > 0,
      bookmarkCount: item._count.postBookmarks,
      isBookmarked: item.postBookmarks.length > 0,
  }));

  return buildPaginationResult(items, limit);
};

// 게시글 상세 조회
export const getPostByIdService = async (id: string, userId: string) => {
  const post = await prisma.post.findUnique({
    where: { id },
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
            where: { id: { not: id } },
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

  const bodyInfo = post.closetArchive.bodyInfo as { height?: number; weight?: number } | null;

  return {
    id: post.id,
    createdAt: post.createdAt,
    user: {
      nickname: post.user.profile?.nickname ?? null,
      imageUrl: post.user.profile?.imageUrl ?? null,
      height: bodyInfo?.height ?? null,
      weight: bodyInfo?.weight ?? null,
      isFollowing: post.user.followers.length > 0,
    },
    image2dUrl: post.closetArchive.imageUrl,
    model3dUrl: post.closetArchive.modelUrl,
    images: post.postImages.map((img) => img.imageUrl),
    likeCount: post._count.postLikes,
    isLiked: post.postLikes.length > 0,
    bookmarkCount: post._count.postBookmarks,
    isBookmarked: post.postBookmarks.length > 0,
    items: post.closetArchive.closetItems.map((it) => ({
      imageUrl: it.imageUrl,
      brand: it.brand,
      name: it.name,
      size: it.size,
      link: it.externalLink,
      type: it.type,
    })),
    otherPosts: post.user.posts.map((p) => ({
      id: p.id,
      imageUrl: p.closetArchive.imageUrl,
      likeCount: p._count.postLikes,
      isLiked: p.postLikes.length > 0,
    })),
  };
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