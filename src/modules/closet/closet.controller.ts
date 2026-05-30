import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { asyncHandler } from '@/common/utils/async.handler';
import { parsePaginationParams } from '@/common/utils/pagination';
import { getClosets } from './closet.service';

export const getClosetsController = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const params = parsePaginationParams(req.query);

  const result = await getClosets(userId, params);

  res.status(StatusCodes.OK).json(result);
});
