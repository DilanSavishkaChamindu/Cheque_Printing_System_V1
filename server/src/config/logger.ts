import pino, { type Logger } from 'pino';
import { getEnv } from './env.js';

export const LOG_REDACTION_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.password',
  '*.passwordHash',
  '*.currentPassword',
  '*.newPassword',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.resetToken',
  '*.secret',
];

export function createLogger(): Logger {
  const env = getEnv();

  return pino({
    level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
    redact: {
      paths: LOG_REDACTION_PATHS,
      censor: '[REDACTED]',
    },
    base: {
      service: 'cheque-printing-saas-api',
      env: env.NODE_ENV,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

let loggerInstance: Logger | null = null;

export function getLogger(): Logger {
  if (!loggerInstance) {
    loggerInstance = createLogger();
  }
  return loggerInstance;
}
