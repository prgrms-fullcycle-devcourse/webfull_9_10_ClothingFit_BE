import rateLimit from 'express-rate-limit';
import { AppError } from '../common/errors/app-error';
import { ErrorCode } from '../common/errors/error-code';

export const defaultRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError(ErrorCode.TOO_MANY_REQUESTS, '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.', 429));
  },
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError(ErrorCode.TOO_MANY_REQUESTS, '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.', 429));
  },
});

export const fittingRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError(ErrorCode.TOO_MANY_REQUESTS, '피팅 요청 한도를 초과했습니다.', 429));
  },
});
