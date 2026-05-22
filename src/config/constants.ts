export const ACCESS_TOKEN_EXPIRES_IN = '30m';
export const REFRESH_TOKEN_EXPIRES_IN = '30d';
export const REFRESH_TOKEN_EXPIRES_IN_MS = 30 * 24 * 60 * 60 * 1000;

export const IMAGE_FORMAT_2D = 'webp' as const;
export const IMAGE_FORMAT_3D = 'glb' as const;

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 50;
