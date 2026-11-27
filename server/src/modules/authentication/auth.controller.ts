import type { Request, Response } from 'express';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  platformLoginSchema,
  refreshTokenSchema,
  resetPasswordSchema,
  tenantLoginSchema,
} from '@cheque-saas/shared';
import { sendSuccess } from '../../core/response.js';
import { getClientIp, getUserAgent } from '../../utils/sanitize.js';
import {
  changeTenantUserPassword,
  loginPlatformAdmin,
  loginTenantUser,
  logoutAllTenantSessions,
  logoutPlatformSession,
  logoutTenantSession,
  refreshPlatformSession,
  refreshTenantSession,
  requestPasswordReset,
  resetPasswordWithToken,
} from './auth.service.js';

function getMeta(req: Request) {
  return {
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    requestId: req.requestId ?? null,
  };
}

export async function platformLoginController(req: Request, res: Response): Promise<void> {
  const input = platformLoginSchema.parse(req.body);
  const result = await loginPlatformAdmin(input, getMeta(req));
  sendSuccess(res, result, 'Platform administrator authenticated successfully.');
}

export async function platformRefreshController(req: Request, res: Response): Promise<void> {
  const input = refreshTokenSchema.parse(req.body);
  const result = await refreshPlatformSession(input.refreshToken, getMeta(req));
  sendSuccess(res, result, 'Platform session refreshed successfully.');
}

export async function platformLogoutController(req: Request, res: Response): Promise<void> {
  await logoutPlatformSession(req.platformAdmin!, getMeta(req));
  sendSuccess(res, { loggedOut: true }, 'Platform administrator logged out.');
}

export async function platformMeController(req: Request, res: Response): Promise<void> {
  sendSuccess(res, req.platformAdmin!, 'Platform administrator profile retrieved.');
}

export async function tenantLoginController(req: Request, res: Response): Promise<void> {
  const input = tenantLoginSchema.parse(req.body);
  const result = await loginTenantUser(input, getMeta(req));
  sendSuccess(res, result, 'User authenticated successfully.');
}

export async function tenantRefreshController(req: Request, res: Response): Promise<void> {
  const input = refreshTokenSchema.parse(req.body);
  const result = await refreshTenantSession(input.refreshToken, getMeta(req));
  sendSuccess(res, result, 'Session refreshed successfully.');
}

export async function tenantLogoutController(req: Request, res: Response): Promise<void> {
  await logoutTenantSession(req.tenantUser!, getMeta(req));
  sendSuccess(res, { loggedOut: true }, 'Logged out successfully.');
}

export async function tenantLogoutAllController(req: Request, res: Response): Promise<void> {
  const result = await logoutAllTenantSessions(req.tenantUser!, getMeta(req));
  sendSuccess(res, result, 'All active sessions have been revoked.');
}

export async function tenantMeController(req: Request, res: Response): Promise<void> {
  sendSuccess(res, req.tenantUser!, 'Authenticated user context retrieved.');
}

export async function changePasswordController(req: Request, res: Response): Promise<void> {
  const input = changePasswordSchema.parse(req.body);
  await changeTenantUserPassword(req.tenantUser!, input, getMeta(req));
  sendSuccess(res, { passwordUpdated: true }, 'Password updated successfully.');
}

export async function forgotPasswordController(req: Request, res: Response): Promise<void> {
  const input = forgotPasswordSchema.parse(req.body);
  const result = await requestPasswordReset(input, getMeta(req));
  sendSuccess(
    res,
    result,
    'If a matching active account exists, password reset instructions have been issued.'
  );
}

export async function resetPasswordController(req: Request, res: Response): Promise<void> {
  const input = resetPasswordSchema.parse(req.body);
  await resetPasswordWithToken(input, getMeta(req));
  sendSuccess(res, { passwordReset: true }, 'Password has been reset successfully.');
}
