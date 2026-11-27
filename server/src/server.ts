import { getEnv } from './config/env.js';
import { getLogger } from './config/logger.js';
import { disconnectPrisma } from './config/prisma.js';
import { createApp } from './app.js';

async function bootstrap(): Promise<void> {
  const env = getEnv();
  const logger = getLogger();
  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Cheque Printing SaaS API listening');
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down server gracefully');
    server.close(async () => {
      await disconnectPrisma();
      logger.info('Server shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
