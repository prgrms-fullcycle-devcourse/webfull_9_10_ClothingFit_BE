import { type Router as RouterType, Router } from 'express';
import {
  getPosts,
  getPostById,
  likePost,
  unlikePost,
  bookmarkPost,
  unbookmarkPost,
} from './posts.controller';
import { getPostsQuerySchema, postIdParamSchema } from './posts.schema';
import { validate } from '@/common/middleware/validate.middleware';
import { asyncHandler } from '@/common/utils/async.handler';
import { authenticate } from '@/common/middleware/auth.middleware';

const router: RouterType = Router();

// 게시글 목록 조회 (필터/정렬/검색 포함)
router.get('/', validate({ query: getPostsQuerySchema }), authenticate, asyncHandler(getPosts));

// 게시글 상세 조회
router.get('/:id', validate({ params: postIdParamSchema }), authenticate, asyncHandler(getPostById));

// 좋아요
router.post('/:id/like', validate({ params: postIdParamSchema }), authenticate, asyncHandler(likePost));

// 좋아요 취소
router.delete('/:id/like', validate({ params: postIdParamSchema }), authenticate, asyncHandler(unlikePost));

// 북마크
router.post('/:id/bookmark', validate({ params: postIdParamSchema }), authenticate, asyncHandler(bookmarkPost));

// 북마크 취소
router.delete('/:id/bookmark', validate({ params: postIdParamSchema }), authenticate, asyncHandler(unbookmarkPost));

export default router;