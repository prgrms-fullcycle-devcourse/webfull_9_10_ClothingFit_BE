import type { ClothingType } from '@prisma/client';
import prisma from '@/lib/prisma/extensions';
import { buildPaginationResult } from '@/common/utils/pagination';
import type { CursorPaginationParams, CursorPaginationResult } from '@/common/utils/pagination';

export type ClosetItemSummary = {
  id: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  type: ClothingType;
  size: string | null;
};

export type ClosetListItem = {
  id: string;
  title: string;
  imageUrl: string;
  modelUrl: string | null;
  createdAt: Date;
  closetItems: ClosetItemSummary[];
};

export const getClosets = async (
  userId: string,
  params: CursorPaginationParams,
): Promise<CursorPaginationResult<ClosetListItem>> => {
  const items = await prisma.closetArchive.findMany({
    where: { userId },
    take: params.limit + 1,
    ...(params.cursor && {
      cursor: { id: params.cursor },
      skip: 1,
    }),
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      imageUrl: true,
      modelUrl: true,
      createdAt: true,
      closetItems: {
        select: {
          id: true,
          name: true,
          brand: true,
          imageUrl: true,
          type: true,
          size: true,
        },
      },
    },
  });

  return buildPaginationResult(items, params.limit);
};
