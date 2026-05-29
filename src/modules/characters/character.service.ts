import type { Gender, BodyType } from '@prisma/client';
import { Prisma, CharacterSource } from '@prisma/client';
import prisma from '@/lib/prisma/extensions';
import { AppError } from '@/common/errors/app-error';
import { ErrorCode } from '@/common/errors/error-code';

export type CharacterListItem = {
  id: string;
  gender: Gender;
  bodyType: BodyType;
  imageUrl: string;
};

export type GroupedCharacters = Record<Gender, CharacterListItem[]>;

export const getCharacters = async (): Promise<GroupedCharacters> => {
  const characters = await prisma.character.findMany({
    orderBy: [{ gender: 'asc' }, { bodyType: 'asc' }],
    select: {
      id: true,
      gender: true,
      bodyType: true,
      imageUrl: true,
    },
  });

  return characters.reduce<GroupedCharacters>(
    (acc, character) => {
      acc[character.gender].push(character);
      return acc;
    },
    { MALE: [], FEMALE: [] },
  );
};

export const selectCharacter = async (userId: string, characterId: string): Promise<void> => {
  try {
    await prisma.userCharacter.upsert({
      where: { userId },
      update: { characterId, sourceType: CharacterSource.CHARACTER, imageUrl: null },
      create: { userId, characterId, sourceType: CharacterSource.CHARACTER },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      throw new AppError(ErrorCode.CHARACTER_NOT_FOUND, '존재하지 않는 캐릭터입니다.', 404);
    }
    throw err;
  }
};
