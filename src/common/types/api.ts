export interface ApiResponse<T = unknown> {
  data?: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ErrorResponse {
  code: string;
  message: string;
}
