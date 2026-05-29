import { registry } from '@/config/registry';
import { ErrorResponseSchema, MessageResponseSchema } from '@/common/schemas/api.schema';
import { CharacterListResponseSchema, SelectCharacterBodySchema } from './character.schema';

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

registry.registerPath({
  method: 'post',
  path: '/characters/me',
  tags: ['Characters'],
  summary: '캐릭터 선택',
  description: '유저가 기본 캐릭터를 선택합니다. 이미 선택한 경우 변경됩니다.',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: SelectCharacterBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: '캐릭터 선택 성공',
      content: {
        'application/json': {
          schema: MessageResponseSchema,
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
    404: {
      description: '존재하지 않는 캐릭터',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    500: {
      description: '서버 내부 오류',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});
