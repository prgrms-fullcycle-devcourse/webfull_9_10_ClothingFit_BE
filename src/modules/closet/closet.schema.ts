import { z } from 'zod';
import { ClothingType } from '@prisma/client';

export const ClosetItemSummarySchema = z
  .object({
    id: z.string().openapi({ example: '01900000-0000-7000-8000-000000000001' }),
    name: z.string().openapi({ example: '나이키 에어포스' }),
    brand: z.string().nullable().openapi({ example: 'Nike' }),
    imageUrl: z.string().url().nullable().openapi({ example: 'https://example.com/item.png' }),
    type: z.nativeEnum(ClothingType).openapi({ example: ClothingType.TOP }),
    size: z.string().nullable().openapi({ example: 'M' }),
  })
  .openapi('ClosetItemSummary');

export const ClosetListItemSchema = z
  .object({
    id: z.string().openapi({ example: '01900000-0000-7000-8000-000000000002' }),
    title: z.string().openapi({ example: '봄 코디' }),
    imageUrl: z.string().url().openapi({ example: 'https://example.com/closet.png' }),
    modelUrl: z.string().url().nullable().openapi({ example: 'https://example.com/model.glb' }),
    createdAt: z.string().datetime().openapi({ example: '2026-01-01T00:00:00.000Z' }),
    closetItems: z.array(ClosetItemSummarySchema),
  })
  .openapi('ClosetListItem');

export const ClosetListResponseSchema = z
  .object({
    data: z.array(ClosetListItemSchema),
    nextCursor: z.string().nullable().openapi({ example: '01900000-0000-7000-8000-000000000002' }),
    hasMore: z.boolean().openapi({ example: true }),
  })
  .openapi('ClosetListResponse');

export const ClosetQuerySchema = z
  .object({
    cursor: z.string().uuid().optional().openapi({ example: '01900000-0000-7000-8000-000000000002' }),
    limit: z.coerce.number().int().min(1).optional().openapi({ example: 20 }),
  })
  .openapi('ClosetQuery');
