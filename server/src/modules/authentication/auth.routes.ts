import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { getEnv } from '../../config/env.js';
import { asyncHandler } from '../../core/asyncHandler.js';
import {
  authenticatePlatformAdmin,
  authenticateTenantUser,
} from '../../middleware/auth.js';
import { createAuthRateLimiter } from '../../middleware/rateLimiter.js';
import {
  changePasswordController,
  forgotPasswordController,
  platformLoginController,
  platformLogoutController,
  platformMeController,
  platformRefreshController,
  resetPasswordController,
  tenantLoginController,
  tenantLogoutAllController,
  tenantLogoutController,
  tenantMeController,
  tenantRefreshController,
} from './auth.controller.js';

let cachedLimiter: ReturnType<typeof createAuthRateLimiter> | null = null;

function authRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (getEnv().NODE_ENV === 'test') {
    next();
    return;
  }
  if (!cachedLimiter) {
    cachedLimiter = createAuthRateLimiter();
  }
  cachedLimiter(req, res, next);
}

const router = Router();

// Platform Administrator Auth
router.post('/platform/login', authRateLimitMiddleware, asyncHandler(platformLoginController));
router.post('/platform/refresh', authRateLimitMiddleware, asyncHandler(platformRefreshController));
router.post('/platform/logout', authenticatePlatformAdmin, asyncHandler(platformLogoutController));
router.get('/platform/me', authenticatePlatformAdmin, asyncHandler(platformMeController));

// Tenant User Auth
router.post('/login', authRateLimitMiddleware, asyncHandler(tenantLoginController));
router.post('/refresh', authRateLimitMiddleware, asyncHandler(tenantRefreshController));
router.post('/logout', authenticateTenantUser, asyncHandler(tenantLogoutController));
router.post('/logout-all', authenticateTenantUser, asyncHandler(tenantLogoutAllController));
router.get('/me', authenticateTenantUser, asyncHandler(tenantMeController));
router.post('/change-password', authenticateTenantUser, asyncHandler(changePasswordController));

// Password Reset (One-Time Tokens)
router.post('/forgot-password', authRateLimitMiddleware, asyncHandler(forgotPasswordController));
router.post('/reset-password', authRateLimitMiddleware, asyncHandler(resetPasswordController));

export { router as authRouter };
