import { registry } from '@/config/registry';
import { ErrorResponseSchema } from '@/common/schemas/api.schema';
import { CharacterListResponseSchema } from './character.schema';

registry.registerPath({
  method: 'get',
  path: '/characters',
  tags: ['Characters'],
  summary: '캐릭터 목록 조회',
  description: '성별로 그룹핑된 기본 신체 타입 캐릭터 목록을 반환합니다. [ SLIM, NORMAL, OVERWEIGHT, OBESE ]',
  responses: {
    200: {
      description: '캐릭터 목록 조회 성공',
      content: {
        'application/json': {
          schema: CharacterListResponseSchema,
        },
      },
    },
    500: {
      description: '서버 내부 오류',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});
