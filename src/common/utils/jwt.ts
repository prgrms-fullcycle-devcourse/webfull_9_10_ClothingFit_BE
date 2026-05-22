import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

export const signAccessToken = (payload: { userId: string; email: string }): string => {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: '30m' });
};

export const signRefreshToken = (payload: { userId: string }): string => {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: '30d' });
};

export const verifyAccessToken = (token: string): jwt.JwtPayload => {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
};

export const verifyRefreshToken = (token: string): jwt.JwtPayload => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as jwt.JwtPayload;
};
