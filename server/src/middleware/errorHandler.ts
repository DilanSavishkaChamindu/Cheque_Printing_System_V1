import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { getEnv } from '../config/env.js';
import { getLogger } from '../config/logger.js';
import { AppError } from '../core/errors.js';
import { sendError } from '../core/response.js';

export function errorHandlerMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const logger = getLogger();
  const env = getEnv();

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, requestId: req.requestId }, err.message);
    } else {
      logger.warn(
        { code: err.code, statusCode: err.statusCode, requestId: req.requestId },
        err.message
      );
    }

    sendError(res, err.statusCode, err.message, {
      code: err.code,
      errors: err.errors,
      requestId: req.requestId,
    });
    return;
  }

  if (err instanceof ZodError) {
    const errors = err.issues.map((issue) => ({
      field: issue.path.join('.') || undefined,
      code: issue.code.toUpperCase(),
      message: issue.message,
    }));

    sendError(res, 400, 'Validation failed.', {
      code: 'VALIDATION_ERROR',
      errors,
      requestId: req.requestId,
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      sendError(res, 409, 'A record with the same unique identifier already exists.', {
        code: 'DUPLICATE_RECORD',
        requestId: req.requestId,
      });
      return;
    }

    if (err.code === 'P2025') {
      sendError(res, 404, 'Requested record could not be found.', {
        code: 'RECORD_NOT_FOUND',
        requestId: req.requestId,
      });
      return;
    }

    if (err.code === 'P2003') {
      sendError(res, 409, 'Operation blocked by a related record constraint.', {
        code: 'FOREIGN_KEY_CONSTRAINT',
        requestId: req.requestId,
      });
      return;
    }
  }

  if (
    err instanceof SyntaxError &&
    typeof (err as { status?: number }).status === 'number' &&
    (err as { status?: number }).status === 400
  ) {
    sendError(res, 400, 'Malformed JSON request payload.', {
      code: 'MALFORMED_JSON',
      requestId: req.requestId,
    });
    return;
  }

  logger.error({ err, requestId: req.requestId }, 'Unhandled internal server error');

  const safeMessage =
    env.NODE_ENV === 'production'
      ? 'An unexpected internal error occurred.'
      : err instanceof Error
        ? err.message
        : 'An unexpected internal error occurred.';

  sendError(res, 500, safeMessage, {
    code: 'INTERNAL_SERVER_ERROR',
    requestId: req.requestId,
  });
}
