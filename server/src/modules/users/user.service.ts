import type { Prisma } from '@prisma/client';
import type {
  AuthenticatedTenantUser,
  CreateRoleInput,
  CreateTenantUserInput,
  ListTenantUsersQueryInput,
  UpdateRoleInput,
  UpdateTenantUserInput,
  UserStatus,
} from '@cheque-saas/shared';
import { getPrisma } from '../../config/prisma.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../core/errors.js';
import { hashPassword } from '../../utils/crypto.js';
import { recordTenantAudit } from '../audit-logs/audit.service.js';
import type { TenantActorMeta } from '../companies/company.service.js';

const USER_SELECT_SAFE = {
  id: true,
  tenantId: true,
  firstName: true,
  lastName: true,
  email: true,
  username: true,
  mobileNumber: true,
  isClientAdmin: true,
  status: true,
  companyAccessScope: true,
  lastLoginAt: true,
  lastActivityAt: true,
  passwordUpdatedAt: true,
  createdAt: true,
  updatedAt: true,
  userRoles: {
    include: {
      role: {
        select: { id: true, code: true, name: true, isClientAdmin: true },
      },
    },
  },
  permissionOverrides: {
    include: {
      permission: { select: { id: true, code: true, name: true, moduleKey: true } },
    },
  },
  userCompanies: {
    include: {
      company: {
        select: { id: true, companyCode: true, companyName: true, status: true },
      },
    },
  },
} satisfies Prisma.UserSelect;

function formatSafeUser(u: Prisma.UserGetPayload<{ select: typeof USER_SELECT_SAFE }>) {
  return {
    id: u.id,
    tenantId: u.tenantId,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    username: u.username,
    mobileNumber: u.mobileNumber,
    isClientAdmin: u.isClientAdmin,
    status: u.status,
    companyAccessScope: u.companyAccessScope,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    lastActivityAt: u.lastActivityAt?.toISOString() ?? null,
    passwordUpdatedAt: u.passwordUpdatedAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
    roles: u.userRoles.map((ur) => ur.role),
    permissionOverrides: u.permissionOverrides.map((ov) => ({
      permissionCode: ov.permission.code,
      permissionName: ov.permission.name,
      moduleKey: ov.permission.moduleKey,
      effect: ov.effect,
    })),
    companies: u.userCompanies.map((uc) => uc.company),
  };
}

export async function listTenantUsers(
  tenantId: string,
  query: ListTenantUsersQueryInput
) {
  const prisma = getPrisma();
  const where: Prisma.UserWhereInput = {
    tenantId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { firstName: { contains: query.search } },
            { lastName: { contains: query.search } },
            { email: { contains: query.search } },
            { username: { contains: query.search } },
          ],
        }
      : {}),
  };

  const skip = (query.page - 1) * query.limit;
  const [rows, totalItems] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip,
      take: query.limit,
      select: USER_SELECT_SAFE,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    items: rows.map(formatSafeUser),
    totalItems,
    page: query.page,
    limit: query.limit,
  };
}

export async function getTenantUserById(tenantId: string, userId: string) {
  const prisma = getPrisma();
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: USER_SELECT_SAFE,
  });

  if (!user) {
    throw new NotFoundError('User');
  }

  return formatSafeUser(user);
}

