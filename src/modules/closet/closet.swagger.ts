import { registry } from '@/config/registry';
import { ErrorResponseSchema } from '@/common/schemas/api.schema';
import { ClosetListResponseSchema, ClosetQuerySchema } from './closet.schema';

registry.registerPath({
  method: 'get',
  path: '/closet',
  tags: ['Closet'],
  summary: '옷장 목록 조회',
  description: '로그인한 유저의 옷장 목록을 최신순으로 반환합니다. 커서 기반 페이지네이션을 지원합니다.',
  security: [{ bearerAuth: [] }],
  request: {
    query: ClosetQuerySchema,
  },
  responses: {
    200: {
      description: '옷장 목록 조회 성공',
      content: {
        'application/json': {
          schema: ClosetListResponseSchema,
        },
      },
    },
    400: {
      description: '유효하지 않은 요청',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    401: {
      description: '인증 필요',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: '서버 내부 오류',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});
