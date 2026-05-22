import type { NextFunction, Request, Response } from 'express';
import type { AnyZodObject, ZodError } from 'zod';
import { AppError } from '../errors/AppError';
import { ErrorCode } from '../errors/ErrorCode';

interface ValidateSchemas {
  body?: AnyZodObject;
  query?: AnyZodObject;
  params?: AnyZodObject;
}

export const validate =
  (schemas: ValidateSchemas) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) req.query = schemas.query.parse(req.query) as typeof req.query;
      if (schemas.params) req.params = schemas.params.parse(req.params);
      next();
    } catch (err) {
      const zodErr = err as ZodError;
      next(
        new AppError(
          ErrorCode.VALIDATION_ERROR,
          zodErr.errors[0]?.message ?? '입력값이 올바르지 않습니다.',
          400,
        ),
      );
    }
  };
