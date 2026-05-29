import type { Request, Response } from 'express';
import { bookmarkPostService, getPostByIdService, getPostsService, likePostService, unbookmarkPostService, unlikePostService } from './posts.service';
import type { GetPostsQuery, PostIdParam } from './posts.schema';

// 게시글 목록 조회 (필터/정렬/검색 포함)
export const getPosts = async (req: Request, res: Response) => {
  const result = await getPostsService(req.query as unknown as GetPostsQuery, req.user!.id);
  res.status(200).json(result);
};

// 게시글 상세 조회
export const getPostById = async (req: Request, res: Response) => {
  const result = await getPostByIdService((req.params as unknown as PostIdParam).id, req.user!.id);
  res.status(200).json(result);
};

// 좋아요
export const likePost = async (req: Request, res: Response) => {
  const result = await likePostService(req.user!.id, (req.params as unknown as PostIdParam).id);
  res.status(200).json(result);
};

// 좋아요 취소
export const unlikePost = async (req: Request, res: Response) => {
  const result = await unlikePostService(req.user!.id, (req.params as unknown as PostIdParam).id);
  res.status(200).json(result);
};

// 북마크
export const bookmarkPost = async (req: Request, res: Response) => {
  const result = await bookmarkPostService(req.user!.id, (req.params as unknown as PostIdParam).id);
  res.status(200).json(result);
};

// 북마크 취소
export const unbookmarkPost = async (req: Request, res: Response) => {
  const result = await unbookmarkPostService(req.user!.id, (req.params as unknown as PostIdParam).id);
  res.status(200).json(result);
};