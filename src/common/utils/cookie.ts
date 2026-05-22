import type { Response } from 'express';
import { refreshTokenCookieOptions } from '../../config/cookie';

export const setRefreshTokenCookie = (res: Response, token: string): void => {
  res.cookie('refreshToken', token, refreshTokenCookieOptions);
};

export const clearRefreshTokenCookie = (res: Response): void => {
  res.clearCookie('refreshToken', { path: '/' });
};
