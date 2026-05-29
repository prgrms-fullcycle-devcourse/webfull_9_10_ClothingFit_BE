import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import type { OpenAPIObject } from 'openapi3-ts/oas30';
import './zod';
import { registry } from './registry';

import '@/modules/health/health.swagger';
import '@/modules/characters/character.swagger';

const generateOpenApiDocument = (): OpenAPIObject => {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'ClothingFit API',
      version: '1.0.0',
      description: 'ClothingFit 백엔드 API 문서',
    },
    servers: [
      {
        url: '/api/v1',
        description: 'API v1',
      },
    ],
  });
};

export const openApiDocument = generateOpenApiDocument();
