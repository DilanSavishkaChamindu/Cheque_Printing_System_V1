import type { Request, Response } from 'express';
import { uuidSchema } from '@cheque-saas/shared';
import { sendSuccess } from '../../core/response.js';
import { getTenantDashboardData } from './dashboard.service.js';

export async function getDashboardController(req: Request, res: Response): Promise<void> {
  const companyId =
    typeof req.query.companyId === 'string' && req.query.companyId
      ? uuidSchema.parse(req.query.companyId)
      : undefined;

  const data = await getTenantDashboardData(req.tenantUser!, companyId);
  sendSuccess(res, data, 'Dashboard operational metrics retrieved.');
}
