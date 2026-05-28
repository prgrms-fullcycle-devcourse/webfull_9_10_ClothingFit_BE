import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { asyncHandler } from '@/common/utils/async.handler';
import type { ApiResponse } from '@/common/types/api';
import { getCharacters } from './character.service';
import type { GroupedCharacters } from './character.service';


export const getCharactersController = asyncHandler(async (_req: Request, res: Response) => {
  const characters = await getCharacters();

  const response: ApiResponse<GroupedCharacters> = { data: characters };
  res.status(StatusCodes.OK).json(response);
});