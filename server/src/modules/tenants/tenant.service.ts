import type { Prisma } from '@prisma/client';
import {
  INITIAL_FEATURE_CATALOG,
  INITIAL_PERMISSION_CATALOG,
  PERMISSION_CODES,
  type AuthenticatedTenantUser,
  type CreateTenantInput,
  type ListTenantsQueryInput,
  type TenantStatus,
  type UpdateTenantInput,
  type UpdateTenantProfileSelfInput,
  type UpdateTenantStatusInput,
} from '@cheque-saas/shared';
import { getPrisma } from '../../config/prisma.js';
import { ConflictError, NotFoundError } from '../../core/errors.js';
import { hashPassword } from '../../utils/crypto.js';
import { recordPlatformAudit, recordTenantAudit } from '../audit-logs/audit.service.js';
import {
  getTenantFeatureEntitlements,
  type PlatformActorMeta,
} from '../features/feature.service.js';

const TENANT_SORT_FIELDS: Record<string, keyof Prisma.TenantOrderByWithRelationInput> = {
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  organizationName: 'organizationName',
  tenantCode: 'tenantCode',
  status: 'status',
};

export async function listTenants(query: ListTenantsQueryInput) {
  const prisma = getPrisma();
  const where: Prisma.TenantWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.country ? { country: query.country } : {}),
    ...(query.search
      ? {
          OR: [
            { tenantCode: { contains: query.search } },
            { organizationName: { contains: query.search } },
            { registeredBusinessName: { contains: query.search } },
            { contactPerson: { contains: query.search } },
            { email: { contains: query.search } },
          ],
        }
      : {}),
  };

  const sortField = (query.sortBy && TENANT_SORT_FIELDS[query.sortBy]) || 'createdAt';
  const skip = (query.page - 1) * query.limit;

  const [tenants, totalItems] = await Promise.all([
    prisma.tenant.findMany({
      where,
      orderBy: { [sortField]: query.sortOrder },
      skip,
      take: query.limit,
      include: {
        _count: {
          select: {
            users: true,
            companies: true,
            issuedCheques: true,
            receivedCheques: true,
          },
        },
      },
    }),
    prisma.tenant.count({ where }),
  ]);

  return {
    items: tenants.map((t) => ({
      id: t.id,
      tenantCode: t.tenantCode,
      organizationName: t.organizationName,
      registeredBusinessName: t.registeredBusinessName,
      contactPerson: t.contactPerson,
      email: t.email,
      contactNumber: t.contactNumber,
      country: t.country,
      registrationNumber: t.registrationNumber,
      status: t.status,
      defaultCompanyId: t.defaultCompanyId,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      usage: {
        usersCount: t._count.users,
        companiesCount: t._count.companies,
        issuedChequesCount: t._count.issuedCheques,
        receivedChequesCount: t._count.receivedCheques,
      },
    })),
    totalItems,
    page: query.page,
    limit: query.limit,
  };
}

