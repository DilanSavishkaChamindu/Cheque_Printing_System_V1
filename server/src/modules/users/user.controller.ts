import type { Request, Response } from 'express';
import {
  adminResetUserPasswordSchema,
  createRoleSchema,
  createTenantUserSchema,
  listTenantUsersQuerySchema,
  paginationQuerySchema,
  updateRoleSchema,
  updateTenantUserSchema,
  updateTenantUserStatusSchema,
  uuidSchema,
} from '@cheque-saas/shared';
import { sendCreated, sendPaginated, sendSuccess } from '../../core/response.js';
import { getClientIp, getUserAgent } from '../../utils/sanitize.js';
import {
  adminResetTenantUserPassword,
  createTenantRole,
  createTenantUser,
  getTenantUserActivity,
  getTenantUserById,
  listPermissionCatalog,
  listTenantRoles,
  listTenantUsers,
  updateTenantRole,
  updateTenantUser,
  updateTenantUserStatus,
} from './user.service.js';

function getMeta(req: Request) {
  return {
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    requestId: req.requestId ?? null,
  };
}

export async function listUsersController(req: Request, res: Response): Promise<void> {
  const query = listTenantUsersQuerySchema.parse(req.query);
  const result = await listTenantUsers(req.tenantUser!.tenantId, query);
  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    totalItems: result.totalItems,
  });
}

export async function getUserController(req: Request, res: Response): Promise<void> {
  const userId = uuidSchema.parse(req.params.userId);
  const user = await getTenantUserById(req.tenantUser!.tenantId, userId);
  sendSuccess(res, user, 'User details retrieved.');
}

export async function createUserController(req: Request, res: Response): Promise<void> {
  const input = createTenantUserSchema.parse(req.body);
  const user = await createTenantUser(req.tenantUser!, input, getMeta(req));
  sendCreated(res, user, 'User created successfully.');
}

export async function updateUserController(req: Request, res: Response): Promise<void> {
  const userId = uuidSchema.parse(req.params.userId);
  const input = updateTenantUserSchema.parse(req.body);
  const user = await updateTenantUser(req.tenantUser!, userId, input, getMeta(req));
  sendSuccess(res, user, 'User updated successfully.');
}

export async function updateUserStatusController(req: Request, res: Response): Promise<void> {
  const userId = uuidSchema.parse(req.params.userId);
  const input = updateTenantUserStatusSchema.parse(req.body);
  const user = await updateTenantUserStatus(
    req.tenantUser!,
    userId,
    input.status,
    input.reason,
    getMeta(req)
  );
  sendSuccess(res, user, `User status updated to ${input.status}.`);
}

export async function adminResetPasswordController(req: Request, res: Response): Promise<void> {
  const userId = uuidSchema.parse(req.params.userId);
  const input = adminResetUserPasswordSchema.parse(req.body);
  await adminResetTenantUserPassword(
    req.tenantUser!,
    userId,
    input.newPassword,
    getMeta(req)
  );
  sendSuccess(res, { reset: true }, 'User password has been reset and active sessions revoked.');
}

export async function getUserActivityController(req: Request, res: Response): Promise<void> {
  const userId = uuidSchema.parse(req.params.userId);
  const query = paginationQuerySchema.parse(req.query);
  const activity = await getTenantUserActivity(
    req.tenantUser!.tenantId,
    userId,
    query.page,
    query.limit
  );
  sendSuccess(res, activity, 'User activity retrieved.');
}

export async function listRolesController(req: Request, res: Response): Promise<void> {
  const roles = await listTenantRoles(req.tenantUser!.tenantId);
  sendSuccess(res, roles, 'Roles retrieved.');
}

export async function createRoleController(req: Request, res: Response): Promise<void> {
  const input = createRoleSchema.parse(req.body);
  const role = await createTenantRole(req.tenantUser!, input, getMeta(req));
  sendCreated(res, role, 'Role created successfully.');
}

export async function updateRoleController(req: Request, res: Response): Promise<void> {
  const roleId = uuidSchema.parse(req.params.roleId);
  const input = updateRoleSchema.parse(req.body);
  const role = await updateTenantRole(req.tenantUser!, roleId, input, getMeta(req));
  sendSuccess(res, role, 'Role updated successfully.');
}

export async function listPermissionsController(_req: Request, res: Response): Promise<void> {
  const permissions = await listPermissionCatalog();
  sendSuccess(res, permissions, 'Permissions retrieved.');
}
