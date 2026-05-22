import { Redis } from 'ioredis';
import { env } from '../../config/env';
import { logger } from '../logger/logger';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

redis.on('error', (err: Error) => {
  logger.error('Redis connection error:', { message: err.message });
});

redis.on('connect', () => {
  logger.info('Redis connected');
});