export async function createTenantUser(
  actor: AuthenticatedTenantUser,
  input: CreateTenantUserInput,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();

  const existingDuplicate = await prisma.user.findFirst({
    where: {
      tenantId: actor.tenantId,
      OR: [{ email: input.email }, { username: input.username }],
    },
    select: { id: true, email: true, username: true },
  });

  if (existingDuplicate) {
    throw new ConflictError('A user with this email or username already exists in the organization.');
  }

  // Validate roles belong to the same tenant
  if (input.roleIds.length > 0) {
    const validRoles = await prisma.role.findMany({
      where: { id: { in: input.roleIds }, tenantId: actor.tenantId },
      select: { id: true },
    });
    if (validRoles.length !== new Set(input.roleIds).size) {
      throw new ForbiddenError('One or more roles do not belong to this organization.');
    }
  }

  // Validate companies belong to the same tenant
  if (input.companyAccessScope === 'SELECTED_COMPANIES' && input.companyIds.length === 0) {
    throw new ValidationError('Select at least one company when using Selected Companies scope.');
  }

  if (input.companyIds.length > 0) {
    const validCompanies = await prisma.company.findMany({
      where: { id: { in: input.companyIds }, tenantId: actor.tenantId },
      select: { id: true },
    });
    if (validCompanies.length !== new Set(input.companyIds).size) {
      throw new ForbiddenError('One or more companies do not belong to this organization.');
    }
  }

  // Resolve permission codes
  const overrideCodes = input.permissionOverrides.map((p) => p.permissionCode);
  const permissions = overrideCodes.length
    ? await prisma.permission.findMany({ where: { code: { in: overrideCodes } } })
    : [];
  const permByCode = new Map(permissions.map((p) => [p.code, p.id]));
  for (const ov of input.permissionOverrides) {
    if (!permByCode.has(ov.permissionCode)) {
      throw new ValidationError(`Unknown permission code '${ov.permissionCode}'.`);
    }
  }

  const passwordHash = await hashPassword(input.password);

  const createdUserId = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        tenantId: actor.tenantId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        username: input.username,
        mobileNumber: input.mobileNumber ?? null,
        passwordHash,
        isClientAdmin: input.isClientAdmin,
        status: 'ACTIVE',
        companyAccessScope: input.companyAccessScope,
        passwordUpdatedAt: new Date(),
        createdBy: actor.id,
      },
    });

    if (input.roleIds.length > 0) {
      await tx.userRole.createMany({
        data: Array.from(new Set(input.roleIds)).map((roleId) => ({
          tenantId: actor.tenantId,
          userId: user.id,
          roleId,
          createdBy: actor.id,
        })),
      });
    }

    if (input.companyAccessScope === 'SELECTED_COMPANIES' && input.companyIds.length > 0) {
      await tx.userCompany.createMany({
        data: Array.from(new Set(input.companyIds)).map((companyId, idx) => ({
          tenantId: actor.tenantId,
          userId: user.id,
          companyId,
          isDefault: idx === 0,
          createdBy: actor.id,
        })),
      });
    }

    if (input.permissionOverrides.length > 0) {
      await tx.userPermissionOverride.createMany({
        data: input.permissionOverrides.map((ov) => ({
          tenantId: actor.tenantId,
          userId: user.id,
          permissionId: permByCode.get(ov.permissionCode)!,
          effect: ov.effect,
          createdBy: actor.id,
        })),
      });
    }

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'USER_CREATED',
        entityType: 'User',
        entityId: user.id,
        newValues: {
          email: user.email,
          username: user.username,
          isClientAdmin: user.isClientAdmin,
          companyAccessScope: user.companyAccessScope,
          roleIds: input.roleIds,
          companyIds: input.companyIds,
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return user.id;
  });

  return getTenantUserById(actor.tenantId, createdUserId);
}

