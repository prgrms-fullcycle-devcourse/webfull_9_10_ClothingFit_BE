import { z } from 'zod';
import { Gender, BodyType } from '@prisma/client';

export const CharacterListItemSchema = z
  .object({
    id: z.string().openapi({ example: '01900000-0000-7000-8000-000000000001' }),
    gender: z.nativeEnum(Gender).openapi({ example: Gender.MALE }),
    bodyType: z.nativeEnum(BodyType).openapi({ example: BodyType.NORMAL }),
    imageUrl: z.string().url().openapi({ example: 'https://example.com/character.png' }),
  })
  .openapi('CharacterListItem');

export const GroupedCharactersSchema = z
  .object({
    MALE: z.array(CharacterListItemSchema),
    FEMALE: z.array(CharacterListItemSchema),
  })
  .openapi('GroupedCharacters');

export const CharacterListResponseSchema = z
  .object({
    data: GroupedCharactersSchema,
  })
  .openapi('CharacterListResponse');

export const SelectCharacterBodySchema = z
  .object({
    characterId: z.string().uuid().openapi({ example: '01900000-0000-7000-8000-000000000001' }),
  })
  .openapi('SelectCharacterBody');

