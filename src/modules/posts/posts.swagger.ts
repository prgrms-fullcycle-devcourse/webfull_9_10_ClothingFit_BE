import { registry } from '@/config/registry';
import {
  getPostsQuerySchema,
  postIdParamSchema,
  postListItemSchema,
  getPostByIdResponseSchema,
  likeResponseSchema,
  bookmarkResponseSchema,
} from './posts.schema';
import { z } from 'zod';
import { StatusCodes } from 'http-status-codes';
import { ErrorResponseSchema } from '@/common/schemas/api.schema';

export const postsRegistry = registry;

const TAG = 'Posts';

/* 목록 응답: 페이지네이션 컨벤션(data / nextCursor / hasMore) 적용 */
const getPostsResponseSchema = z
  .object({
    data: z.array(postListItemSchema),
    nextCursor: z.string().nullable().openapi({ description: '다음 페이지 커서 (없으면 null)' }),
    hasMore: z.boolean(),
  })
  .openapi('GetPostsResponse');

postsRegistry.registerPath({
  method: 'get',
  path: '/posts',
  summary: '게시글 목록 조회 (필터/정렬/검색 포함)',
  tags: [TAG],
  security: [{ bearerAuth: [] }],
  request: {
    query: getPostsQuerySchema,
  },
  responses: {
    200: {
      description: '게시글 목록 조회 성공',
      content: { 'application/json': { schema: getPostsResponseSchema } },
    },
    401: {
      description: '인증 실패',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

postsRegistry.registerPath({
  method: 'get',
  path: '/posts/{id}',
  summary: '게시글 상세 조회',
  tags: [TAG],
  security: [{ bearerAuth: [] }],
  request: {
    params: postIdParamSchema,
  },
  responses: {
    200: {
      description: '게시글 상세 조회 성공',
      content: { 'application/json': { schema: getPostByIdResponseSchema } },
    },
    401: {
      description: '인증 실패',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: '게시글이 존재하지 않음',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

postsRegistry.registerPath({
  method: 'post',
  path: '/posts/{id}/like',
  summary: '좋아요',
  tags: [TAG],
  security: [{ bearerAuth: [] }],
  request: {
    params: postIdParamSchema,
  },
  responses: {
    200: {
      description: '좋아요 성공',
      content: { 'application/json': { schema: likeResponseSchema } },
    },
    401: {
      description: '인증 실패',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

postsRegistry.registerPath({
  method: 'delete',
  path: '/posts/{id}/like',
  summary: '좋아요 취소',
  tags: [TAG],
  security: [{ bearerAuth: [] }],
  request: {
    params: postIdParamSchema,
  },
  responses: {
    200: {
      description: '좋아요 취소 성공',
      content: { 'application/json': { schema: likeResponseSchema } },
    },
    401: {
      description: '인증 실패',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

postsRegistry.registerPath({
  method: 'post',
  path: '/posts/{id}/bookmark',
  summary: '북마크',
  tags: [TAG],
  security: [{ bearerAuth: [] }],
  request: {
    params: postIdParamSchema,
  },
  responses: {
    200: {
      description: '북마크 성공',
      content: { 'application/json': { schema: bookmarkResponseSchema } },
    },
    401: {
      description: '인증 실패',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

postsRegistry.registerPath({
  method: 'delete',
  path: '/posts/{id}/bookmark',
  summary: '북마크 취소',
  tags: [TAG],
  security: [{ bearerAuth: [] }],
  request: {
    params: postIdParamSchema,
  },
  responses: {
    200: {
      description: '북마크 취소 성공',
      content: { 'application/json': { schema: bookmarkResponseSchema } },
    },
    401: {
      description: '인증 실패',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});