export async function createTenant(
  input: CreateTenantInput,
  actor: PlatformActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.tenant.findUnique({
    where: { tenantCode: input.tenantCode },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictError(`Tenant code '${input.tenantCode}' is already registered.`);
  }

  const adminPasswordHash = await hashPassword(input.clientAdmin.password);

  const created = await prisma.$transaction(async (tx) => {
    // Ensure baseline feature & permission catalogs exist even in fresh test DBs
    for (const feat of INITIAL_FEATURE_CATALOG) {
      await tx.feature.upsert({
        where: { key: feat.key },
        update: {},
        create: {
          key: feat.key,
          name: feat.name,
          description: feat.description,
          category: feat.category,
          isGlobalActive: true,
          isDefaultEnabled: feat.isDefaultEnabled,
          sortOrder: feat.sortOrder,
        },
      });
    }

    for (const perm of INITIAL_PERMISSION_CATALOG) {
      await tx.permission.upsert({
        where: { code: perm.code },
        update: {},
        create: {
          code: perm.code,
          name: perm.name,
          moduleKey: perm.moduleKey,
          description: perm.description,
        },
      });
    }

    const tenant = await tx.tenant.create({
      data: {
        tenantCode: input.tenantCode,
        organizationName: input.organizationName,
        registeredBusinessName: input.registeredBusinessName ?? null,
        contactPerson: input.contactPerson,
        email: input.email,
        contactNumber: input.contactNumber ?? null,
        address: input.address ?? null,
        country: input.country,
        registrationNumber: input.registrationNumber ?? null,
        status: input.status,
        createdBy: actor.platformAdminId,
      },
    });

    await tx.tenantSetting.create({
      data: {
        tenantId: tenant.id,
        defaultCurrency: input.defaultCurrency,
        dateFormat: 'DD/MM/YYYY',
        timezone: 'Asia/Colombo',
      },
    });

    const defaultCompany = await tx.company.create({
      data: {
        tenantId: tenant.id,
        companyCode: input.defaultCompanyCode ?? 'DEFAULT',
        companyName: input.defaultCompanyName ?? input.organizationName,
        registeredBusinessName: input.registeredBusinessName ?? null,
        registrationNumber: input.registrationNumber ?? null,
        address: input.address ?? null,
        country: input.country,
        email: input.email,
        contactNumber: input.contactNumber ?? null,
        isDefault: true,
        status: 'ACTIVE',
        createdBy: actor.platformAdminId,
      },
    });

    await tx.companySetting.create({
      data: {
        tenantId: tenant.id,
        companyId: defaultCompany.id,
        defaultCurrency: input.defaultCurrency,
        defaultChequeDateFormat: 'DD/MM/YYYY',
      },
    });

    const updatedTenant = await tx.tenant.update({
      where: { id: tenant.id },
      data: { defaultCompanyId: defaultCompany.id },
    });

    const allPermissions = await tx.permission.findMany();
    const permByCode = new Map(allPermissions.map((p) => [p.code, p.id]));

    const clientAdminRole = await tx.role.create({
      data: {
        tenantId: tenant.id,
        code: 'CLIENT_ADMIN',
        name: 'Client Administrator',
        description: 'Full organization administrative access within enabled features.',
        isSystem: true,
        isClientAdmin: true,
        status: 'ACTIVE',
        createdBy: actor.platformAdminId,
      },
    });

    await tx.rolePermission.createMany({
      data: allPermissions.map((perm) => ({
        roleId: clientAdminRole.id,
        permissionId: perm.id,
      })),
    });

    const operatorRole = await tx.role.create({
      data: {
        tenantId: tenant.id,
        code: 'CHEQUE_OPERATOR',
        name: 'Cheque Operator',
        description: 'Create, preview, print cheques and view cheque history.',
        isSystem: true,
        isClientAdmin: false,
        status: 'ACTIVE',
        createdBy: actor.platformAdminId,
      },
    });

    const operatorPermissionCodes = [
      PERMISSION_CODES.DASHBOARD_VIEW,
      PERMISSION_CODES.CHEQUE_CREATE,
      PERMISSION_CODES.CHEQUE_EDIT,
      PERMISSION_CODES.CHEQUE_HISTORY_VIEW,
      PERMISSION_CODES.CHEQUE_PRINT,
      PERMISSION_CODES.CHEQUE_BOOK_VIEW,
      PERMISSION_CODES.BANK_VIEW,
      PERMISSION_CODES.BANK_ACCOUNT_VIEW,
      PERMISSION_CODES.TEMPLATE_VIEW,
    ];

    await tx.rolePermission.createMany({
      data: operatorPermissionCodes
        .map((code) => permByCode.get(code))
        .filter((id): id is string => Boolean(id))
        .map((permissionId) => ({
          roleId: operatorRole.id,
          permissionId,
        })),
    });

    const clientAdminUser = await tx.user.create({
      data: {
        tenantId: tenant.id,
        firstName: input.clientAdmin.firstName,
        lastName: input.clientAdmin.lastName,
        email: input.clientAdmin.email,
        username: input.clientAdmin.username,
        mobileNumber: input.clientAdmin.mobileNumber ?? null,
        passwordHash: adminPasswordHash,
        isClientAdmin: true,
        status: 'ACTIVE',
        companyAccessScope: 'ALL_COMPANIES',
        passwordUpdatedAt: new Date(),
        createdBy: actor.platformAdminId,
      },
    });

    await tx.userRole.create({
      data: {
        tenantId: tenant.id,
        userId: clientAdminUser.id,
        roleId: clientAdminRole.id,
        createdBy: actor.platformAdminId,
      },
    });

    const allFeatures = await tx.feature.findMany();
    const requestedFeatureSet = input.enabledFeatureKeys
      ? new Set(input.enabledFeatureKeys)
      : null;

    for (const feature of allFeatures) {
      const enabled = requestedFeatureSet
        ? requestedFeatureSet.has(feature.key)
        : feature.isDefaultEnabled;

      await tx.tenantFeature.create({
        data: {
          tenantId: tenant.id,
          featureId: feature.id,
          isEnabled: enabled,
          isOverride: Boolean(requestedFeatureSet),
          overrideReason: requestedFeatureSet ? 'Initial tenant provisioning' : null,
          updatedBy: actor.platformAdminId,
        },
      });

      await tx.tenantFeatureHistory.create({
        data: {
          tenantId: tenant.id,
          featureId: feature.id,
          previousEnabled: null,
          newEnabled: enabled,
          isOverride: Boolean(requestedFeatureSet),
          reason: 'Initial tenant provisioning',
          changedByActorType: 'PLATFORM_ADMIN',
          changedById: actor.platformAdminId,
        },
      });
    }

    await recordPlatformAudit(
      {
        platformAdminId: actor.platformAdminId,
        tenantId: tenant.id,
        action: 'TENANT_CREATED',
        entityType: 'Tenant',
        entityId: tenant.id,
        newValues: {
          tenantCode: tenant.tenantCode,
          organizationName: tenant.organizationName,
          status: tenant.status,
          defaultCompanyId: defaultCompany.id,
          clientAdminEmail: clientAdminUser.email,
        },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      },
      tx
    );

    return {
      tenant: updatedTenant,
      defaultCompany,
      clientAdminUser: {
        id: clientAdminUser.id,
        email: clientAdminUser.email,
        username: clientAdminUser.username,
        firstName: clientAdminUser.firstName,
        lastName: clientAdminUser.lastName,
      },
    };
  });

  return getTenantDetails(created.tenant.id);
}

export async function getTenantDetails(tenantId: string) {
  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      settings: true,
      defaultCompany: {
        select: {
          id: true,
          companyCode: true,
          companyName: true,
          status: true,
        },
      },
      companies: {
        orderBy: [{ isDefault: 'desc' }, { companyName: 'asc' }],
        select: {
          id: true,
          companyCode: true,
          companyName: true,
          isDefault: true,
          status: true,
        },
      },
      _count: {
        select: {
          users: true,
          companies: true,
          bankAccounts: true,
          issuedCheques: true,
          receivedCheques: true,
          registeredDevices: true,
        },
      },
    },
  });

  if (!tenant) {
    throw new NotFoundError('Tenant');
  }

  const [activeUsersCount, features] = await Promise.all([
    prisma.user.count({ where: { tenantId, status: 'ACTIVE' } }),
    getTenantFeatureEntitlements(tenantId),
  ]);

  return {
    id: tenant.id,
    tenantCode: tenant.tenantCode,
    organizationName: tenant.organizationName,
    registeredBusinessName: tenant.registeredBusinessName,
    contactPerson: tenant.contactPerson,
    email: tenant.email,
    contactNumber: tenant.contactNumber,
    address: tenant.address,
    country: tenant.country,
    registrationNumber: tenant.registrationNumber,
    status: tenant.status,
    statusReason: tenant.statusReason,
    suspendedAt: tenant.suspendedAt?.toISOString() ?? null,
    defaultCompanyId: tenant.defaultCompanyId,
    defaultCompany: tenant.defaultCompany,
    companies: tenant.companies,
    settings: tenant.settings,
    usage: {
      usersCount: tenant._count.users,
      activeUsersCount,
      companiesCount: tenant._count.companies,
      bankAccountsCount: tenant._count.bankAccounts,
      issuedChequesCount: tenant._count.issuedCheques,
      receivedChequesCount: tenant._count.receivedCheques,
      registeredDevicesCount: tenant._count.registeredDevices,
    },
    features,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
  };
}