export async function updateTenantUser(
  actor: AuthenticatedTenantUser,
  userId: string,
  input: UpdateTenantUserInput,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.user.findFirst({
    where: { id: userId, tenantId: actor.tenantId },
    select: USER_SELECT_SAFE,
  });

  if (!existing) {
    throw new NotFoundError('User');
  }

  if (input.email && input.email !== existing.email) {
    const dup = await prisma.user.findUnique({
      where: {
        tenantId_email: {
          tenantId: actor.tenantId,
          email: input.email,
        },
      },
      select: { id: true },
    });
    if (dup) {
      throw new ConflictError('Another user already uses this email address.');
    }
  }

  if (input.roleIds) {
    const validRoles = await prisma.role.findMany({
      where: { id: { in: input.roleIds }, tenantId: actor.tenantId },
      select: { id: true },
    });
    if (validRoles.length !== new Set(input.roleIds).size) {
      throw new ForbiddenError('One or more roles do not belong to this organization.');
    }
  }

  if (input.companyAccessScope === 'SELECTED_COMPANIES' && input.companyIds && input.companyIds.length === 0) {
    throw new ValidationError('Select at least one company when using Selected Companies scope.');
  }

  if (input.companyIds && input.companyIds.length > 0) {
    const validCompanies = await prisma.company.findMany({
      where: { id: { in: input.companyIds }, tenantId: actor.tenantId },
      select: { id: true },
    });
    if (validCompanies.length !== new Set(input.companyIds).size) {
      throw new ForbiddenError('One or more companies do not belong to this organization.');
    }
  }

  let permByCode = new Map<string, string>();
  if (input.permissionOverrides) {
    const codes = input.permissionOverrides.map((o) => o.permissionCode);
    const perms = codes.length
      ? await prisma.permission.findMany({ where: { code: { in: codes } } })
      : [];
    permByCode = new Map(perms.map((p) => [p.code, p.id]));
    for (const ov of input.permissionOverrides) {
      if (!permByCode.has(ov.permissionCode)) {
        throw new ValidationError(`Unknown permission code '${ov.permissionCode}'.`);
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: existing.id },
      data: {
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.mobileNumber !== undefined ? { mobileNumber: input.mobileNumber } : {}),
        ...(input.isClientAdmin !== undefined ? { isClientAdmin: input.isClientAdmin } : {}),
        ...(input.companyAccessScope !== undefined
          ? { companyAccessScope: input.companyAccessScope }
          : {}),
        updatedBy: actor.id,
      },
    });

    if (input.roleIds !== undefined) {
      await tx.userRole.deleteMany({
        where: { tenantId: actor.tenantId, userId: existing.id },
      });
      if (input.roleIds.length > 0) {
        await tx.userRole.createMany({
          data: Array.from(new Set(input.roleIds)).map((roleId) => ({
            tenantId: actor.tenantId,
            userId: existing.id,
            roleId,
            createdBy: actor.id,
          })),
        });
      }
    }

    if (input.companyIds !== undefined) {
      await tx.userCompany.deleteMany({
        where: { tenantId: actor.tenantId, userId: existing.id },
      });
      const scope = input.companyAccessScope ?? existing.companyAccessScope;
      if (scope === 'SELECTED_COMPANIES' && input.companyIds.length > 0) {
        await tx.userCompany.createMany({
          data: Array.from(new Set(input.companyIds)).map((companyId, idx) => ({
            tenantId: actor.tenantId,
            userId: existing.id,
            companyId,
            isDefault: idx === 0,
            createdBy: actor.id,
          })),
        });
      }
    }

    if (input.permissionOverrides !== undefined) {
      await tx.userPermissionOverride.deleteMany({
        where: { tenantId: actor.tenantId, userId: existing.id },
      });
      if (input.permissionOverrides.length > 0) {
        await tx.userPermissionOverride.createMany({
          data: input.permissionOverrides.map((ov) => ({
            tenantId: actor.tenantId,
            userId: existing.id,
            permissionId: permByCode.get(ov.permissionCode)!,
            effect: ov.effect,
            createdBy: actor.id,
          })),
        });
      }
    }

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'USER_UPDATED',
        entityType: 'User',
        entityId: existing.id,
        previousValues: formatSafeUser(existing),
        newValues: input,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );
  });

  return getTenantUserById(actor.tenantId, existing.id);
}

export async function updateTenantUserStatus(
  actor: AuthenticatedTenantUser,
  userId: string,
  status: UserStatus,
  reason: string | undefined,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.user.findFirst({
    where: { id: userId, tenantId: actor.tenantId },
  });

  if (!existing) {
    throw new NotFoundError('User');
  }

  if (existing.id === actor.id && status !== 'ACTIVE') {
    throw new ConflictError('You cannot deactivate or suspend your own active account.');
  }

  if (existing.isClientAdmin && status !== 'ACTIVE') {
    const activeAdmins = await prisma.user.count({
      where: {
        tenantId: actor.tenantId,
        isClientAdmin: true,
        status: 'ACTIVE',
        id: { not: existing.id },
      },
    });
    if (activeAdmins === 0) {
      throw new ConflictError('At least one active Client Administrator must remain in the organization.');
    }
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: existing.id },
      data: { status, updatedBy: actor.id },
    });

    if (status !== 'ACTIVE') {
      await tx.userSession.updateMany({
        where: { tenantId: actor.tenantId, userId: existing.id, revokedAt: null },
        data: { revokedAt: now, revokedReason: `ADMIN_${status}` },
      });
    }

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: `USER_STATUS_${status}`,
        entityType: 'User',
        entityId: existing.id,
        previousValues: { status: existing.status },
        newValues: { status, reason: reason ?? null },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );
  });

  return getTenantUserById(actor.tenantId, existing.id);
}

export async function adminResetTenantUserPassword(
  actor: AuthenticatedTenantUser,
  userId: string,
  newPassword: string,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.user.findFirst({
    where: { id: userId, tenantId: actor.tenantId },
  });

  if (!existing) {
    throw new NotFoundError('User');
  }

  const nextHash = await hashPassword(newPassword);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: existing.id },
      data: {
        passwordHash: nextHash,
        passwordUpdatedAt: now,
        updatedBy: actor.id,
      },
    });

    await tx.userSession.updateMany({
      where: { tenantId: actor.tenantId, userId: existing.id, revokedAt: null },
      data: { revokedAt: now, revokedReason: 'ADMIN_PASSWORD_RESET' },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'USER_PASSWORD_RESET_BY_ADMIN',
        entityType: 'User',
        entityId: existing.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );
  });
}

