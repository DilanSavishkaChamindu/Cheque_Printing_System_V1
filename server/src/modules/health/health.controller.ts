import type { Request, Response } from 'express';
import { sendSuccess } from '../../core/response.js';
import { getSystemHealth } from './health.service.js';

export async function getHealthController(_req: Request, res: Response): Promise<void> {
  const health = await getSystemHealth();
  const statusCode = health.database.connected ? 200 : 503;

  sendSuccess(
    res,
    health,
    health.database.connected
      ? 'System is healthy.'
      : 'API is running, but MySQL database connectivity is unavailable.',
    {},
    statusCode
  );
}
