import type { Gender, BodyType } from '@prisma/client';
import prisma from '@/lib/prisma/extensions';

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
