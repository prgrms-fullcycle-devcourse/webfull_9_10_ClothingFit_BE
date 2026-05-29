import { z } from 'zod';

export const authErrorResponseSchema = z
  .object({
    code: z.string().openapi({ example: 'UNAUTHORIZED' }),
    message: z.string().openapi({ example: '인증이 필요합니다.' }),
  })
  .openapi('AuthErrorResponseSchema');