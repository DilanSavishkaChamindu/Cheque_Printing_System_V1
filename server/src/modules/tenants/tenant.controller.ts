import type { Request, Response } from 'express';
import { updateTenantProfileSelfSchema } from '@cheque-saas/shared';
import { sendSuccess } from '../../core/response.js';
import { getClientIp, getUserAgent } from '../../utils/sanitize.js';
import {
  getCurrentTenantProfile,
  updateCurrentTenantProfile,
} from './tenant.service.js';

export async function getCurrentTenantController(
  req: Request,
  res: Response
): Promise<void> {
  const profile = await getCurrentTenantProfile(req.tenantUser!.tenantId);
  sendSuccess(res, profile, 'Organization profile retrieved.');
}

export async function updateCurrentTenantController(
  req: Request,
  res: Response
): Promise<void> {
  const input = updateTenantProfileSelfSchema.parse(req.body);
  const updated = await updateCurrentTenantProfile(req.tenantUser!, input, {
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    requestId: req.requestId ?? null,
  });
  sendSuccess(res, updated, 'Organization profile updated successfully.');
}
