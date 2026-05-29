import { z } from 'zod';

export const ErrorResponseSchema = z
  .object({
    code: z.string().openapi({ example: 'INTERNAL_ERROR' }),
    message: z.string().openapi({ example: '서버 오류가 발생했습니다.' }),
  })
  .openapi('ErrorResponse');
