import { Queue } from 'bullmq';
import { env } from '../../config/env';

const redisUrl = new URL(env.REDIS_URL);

export const bullmqConnection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port) || 6379,
  password: redisUrl.password || undefined,
};

export const fittingQueue = new Queue('fitting', {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});
