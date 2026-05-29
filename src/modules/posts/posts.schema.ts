import { MAX_PAGE_LIMIT } from '@/config/constants';
import { Gender, ClothingType } from '@prisma/client';
import { z } from 'zod';

export const getPostsQuerySchema = z.object({
  follow: z.enum(['TRUE', 'FALSE']).transform((v) => v === "TRUE").optional(),
  gender: z.nativeEnum(Gender).optional(),
  sort: z.enum(['LATEST', 'OLDEST']).default('LATEST'),
  keyword: z.string().trim().max(100).optional(),
  height: z.coerce.number().int().min(0).max(300).optional(),
  weightMin: z.coerce.number().int().min(0).max(500).optional(),
  weightMax: z.coerce.number().int().min(0).max(500).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(20),
});

export const postIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const postListItemSchema = z
  .object({
    id: z.string(),
    nickname: z.string().nullable(),
    imageUrl: z.string().url(),
    likeCount: z.number().int(),
    isLiked: z.boolean(),
    bookmarkCount: z.number().int(),
    isBookmarked: z.boolean(),
  })
  .openapi('PostListItem');

// 게시글 목록 조회 (필터/정렬/검색 포함) 응답
export const getPostsResponseSchema = z
  .object({
    data: z.array(postListItemSchema),
    nextCursor: z.string().nullable().openapi({ description: '다음 페이지 커서 (없으면 null)' }),
    hasMore: z.boolean(),
  })
  .openapi('GetPostsResponse');

export const postAuthorSchema = z
  .object({
    nickname: z.string().nullable(),
    imageUrl: z.string().url().nullable(),
    height: z.number().nullable(),
    weight: z.number().nullable(),
    isFollowing: z.boolean(),
  })
  .openapi('PostAuthor');

export const postClothingItemSchema = z
  .object({
    imageUrl: z.string().url().nullable(),
    brand: z.string().nullable(),
    name: z.string(),
    size: z.string().nullable(),
    link: z.string().url().nullable(),
    type: z.nativeEnum(ClothingType),
  })
  .openapi('PostClothingItem');

export const otherPostSchema = z
  .object({
    id: z.string(),
    imageUrl: z.string().url(),
    likeCount: z.number().int(),
    isLiked: z.boolean(),
  })
  .openapi('OtherPost');

// 게시글 상세 조회 응답
export const getPostByIdResponseSchema = z
  .object({
    id: z.string(),
    createdAt: z.string().datetime().openapi({ example: '2025-05-29T12:34:56.000Z' }),
    user: postAuthorSchema,
    image2dUrl: z.string().url(),
    model3dUrl: z.string().url().nullable(),
    images: z.array(z.string().url()),
    likeCount: z.number().int(),
    isLiked: z.boolean(),
    bookmarkCount: z.number().int(),
    isBookmarked: z.boolean(),
    items: z.array(postClothingItemSchema),
    otherPosts: z.array(otherPostSchema),
  })
  .openapi('GetPostByIdResponse');

// 좋아요 / 좋아요 취소 응답
export const likeResponseSchema = z
  .object({
    liked: z.boolean(),
    likeCount: z.number().int(),
  })
  .openapi('LikeResponse');

// 북마크 / 북마크 취소 응답
export const bookmarkResponseSchema = z
  .object({
    bookmarked: z.boolean(),
    bookmarkCount: z.number().int(),
  })
  .openapi('BookmarkResponse');

export type GetPostsQuery = z.infer<typeof getPostsQuerySchema>;
export type PostIdParam = z.infer<typeof postIdParamSchema>;
export type GetPostsResponse = z.infer<typeof getPostsResponseSchema>;
export type GetPostByIdResponse = z.infer<typeof getPostByIdResponseSchema>;
export type LikeResponse = z.infer<typeof likeResponseSchema>;
export type BookmarkResponse = z.infer<typeof bookmarkResponseSchema>;