import type { Request, Response } from 'express';
import { auditLogQuerySchema } from '@cheque-saas/shared';
import { sendPaginated } from '../../core/response.js';
import { listTenantAuditLogs } from './audit.service.js';

export async function listTenantAuditLogsController(
  req: Request,
  res: Response
): Promise<void> {
  const tenantUser = req.tenantUser!;
  const query = auditLogQuerySchema.parse(req.query);
  const result = await listTenantAuditLogs(tenantUser.tenantId, query);

  sendPaginated(
    res,
    result.items,
    {
      page: result.page,
      limit: result.limit,
      totalItems: result.totalItems,
    },
    'Audit logs retrieved successfully.'
  );
}