export async function updateTenant(
  tenantId: string,
  input: UpdateTenantInput,
  actor: PlatformActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { settings: true },
  });

  if (!existing) {
    throw new NotFoundError('Tenant');
  }

  if (input.defaultCompanyId) {
    const company = await prisma.company.findFirst({
      where: { id: input.defaultCompanyId, tenantId, status: 'ACTIVE' },
    });
    if (!company) {
      throw new NotFoundError('Default company within tenant');
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: tenantId },
      data: {
        ...(input.organizationName !== undefined ? { organizationName: input.organizationName } : {}),
        ...(input.registeredBusinessName !== undefined
          ? { registeredBusinessName: input.registeredBusinessName }
          : {}),
        ...(input.contactPerson !== undefined ? { contactPerson: input.contactPerson } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.contactNumber !== undefined ? { contactNumber: input.contactNumber } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.country !== undefined ? { country: input.country } : {}),
        ...(input.registrationNumber !== undefined
          ? { registrationNumber: input.registrationNumber }
          : {}),
        ...(input.defaultCompanyId !== undefined
          ? { defaultCompanyId: input.defaultCompanyId }
          : {}),
        updatedBy: actor.platformAdminId,
      },
    });

    if (input.defaultCompanyId) {
      await tx.company.updateMany({
        where: { tenantId },
        data: { isDefault: false },
      });
      await tx.company.update({
        where: { id: input.defaultCompanyId },
        data: { isDefault: true },
      });
    }

    if (input.settings) {
      await tx.tenantSetting.upsert({
        where: { tenantId },
        update: {
          ...(input.settings.defaultCurrency !== undefined
            ? { defaultCurrency: input.settings.defaultCurrency }
            : {}),
          ...(input.settings.dateFormat !== undefined
            ? { dateFormat: input.settings.dateFormat }
            : {}),
          ...(input.settings.timezone !== undefined
            ? { timezone: input.settings.timezone }
            : {}),
          ...(input.settings.offlineMaxSessionHours !== undefined
            ? { offlineMaxSessionHours: input.settings.offlineMaxSessionHours }
            : {}),
          ...(input.settings.requireDeviceApproval !== undefined
            ? { requireDeviceApproval: input.settings.requireDeviceApproval }
            : {}),
          ...(input.settings.fiscalYearStartMonth !== undefined
            ? { fiscalYearStartMonth: input.settings.fiscalYearStartMonth }
            : {}),
        },
        create: {
          tenantId,
          defaultCurrency: input.settings.defaultCurrency ?? 'LKR',
          dateFormat: input.settings.dateFormat ?? 'DD/MM/YYYY',
          timezone: input.settings.timezone ?? 'Asia/Colombo',
          offlineMaxSessionHours: input.settings.offlineMaxSessionHours ?? 24,
          requireDeviceApproval: input.settings.requireDeviceApproval ?? true,
          fiscalYearStartMonth: input.settings.fiscalYearStartMonth ?? 1,
        },
      });
    }

    await recordPlatformAudit(
      {
        platformAdminId: actor.platformAdminId,
        tenantId,
        action: 'TENANT_UPDATED',
        entityType: 'Tenant',
        entityId: tenantId,
        previousValues: existing,
        newValues: input,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      },
      tx
    );
  });

  return getTenantDetails(tenantId);
}

