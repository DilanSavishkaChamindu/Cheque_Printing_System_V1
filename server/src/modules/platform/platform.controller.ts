import type { Request, Response } from 'express';
import {
  auditLogQuerySchema,
  createTenantSchema,
  listTenantsQuerySchema,
  paginationQuerySchema,
  updateTenantSchema,
  updateTenantStatusSchema,
  uuidSchema,
} from '@cheque-saas/shared';
import { sendCreated, sendPaginated, sendSuccess } from '../../core/response.js';
import { getClientIp, getUserAgent } from '../../utils/sanitize.js';
import { listPlatformAuditLogs } from '../audit-logs/audit.service.js';
import {
  createTenant,
  getTenantDetails,
  listTenants,
  listTenantUsersForPlatform,
  updateTenant,
  updateTenantStatus,
} from '../tenants/tenant.service.js';
import { getPlatformDashboardSummary } from './platform.service.js';

function getActor(req: Request) {
  return {
    platformAdminId: req.platformAdmin!.id,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  };
}

export async function getPlatformDashboardController(
  _req: Request,
  res: Response
): Promise<void> {
  const summary = await getPlatformDashboardSummary();
  sendSuccess(res, summary, 'Platform dashboard metrics retrieved.');
}

export async function listPlatformTenantsController(
  req: Request,
  res: Response
): Promise<void> {
  const query = listTenantsQuerySchema.parse(req.query);
  const result = await listTenants(query);
  sendPaginated(
    res,
    result.items,
    {
      page: result.page,
      limit: result.limit,
      totalItems: result.totalItems,
    },
    'Tenants retrieved successfully.'
  );
}

export async function createPlatformTenantController(
  req: Request,
  res: Response
): Promise<void> {
  const input = createTenantSchema.parse(req.body);
  const tenant = await createTenant(input, getActor(req));
  sendCreated(res, tenant, 'Tenant registered successfully.');
}

export async function getPlatformTenantDetailsController(
  req: Request,
  res: Response
): Promise<void> {
  const tenantId = uuidSchema.parse(req.params.tenantId);
  const tenant = await getTenantDetails(tenantId);
  sendSuccess(res, tenant, 'Tenant details retrieved successfully.');
}

export async function updatePlatformTenantController(
  req: Request,
  res: Response
): Promise<void> {
  const tenantId = uuidSchema.parse(req.params.tenantId);
  const input = updateTenantSchema.parse(req.body);
  const tenant = await updateTenant(tenantId, input, getActor(req));
  sendSuccess(res, tenant, 'Tenant updated successfully.');
}

export async function updatePlatformTenantStatusController(
  req: Request,
  res: Response
): Promise<void> {
  const tenantId = uuidSchema.parse(req.params.tenantId);
  const input = updateTenantStatusSchema.parse(req.body);
  const tenant = await updateTenantStatus(tenantId, input, getActor(req));
  sendSuccess(res, tenant, `Tenant status updated to ${input.status}.`);
}

export async function listPlatformTenantUsersController(
  req: Request,
  res: Response
): Promise<void> {
  const tenantId = uuidSchema.parse(req.params.tenantId);
  const query = paginationQuerySchema.parse(req.query);
  const result = await listTenantUsersForPlatform(tenantId, query.page, query.limit);

  sendPaginated(
    res,
    result.items,
    {
      page: result.page,
      limit: result.limit,
      totalItems: result.totalItems,
    },
    'Tenant users retrieved successfully.'
  );
}

export async function listPlatformAuditLogsController(
  req: Request,
  res: Response
): Promise<void> {
  const query = auditLogQuerySchema.parse(req.query);
  const result = await listPlatformAuditLogs(query);

  sendPaginated(
    res,
    result.items,
    {
      page: result.page,
      limit: result.limit,
      totalItems: result.totalItems,
    },
    'Platform audit logs retrieved successfully.'
  );
}
