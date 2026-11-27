import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import { getEnv } from '../config/env.js';

export function createGlobalRateLimiter(): RateLimitRequestHandler {
  const env = getEnv();
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Too many requests. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
      errors: [],
    },
  });
}

export function createAuthRateLimiter(): RateLimitRequestHandler {
  const env = getEnv();
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.AUTH_RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Too many authentication attempts. Please try again later.',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      errors: [],
    },
  });
}