export async function updateTenantStatus(
  tenantId: string,
  input: UpdateTenantStatusInput,
  actor: PlatformActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!existing) {
    throw new NotFoundError('Tenant');
  }

  const now = new Date();
  const nextStatus: TenantStatus = input.status;

  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: tenantId },
      data: {
        status: nextStatus,
        statusReason: input.reason ?? null,
        suspendedAt: nextStatus === 'SUSPENDED' ? now : null,
        updatedBy: actor.platformAdminId,
      },
    });

    // Immediately revoke active tenant sessions when tenant leaves ACTIVE status
    if (nextStatus !== 'ACTIVE') {
      await tx.userSession.updateMany({
        where: {
          tenantId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          revokedReason: `TENANT_${nextStatus}`,
        },
      });
    }

    await recordPlatformAudit(
      {
        platformAdminId: actor.platformAdminId,
        tenantId,
        action: `TENANT_STATUS_${nextStatus}`,
        entityType: 'Tenant',
        entityId: tenantId,
        previousValues: { status: existing.status, statusReason: existing.statusReason },
        newValues: { status: nextStatus, statusReason: input.reason ?? null },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      },
      tx
    );
  });

  return getTenantDetails(tenantId);
}

export async function listTenantUsersForPlatform(
  tenantId: string,
  page = 1,
  limit = 20
) {
  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });
  if (!tenant) {
    throw new NotFoundError('Tenant');
  }

  const skip = (page - 1) * limit;
  const [users, totalItems] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
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
        createdAt: true,
        userRoles: {
          include: {
            role: {
              select: { id: true, code: true, name: true },
            },
          },
        },
      },
    }),
    prisma.user.count({ where: { tenantId } }),
  ]);

  return {
    items: users.map((u) => ({
      id: u.id,
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
      createdAt: u.createdAt.toISOString(),
      roles: u.userRoles.map((ur) => ur.role),
    })),
    totalItems,
    page,
    limit,
  };
}

