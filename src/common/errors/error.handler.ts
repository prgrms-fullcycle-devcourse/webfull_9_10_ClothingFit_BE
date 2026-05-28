import type { NextFunction, Request, Response } from 'express';
import { logger } from '@/lib/logger/logger';
import { AppError } from './app-error';
import { ErrorCode } from './error-code';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
    });
    return;
  }

  logger.error('Unhandled error', { message: err.message, stack: err.stack });

  res.status(500).json({
    code: ErrorCode.INTERNAL_ERROR,
    message: '서버 오류가 발생했습니다.',
  });
};
