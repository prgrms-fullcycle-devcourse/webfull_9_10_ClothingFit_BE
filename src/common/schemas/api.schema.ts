import { z } from 'zod';

export const ErrorResponseSchema = z
  .object({
    code: z.string().openapi({ example: 'INTERNAL_ERROR' }),
    message: z.string().openapi({ example: '서버 오류가 발생했습니다.' }),
  })
  .openapi('ErrorResponse');

export const MessageResponseSchema = z
  .object({
    message: z.string().openapi({ example: '요청이 성공적으로 처리되었습니다.' }),
  })
  .openapi('MessageResponse');
