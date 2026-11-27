import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { getLogger } from '../config/logger.js';

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
  }
}

export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const incomingId = req.header('x-request-id');
  const requestId =
    incomingId && /^[a-zA-Z0-9_-]{8,64}$/.test(incomingId)
      ? incomingId
      : crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    getLogger().info(
      {
        requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
      },
      'HTTP request completed'
    );
  });

  next();
}