export async function getCurrentTenantProfile(tenantId: string) {
  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      settings: true,
      defaultCompany: {
        select: {
          id: true,
          companyCode: true,
          companyName: true,
        },
      },
    },
  });

  if (!tenant) {
    throw new NotFoundError('Tenant');
  }

  return {
    id: tenant.id,
    tenantCode: tenant.tenantCode,
    organizationName: tenant.organizationName,
    registeredBusinessName: tenant.registeredBusinessName,
    contactPerson: tenant.contactPerson,
    email: tenant.email,
    contactNumber: tenant.contactNumber,
    address: tenant.address,
    country: tenant.country,
    registrationNumber: tenant.registrationNumber,
    status: tenant.status,
    defaultCompanyId: tenant.defaultCompanyId,
    defaultCompany: tenant.defaultCompany,
    settings: tenant.settings,
  };
}

export async function updateCurrentTenantProfile(
  actor: AuthenticatedTenantUser,
  input: UpdateTenantProfileSelfInput,
  meta: { ipAddress: string | null; userAgent: string | null; requestId?: string | null }
) {
  const prisma = getPrisma();
  const existing = await prisma.tenant.findUnique({
    where: { id: actor.tenantId },
    include: { settings: true },
  });

  if (!existing) {
    throw new NotFoundError('Tenant');
  }

  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: actor.tenantId },
      data: {
        ...(input.organizationName !== undefined ? { organizationName: input.organizationName } : {}),
        ...(input.registeredBusinessName !== undefined
          ? { registeredBusinessName: input.registeredBusinessName }
          : {}),
        ...(input.contactPerson !== undefined ? { contactPerson: input.contactPerson } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.contactNumber !== undefined ? { contactNumber: input.contactNumber } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.country !== undefined ? { country: input.country } : {}),
        ...(input.registrationNumber !== undefined
          ? { registrationNumber: input.registrationNumber }
          : {}),
        updatedBy: actor.id,
      },
    });

    if (input.settings) {
      await tx.tenantSetting.upsert({
        where: { tenantId: actor.tenantId },
        update: {
          ...(input.settings.defaultCurrency !== undefined
            ? { defaultCurrency: input.settings.defaultCurrency }
            : {}),
          ...(input.settings.dateFormat !== undefined
            ? { dateFormat: input.settings.dateFormat }
            : {}),
          ...(input.settings.timezone !== undefined
            ? { timezone: input.settings.timezone }
            : {}),
          ...(input.settings.offlineMaxSessionHours !== undefined
            ? { offlineMaxSessionHours: input.settings.offlineMaxSessionHours }
            : {}),
          ...(input.settings.requireDeviceApproval !== undefined
            ? { requireDeviceApproval: input.settings.requireDeviceApproval }
            : {}),
          ...(input.settings.fiscalYearStartMonth !== undefined
            ? { fiscalYearStartMonth: input.settings.fiscalYearStartMonth }
            : {}),
        },
        create: {
          tenantId: actor.tenantId,
          defaultCurrency: input.settings.defaultCurrency ?? 'LKR',
          dateFormat: input.settings.dateFormat ?? 'DD/MM/YYYY',
          timezone: input.settings.timezone ?? 'Asia/Colombo',
          offlineMaxSessionHours: input.settings.offlineMaxSessionHours ?? 24,
          requireDeviceApproval: input.settings.requireDeviceApproval ?? true,
          fiscalYearStartMonth: input.settings.fiscalYearStartMonth ?? 1,
        },
      });
    }

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'ORGANIZATION_PROFILE_UPDATED',
        entityType: 'Tenant',
        entityId: actor.tenantId,
        previousValues: existing,
        newValues: input,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );
  });

  return getCurrentTenantProfile(actor.tenantId);
}
