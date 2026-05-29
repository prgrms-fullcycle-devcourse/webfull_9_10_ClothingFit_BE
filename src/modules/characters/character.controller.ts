import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { asyncHandler } from '@/common/utils/async.handler';
import type { ApiResponse } from '@/common/types/api';
import { getCharacters, selectCharacter } from './character.service';
import type { GroupedCharacters } from './character.service';

export const getCharactersController = asyncHandler(async (_req: Request, res: Response) => {
  const characters = await getCharacters();

  const response: ApiResponse<GroupedCharacters> = { data: characters };
  res.status(StatusCodes.OK).json(response);
});

export const selectCharacterController = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { characterId } = req.body;

  await selectCharacter(userId, characterId);

  const response: ApiResponse = { message: '캐릭터가 선택되었습니다.' };
  res.status(StatusCodes.OK).json(response);
});