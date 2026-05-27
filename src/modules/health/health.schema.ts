import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

export const HealthCheckResponseSchema = z
  .object({
    status: z.string().openapi({
      example: 'ok',
      description: '서버 상태',
    }),
    timestamp: z.string().datetime().openapi({
      example: '2026-05-27T12:34:56.789Z',
      description: '응답 시각 (ISO 8601)',
    }),
  })
  .openapi('HealthCheckResponse');