export async function getTenantUserActivity(
  tenantId: string,
  userId: string,
  page = 1,
  limit = 20
) {
  const prisma = getPrisma();
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: { id: true },
  });
  if (!user) {
    throw new NotFoundError('User');
  }

  const skip = (page - 1) * limit;
  const [auditItems, totalAuditItems, recentAuthLogs] = await Promise.all([
    prisma.auditLog.findMany({
      where: { tenantId, userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.auditLog.count({ where: { tenantId, userId } }),
    prisma.authenticationLog.findMany({
      where: { tenantId, userId },
      orderBy: { createdAt: 'desc' },
      take: 15,
    }),
  ]);

  return {
    auditItems,
    totalItems: totalAuditItems,
    page,
    limit,
    recentAuthLogs,
  };
}

export async function listTenantRoles(tenantId: string) {
  const prisma = getPrisma();
  const roles = await prisma.role.findMany({
    where: { tenantId },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    include: {
      rolePermissions: {
        include: {
          permission: {
            select: { id: true, code: true, name: true, moduleKey: true },
          },
        },
      },
      _count: { select: { userRoles: true } },
    },
  });

  return roles.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    isClientAdmin: r.isClientAdmin,
    status: r.status,
    usersCount: r._count.userRoles,
    permissions: r.rolePermissions.map((rp) => rp.permission),
  }));
}

export async function createTenantRole(
  actor: AuthenticatedTenantUser,
  input: CreateRoleInput,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.role.findUnique({
    where: {
      tenantId_code: {
        tenantId: actor.tenantId,
        code: input.code,
      },
    },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictError(`Role code '${input.code}' already exists in this organization.`);
  }

  const perms = input.permissionCodes.length
    ? await prisma.permission.findMany({
        where: { code: { in: input.permissionCodes } },
      })
    : [];

  if (perms.length !== new Set(input.permissionCodes).size) {
    throw new ValidationError('One or more permission codes are invalid.');
  }

  return prisma.$transaction(async (tx) => {
    const role = await tx.role.create({
      data: {
        tenantId: actor.tenantId,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        isSystem: false,
        isClientAdmin: false,
        status: 'ACTIVE',
        createdBy: actor.id,
      },
    });

    if (perms.length > 0) {
      await tx.rolePermission.createMany({
        data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
      });
    }

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'ROLE_CREATED',
        entityType: 'Role',
        entityId: role.id,
        newValues: { code: role.code, name: role.name, permissionCodes: input.permissionCodes },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return role;
  });
}

export async function updateTenantRole(
  actor: AuthenticatedTenantUser,
  roleId: string,
  input: UpdateRoleInput,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.role.findFirst({
    where: { id: roleId, tenantId: actor.tenantId },
  });

  if (!existing) {
    throw new NotFoundError('Role');
  }

  if (existing.isClientAdmin && input.status === 'INACTIVE') {
    throw new ConflictError('Cannot deactivate the system Client Administrator role.');
  }

  let perms: Array<{ id: string; code: string }> = [];
  if (input.permissionCodes) {
    perms = await prisma.permission.findMany({
      where: { code: { in: input.permissionCodes } },
      select: { id: true, code: true },
    });
    if (perms.length !== new Set(input.permissionCodes).size) {
      throw new ValidationError('One or more permission codes are invalid.');
    }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.role.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        updatedBy: actor.id,
      },
    });

    if (input.permissionCodes !== undefined) {
      await tx.rolePermission.deleteMany({ where: { roleId: existing.id } });
      if (perms.length > 0) {
        await tx.rolePermission.createMany({
          data: perms.map((p) => ({ roleId: existing.id, permissionId: p.id })),
        });
      }
    }

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'ROLE_UPDATED',
        entityType: 'Role',
        entityId: existing.id,
        previousValues: existing,
        newValues: input,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return updated;
  });
}

export async function listPermissionCatalog() {
  const prisma = getPrisma();
  return prisma.permission.findMany({
    orderBy: [{ moduleKey: 'asc' }, { name: 'asc' }],
  });
}
