import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../../config/constants';

export interface CursorPaginationQuery {
  cursor?: string;
  limit?: string;
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

export const parsePaginationParams = (query: CursorPaginationQuery): CursorPaginationParams => ({
  cursor: query.cursor,
  limit: Math.min(query.limit ? Number(query.limit) : DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT),
});

export const buildPaginationResult = <T extends { id: string }>(
  items: T[],
  limit: number,
): CursorPaginationResult<T> => {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? (data[data.length - 1]?.id ?? null) : null;
  return { data, nextCursor, hasMore };
};
