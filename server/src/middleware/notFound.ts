import type { Request, Response } from 'express';
import { sendError } from '../core/response.js';

export function notFoundMiddleware(req: Request, res: Response): void {
  sendError(res, 404, `Route ${req.method} ${req.originalUrl} not found.`, {
    code: 'ROUTE_NOT_FOUND',
    requestId: req.requestId,
  });
}
