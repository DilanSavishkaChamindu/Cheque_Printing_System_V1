import type { Request } from 'express';

const SENSITIVE_FIELD_NAMES = new Set([
  'password',
  'passwordhash',
  'currentpassword',
  'newpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'refreshtokenhash',
  'resettoken',
  'tokenhash',
  'secret',
  'jwt_access_secret',
  'jwt_refresh_secret',
]);

export function sanitizeAuditValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditValue(item));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_FIELD_NAMES.has(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeAuditValue(entry);
      }
    }
    return sanitized;
  }

  return value;
}

export function getClientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
    return forwarded.split(',')[0]?.trim().slice(0, 64) ?? null;
  }
  return req.ip ? req.ip.slice(0, 64) : null;
}

export function getUserAgent(req: Request): string | null {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua.slice(0, 500) : null;
}
