import { registry } from '@/config/registry';
import { HealthCheckResponseSchema } from './health.schema';

export const healthRegistry = registry;

healthRegistry.registerPath({
  method: 'get',
  path: '/health',
  tags: ['Health'],
  summary: '서버 상태 확인',
  description: '서버가 정상적으로 동작하는지 확인합니다.',
  responses: {
    200: {
      description: '서버 정상 동작',
      content: {
        'application/json': {
          schema: HealthCheckResponseSchema,
        },
      },
    },
  },
});