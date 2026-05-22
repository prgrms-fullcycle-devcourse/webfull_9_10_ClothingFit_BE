import type { CookieOptions } from 'express';
import { REFRESH_TOKEN_EXPIRES_IN_MS } from './constants';

export const refreshTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: REFRESH_TOKEN_EXPIRES_IN_MS,
  path: '/',
};
