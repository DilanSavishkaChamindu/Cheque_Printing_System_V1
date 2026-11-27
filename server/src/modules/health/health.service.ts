import { checkDatabaseHealth } from '../../config/prisma.js';

export interface SystemHealthStatus {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  timestamp: string;
  uptimeSeconds: number;
  database: {
    connected: boolean;
    latencyMs?: number;
    error?: string;
  };
}

export async function getSystemHealth(): Promise<SystemHealthStatus> {
  const database = await checkDatabaseHealth();

  return {
    status: database.connected ? 'ok' : 'degraded',
    service: 'cheque-printing-saas-api',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database,
  };
}
