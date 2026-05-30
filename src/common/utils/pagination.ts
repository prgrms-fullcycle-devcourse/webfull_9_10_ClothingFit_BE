import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../../config/constants';

export interface CursorPaginationQuery {
  cursor?: string | string[];
  limit?: string | number | string[];
}

export interface CursorPaginationParams {
  cursor?: string;
  limit: number;
}

export interface CursorPaginationResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const parsePaginationParams = (query: CursorPaginationQuery): CursorPaginationParams => {
  const rawLimit = Array.isArray(query.limit) ? query.limit[0] : query.limit;
  const parsed = Number(rawLimit);
  const limit = Math.min(!rawLimit || Number.isNaN(parsed) ? DEFAULT_PAGE_LIMIT : parsed, MAX_PAGE_LIMIT);

  return {
    cursor: Array.isArray(query.cursor) ? query.cursor[0] : query.cursor,
    limit,
  };
};

export const buildPaginationResult = <T extends { id: string }>(
  items: T[],
  limit: number,
): CursorPaginationResult<T> => {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? (data[data.length - 1]?.id ?? null) : null;
  return { data, nextCursor, hasMore };
};
