import { PrismaClient } from '@prisma/client';
import { getEnv } from './env.js';
import { getLogger } from './logger.js';

let prismaInstance: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!prismaInstance) {
    const env = getEnv();
    prismaInstance = new PrismaClient({
      log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }
  return prismaInstance;
}

export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  latencyMs?: number;
  error?: string;
}> {
  const startedAt = Date.now();
  try {
    const prisma = getPrisma();
    await prisma.$queryRawUnsafe('SELECT 1');
    return {
      connected: true,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database health check failed';
    getLogger().warn({ err: error }, 'Database health probe failed');
    return {
      connected: false,
      error: message,
    };
  }
}

export async function disconnectPrisma(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
  }
}
