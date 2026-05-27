import { app } from './app';
import { env } from './config/env';
import prisma from '@/lib/prisma/extensions';
import { logger } from '@/lib/logger/logger';

const PORT = Number(env.PORT);

const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${env.NODE_ENV} mode`);
  logger.info(`API Docs: http://localhost:${PORT}/api-docs`);
});

const shutdown = async (): Promise<void> => {
  logger.info('Shutting down server...');
  server.close(async () => {
    await prisma.$disconnect();
    logger.info('Server closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => {
  void shutdown();
});
process.on('SIGINT', () => {
  void shutdown();
});
