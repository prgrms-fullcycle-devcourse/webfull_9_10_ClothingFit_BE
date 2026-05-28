import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-code';
import { verifyAccessToken } from '../utils/jwt';

export const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    next(new AppError(ErrorCode.UNAUTHORIZED, '인증이 필요합니다.', 401));
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload['userId'] as string, email: payload['email'] as string };
    next();
  } catch {
    next(new AppError(ErrorCode.TOKEN_EXPIRED, '토큰이 만료되었습니다.', 401));
  }
};

export const optionalAuthenticate = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload['userId'] as string, email: payload['email'] as string };
  } catch {
    // optional — 토큰 오류 무시
  }

  next();
};
