import type {
  AuthenticatedPlatformAdmin,
  AuthenticatedTenantUser,
  ChangePasswordInput,
  ForgotPasswordInput,
  PermissionCode,
  PlatformLoginInput,
  PlatformLoginResponseDto,
  ResetPasswordInput,
  TenantLoginInput,
  TenantLoginResponseDto,
} from '@cheque-saas/shared';
import { getEnv } from '../../config/env.js';
import { getPrisma } from '../../config/prisma.js';
import {
  computeEffectiveFeatures,
  computeEffectivePermissions,
} from '../../core/authorization.js';
import {
  ConflictError,
  ForbiddenError,
  TenantStatusForbiddenError,
  UnauthorizedError,
  ValidationError,
} from '../../core/errors.js';
import {
  generateOpaqueToken,
  hashPassword,
  hashToken,
  signAccessToken,
  verifyPassword,
} from '../../utils/crypto.js';
import { recordAuthLog, recordTenantAudit } from '../audit-logs/audit.service.js';

export interface AuthRequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
  requestId?: string | null;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export async function buildAuthenticatedTenantUser(
  userId: string,
  sessionId: string,
  deviceId: string | null
): Promise<AuthenticatedTenantUser> {
  const prisma = getPrisma();
  const now = new Date();

  const [user, featureCatalog] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        tenant: {
          include: {
            settings: true,
            tenantFeatures: true,
            companies: {
              where: { status: 'ACTIVE' },
              orderBy: [{ isDefault: 'desc' }, { companyName: 'asc' }],
              select: {
                id: true,
                companyCode: true,
                companyName: true,
                isDefault: true,
              },
            },
          },
        },
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
        permissionOverrides: {
          include: { permission: true },
        },
        userCompanies: {
          select: { companyId: true },
        },
      },
    }),
    prisma.feature.findMany({
      select: {
        id: true,
        key: true,
        isGlobalActive: true,
        isDefaultEnabled: true,
      },
    }),
  ]);

  const enabledFeatures = computeEffectiveFeatures(
    featureCatalog,
    user.tenant.tenantFeatures,
    now
  );

  const activeRoles = user.userRoles
    .map((ur) => ur.role)
    .filter((role) => role.status === 'ACTIVE');

  const isClientAdmin =
    user.isClientAdmin || activeRoles.some((role) => role.isClientAdmin);

  const rolePermissions = activeRoles.flatMap((role) =>
    role.rolePermissions.map((rp) => rp.permission.code as PermissionCode)
  );

  const permissions = computeEffectivePermissions({
    rolePermissions,
    overrides: user.permissionOverrides.map((ov) => ({
      code: ov.permission.code as PermissionCode,
      effect: ov.effect,
    })),
  });

  const assignedIds = new Set(user.userCompanies.map((uc) => uc.companyId));
  const companies =
    user.companyAccessScope === 'ALL_COMPANIES'
      ? user.tenant.companies
      : user.tenant.companies.filter((c) => assignedIds.has(c.id));

  return {
    actorType: 'TENANT_USER',
    id: user.id,
    tenantId: user.tenantId,
    sessionId,
    deviceId,
    email: user.email,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
    isClientAdmin,
    companyAccessScope: user.companyAccessScope,
    allowedCompanyIds: companies.map((c) => c.id),
    companies,
    permissions,
    roles: activeRoles.map((r) => r.code),
    tenant: {
      id: user.tenant.id,
      tenantCode: user.tenant.tenantCode,
      organizationName: user.tenant.organizationName,
      status: user.tenant.status,
      defaultCompanyId: user.tenant.defaultCompanyId,
      enabledFeatures,
      defaultCurrency: user.tenant.settings?.defaultCurrency ?? 'LKR',
      dateFormat: user.tenant.settings?.dateFormat ?? 'DD/MM/YYYY',
      timezone: user.tenant.settings?.timezone ?? 'Asia/Colombo',
    },
  };
}

export async function loginPlatformAdmin(
  input: PlatformLoginInput,
  meta: AuthRequestMeta
): Promise<PlatformLoginResponseDto> {
  const prisma = getPrisma();
  const env = getEnv();
  const normalized = input.identifier.trim();

  const admin = await prisma.platformAdministrator.findFirst({
    where: {
      OR: [{ email: normalized }, { username: normalized }],
    },
  });

  if (!admin) {
    await recordAuthLog({
      actorType: 'PLATFORM_ADMIN',
      identifierUsed: normalized,
      eventType: 'LOGIN_FAILED',
      success: false,
      failureReason: 'ACCOUNT_NOT_FOUND',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    throw new UnauthorizedError('Invalid email/username or password.');
  }

  if (admin.status !== 'ACTIVE') {
    await recordAuthLog({
      platformAdminId: admin.id,
      actorType: 'PLATFORM_ADMIN',
      identifierUsed: normalized,
      eventType: 'LOGIN_FAILED',
      success: false,
      failureReason: `ADMIN_${admin.status}`,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    throw new ForbiddenError(`Account is ${admin.status}.`, 'ACCOUNT_INACTIVE');
  }

  const validPassword = await verifyPassword(admin.passwordHash, input.password);
  if (!validPassword) {
    await recordAuthLog({
      platformAdminId: admin.id,
      actorType: 'PLATFORM_ADMIN',
      identifierUsed: normalized,
      eventType: 'LOGIN_FAILED',
      success: false,
      failureReason: 'INVALID_PASSWORD',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    throw new UnauthorizedError('Invalid email/username or password.');
  }

  const now = new Date();
  const rawRefreshToken = generateOpaqueToken(48);
  const refreshTokenHash = hashToken(rawRefreshToken);

  const session = await prisma.$transaction(async (tx) => {
    const createdSession = await tx.platformSession.create({
      data: {
        platformAdminId: admin.id,
        refreshTokenHash,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        expiresAt: addDays(now, env.REFRESH_TOKEN_TTL_DAYS),
      },
    });

    await tx.platformAdministrator.update({
      where: { id: admin.id },
      data: { lastLoginAt: now },
    });

    return createdSession;
  });

  await recordAuthLog({
    platformAdminId: admin.id,
    actorType: 'PLATFORM_ADMIN',
    identifierUsed: normalized,
    eventType: 'LOGIN_SUCCESS',
    success: true,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  const accessToken = signAccessToken({
    sub: admin.id,
    actorType: 'PLATFORM_ADMIN',
    sid: session.id,
  });

  const adminSummary: AuthenticatedPlatformAdmin = {
    actorType: 'PLATFORM_ADMIN',
    id: admin.id,
    sessionId: session.id,
    email: admin.email,
    username: admin.username,
    firstName: admin.firstName,
    lastName: admin.lastName,
    status: admin.status,
  };

  return {
    tokens: {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: env.ACCESS_TOKEN_TTL,
    },
    admin: adminSummary,
  };
}

export async function refreshPlatformSession(
  rawRefreshToken: string,
  meta: AuthRequestMeta
): Promise<PlatformLoginResponseDto> {
  const prisma = getPrisma();
  const env = getEnv();
  const tokenHash = hashToken(rawRefreshToken);
  const now = new Date();

  const session = await prisma.platformSession.findUnique({
    where: { refreshTokenHash: tokenHash },
    include: { platformAdmin: true },
  });

  if (!session || session.revokedAt !== null || session.expiresAt <= now) {
    throw new UnauthorizedError('Platform refresh token is invalid or expired.');
  }

  if (session.platformAdmin.status !== 'ACTIVE') {
    throw new ForbiddenError(
      `Account is ${session.platformAdmin.status}.`,
      'ACCOUNT_INACTIVE'
    );
  }

  const nextRefreshToken = generateOpaqueToken(48);
  const nextRefreshHash = hashToken(nextRefreshToken);

  await prisma.platformSession.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: nextRefreshHash,
      lastRefreshedAt: now,
      expiresAt: addDays(now, env.REFRESH_TOKEN_TTL_DAYS),
      ipAddress: meta.ipAddress ?? session.ipAddress,
      userAgent: meta.userAgent ?? session.userAgent,
    },
  });

  const accessToken = signAccessToken({
    sub: session.platformAdmin.id,
    actorType: 'PLATFORM_ADMIN',
    sid: session.id,
  });

  await recordAuthLog({
    platformAdminId: session.platformAdmin.id,
    actorType: 'PLATFORM_ADMIN',
    identifierUsed: session.platformAdmin.email,
    eventType: 'TOKEN_REFRESH',
    success: true,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return {
    tokens: {
      accessToken,
      refreshToken: nextRefreshToken,
      expiresIn: env.ACCESS_TOKEN_TTL,
    },
    admin: {
      actorType: 'PLATFORM_ADMIN',
      id: session.platformAdmin.id,
      sessionId: session.id,
      email: session.platformAdmin.email,
      username: session.platformAdmin.username,
      firstName: session.platformAdmin.firstName,
      lastName: session.platformAdmin.lastName,
      status: session.platformAdmin.status,
    },
  };
}

export async function logoutPlatformSession(
  admin: AuthenticatedPlatformAdmin,
  meta: AuthRequestMeta
): Promise<void> {
  const prisma = getPrisma();
  await prisma.platformSession.updateMany({
    where: {
      id: admin.sessionId,
      platformAdminId: admin.id,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
      revokedReason: 'USER_LOGOUT',
    },
  });

  await recordAuthLog({
    platformAdminId: admin.id,
    actorType: 'PLATFORM_ADMIN',
    identifierUsed: admin.email,
    eventType: 'LOGOUT',
    success: true,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
}

export async function loginTenantUser(
  input: TenantLoginInput,
  meta: AuthRequestMeta
): Promise<TenantLoginResponseDto> {
  const prisma = getPrisma();
  const env = getEnv();
  const normalizedIdentifier = input.identifier.trim();
  let resolvedTenantId: string | undefined;

  if (input.tenantCode) {
    const tenant = await prisma.tenant.findUnique({
      where: { tenantCode: input.tenantCode.trim().toUpperCase() },
      select: { id: true, status: true },
    });

    if (!tenant) {
      await recordAuthLog({
        actorType: 'TENANT_USER',
        identifierUsed: normalizedIdentifier,
        eventType: 'LOGIN_FAILED',
        success: false,
        failureReason: 'TENANT_NOT_FOUND',
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedError('Invalid organization code or credentials.');
    }

    resolvedTenantId = tenant.id;
  }

  const matchingUsers = await prisma.user.findMany({
    where: {
      ...(resolvedTenantId ? { tenantId: resolvedTenantId } : {}),
      OR: [{ email: normalizedIdentifier }, { username: normalizedIdentifier }],
    },
    include: {
      tenant: {
        include: { settings: true },
      },
    },
    take: 2,
  });

  if (matchingUsers.length > 1) {
    throw new ValidationError(
      'Organization code is required because this email or username belongs to multiple organizations.'
    );
  }

  const user = matchingUsers[0];
  if (!user) {
    await recordAuthLog({
      tenantId: resolvedTenantId ?? null,
      actorType: 'TENANT_USER',
      identifierUsed: normalizedIdentifier,
      eventType: 'LOGIN_FAILED',
      success: false,
      failureReason: 'USER_NOT_FOUND',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    throw new UnauthorizedError('Invalid credentials.');
  }

  if (user.tenant.status !== 'ACTIVE') {
    await recordAuthLog({
      tenantId: user.tenantId,
      userId: user.id,
      actorType: 'TENANT_USER',
      identifierUsed: normalizedIdentifier,
      eventType: 'LOGIN_FAILED',
      success: false,
      failureReason: `TENANT_${user.tenant.status}`,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    throw new TenantStatusForbiddenError(user.tenant.status);
  }

  if (user.status !== 'ACTIVE') {
    await recordAuthLog({
      tenantId: user.tenantId,
      userId: user.id,
      actorType: 'TENANT_USER',
      identifierUsed: normalizedIdentifier,
      eventType: 'LOGIN_FAILED',
      success: false,
      failureReason: `USER_${user.status}`,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    throw new ForbiddenError(`User account is ${user.status}.`, 'USER_INACTIVE');
  }

  const validPassword = await verifyPassword(user.passwordHash, input.password);
  if (!validPassword) {
    await recordAuthLog({
      tenantId: user.tenantId,
      userId: user.id,
      actorType: 'TENANT_USER',
      identifierUsed: normalizedIdentifier,
      eventType: 'LOGIN_FAILED',
      success: false,
      failureReason: 'INVALID_PASSWORD',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    throw new UnauthorizedError('Invalid credentials.');
  }

  const now = new Date();
  const rawRefreshToken = generateOpaqueToken(48);
  const refreshTokenHash = hashToken(rawRefreshToken);
  const offlineHours = user.tenant.settings?.offlineMaxSessionHours ?? 24;

  const { session, deviceId } = await prisma.$transaction(async (tx) => {
    let registeredDeviceId: string | null = null;

    if (input.deviceFingerprint) {
      const existingDevice = await tx.registeredDevice.findUnique({
        where: {
          tenantId_deviceFingerprint: {
            tenantId: user.tenantId,
            deviceFingerprint: input.deviceFingerprint,
          },
        },
      });

      if (existingDevice) {
        if (existingDevice.status === 'REVOKED') {
          throw new ForbiddenError(
            'This device has been revoked from accessing the organization.',
            'DEVICE_REVOKED'
          );
        }
        const updatedDevice = await tx.registeredDevice.update({
          where: { id: existingDevice.id },
          data: {
            lastSeenAt: now,
            deviceName: input.deviceName ?? existingDevice.deviceName,
          },
        });
        registeredDeviceId = updatedDevice.id;
      } else {
        const autoApprove = !(user.tenant.settings?.requireDeviceApproval ?? true);
        const createdDevice = await tx.registeredDevice.create({
          data: {
            tenantId: user.tenantId,
            userId: user.id,
            deviceFingerprint: input.deviceFingerprint,
            deviceName: input.deviceName ?? 'Web Browser',
            platform: input.platform ?? null,
            browser: input.browser ?? null,
            status: autoApprove ? 'ACTIVE' : 'PENDING',
            lastSeenAt: now,
            approvedAt: autoApprove ? now : null,
          },
        });
        registeredDeviceId = createdDevice.id;
      }
    }

    const createdSession = await tx.userSession.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        deviceId: registeredDeviceId,
        refreshTokenHash,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        isOfflineEnabled: Boolean(registeredDeviceId),
        expiresAt: addDays(now, env.REFRESH_TOKEN_TTL_DAYS),
        offlineExpiresAt: addHours(now, offlineHours),
      },
    });

    await tx.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: now,
        lastActivityAt: now,
      },
    });

    return { session: createdSession, deviceId: registeredDeviceId };
  });

  await recordAuthLog({
    tenantId: user.tenantId,
    userId: user.id,
    actorType: 'TENANT_USER',
    identifierUsed: normalizedIdentifier,
    eventType: 'LOGIN_SUCCESS',
    success: true,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    deviceId,
  });

  const accessToken = signAccessToken({
    sub: user.id,
    actorType: 'TENANT_USER',
    tenantId: user.tenantId,
    sid: session.id,
  });

  const authenticatedUser = await buildAuthenticatedTenantUser(
    user.id,
    session.id,
    deviceId
  );

  return {
    tokens: {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: env.ACCESS_TOKEN_TTL,
    },
    user: authenticatedUser,
  };
}

export async function refreshTenantSession(
  rawRefreshToken: string,
  meta: AuthRequestMeta
): Promise<TenantLoginResponseDto> {
  const prisma = getPrisma();
  const env = getEnv();
  const tokenHash = hashToken(rawRefreshToken);
  const now = new Date();

  const session = await prisma.userSession.findUnique({
    where: { refreshTokenHash: tokenHash },
    include: {
      device: true,
      user: {
        include: {
          tenant: {
            include: { settings: true },
          },
        },
      },
    },
  });

  if (!session || session.revokedAt !== null || session.expiresAt <= now) {
    throw new UnauthorizedError('Refresh token is invalid or expired.');
  }

  if (session.device && session.device.status === 'REVOKED') {
    throw new ForbiddenError('This device has been revoked.', 'DEVICE_REVOKED');
  }

  if (session.user.tenant.status !== 'ACTIVE') {
    throw new TenantStatusForbiddenError(session.user.tenant.status);
  }

  if (session.user.status !== 'ACTIVE') {
    throw new ForbiddenError(`User account is ${session.user.status}.`, 'USER_INACTIVE');
  }

  const nextRefreshToken = generateOpaqueToken(48);
  const nextRefreshHash = hashToken(nextRefreshToken);
  const offlineHours = session.user.tenant.settings?.offlineMaxSessionHours ?? 24;

  await prisma.userSession.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: nextRefreshHash,
      lastRefreshedAt: now,
      expiresAt: addDays(now, env.REFRESH_TOKEN_TTL_DAYS),
      offlineExpiresAt: addHours(now, offlineHours),
      ipAddress: meta.ipAddress ?? session.ipAddress,
      userAgent: meta.userAgent ?? session.userAgent,
    },
  });

  await recordAuthLog({
    tenantId: session.tenantId,
    userId: session.userId,
    actorType: 'TENANT_USER',
    identifierUsed: session.user.email,
    eventType: 'TOKEN_REFRESH',
    success: true,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    deviceId: session.deviceId,
  });

  const accessToken = signAccessToken({
    sub: session.userId,
    actorType: 'TENANT_USER',
    tenantId: session.tenantId,
    sid: session.id,
  });

  const authenticatedUser = await buildAuthenticatedTenantUser(
    session.userId,
    session.id,
    session.deviceId
  );

  return {
    tokens: {
      accessToken,
      refreshToken: nextRefreshToken,
      expiresIn: env.ACCESS_TOKEN_TTL,
    },
    user: authenticatedUser,
  };
}

export async function logoutTenantSession(
  user: AuthenticatedTenantUser,
  meta: AuthRequestMeta
): Promise<void> {
  const prisma = getPrisma();
  await prisma.userSession.updateMany({
    where: {
      id: user.sessionId,
      tenantId: user.tenantId,
      userId: user.id,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
      revokedReason: 'USER_LOGOUT',
    },
  });

  await recordAuthLog({
    tenantId: user.tenantId,
    userId: user.id,
    actorType: 'TENANT_USER',
    identifierUsed: user.email,
    eventType: 'LOGOUT',
    success: true,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    deviceId: user.deviceId,
  });
}

export async function logoutAllTenantSessions(
  user: AuthenticatedTenantUser,
  meta: AuthRequestMeta
): Promise<{ revokedCount: number }> {
  const prisma = getPrisma();
  const result = await prisma.userSession.updateMany({
    where: {
      tenantId: user.tenantId,
      userId: user.id,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
      revokedReason: 'USER_LOGOUT_ALL',
    },
  });

  await recordAuthLog({
    tenantId: user.tenantId,
    userId: user.id,
    actorType: 'TENANT_USER',
    identifierUsed: user.email,
    eventType: 'SESSION_REVOKED',
    success: true,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    deviceId: user.deviceId,
  });

  return { revokedCount: result.count };
}

export async function changeTenantUserPassword(
  actor: AuthenticatedTenantUser,
  input: ChangePasswordInput,
  meta: AuthRequestMeta
): Promise<void> {
  const prisma = getPrisma();
  const user = await prisma.user.findFirst({
    where: { id: actor.id, tenantId: actor.tenantId },
  });

  if (!user) {
    throw new UnauthorizedError('Account not found.');
  }

  const matches = await verifyPassword(user.passwordHash, input.currentPassword);
  if (!matches) {
    throw new UnauthorizedError('Current password is incorrect.');
  }

  if (input.currentPassword === input.newPassword) {
    throw new ConflictError('New password must be different from the current password.');
  }

  const nextHash = await hashPassword(input.newPassword);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash: nextHash,
        passwordUpdatedAt: now,
        updatedBy: actor.id,
      },
    });

    // Revoke all other sessions when password changes
    await tx.userSession.updateMany({
      where: {
        tenantId: actor.tenantId,
        userId: actor.id,
        id: { not: actor.sessionId },
        revokedAt: null,
      },
      data: {
        revokedAt: now,
        revokedReason: 'PASSWORD_CHANGED',
      },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'USER_PASSWORD_CHANGED',
        entityType: 'User',
        entityId: actor.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );
  });
}

export async function requestPasswordReset(
  input: ForgotPasswordInput,
  meta: AuthRequestMeta
): Promise<{ devResetToken?: string }> {
  const prisma = getPrisma();
  const env = getEnv();
  const now = new Date();

  if (input.actorType === 'PLATFORM_ADMIN') {
    const admin = await prisma.platformAdministrator.findUnique({
      where: { email: input.email.trim() },
    });

    if (!admin || admin.status !== 'ACTIVE') {
      return {};
    }

    const rawToken = generateOpaqueToken(32);
    const tokenHash = hashToken(rawToken);

    await prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: {
          actorType: 'PLATFORM_ADMIN',
          platformAdminId: admin.id,
          usedAt: null,
        },
        data: { usedAt: now },
      });

      await tx.passwordResetToken.create({
        data: {
          actorType: 'PLATFORM_ADMIN',
          platformAdminId: admin.id,
          tokenHash,
          expiresAt: addMinutes(now, 15),
          ipAddress: meta.ipAddress,
        },
      });
    });

    await recordAuthLog({
      platformAdminId: admin.id,
      actorType: 'PLATFORM_ADMIN',
      identifierUsed: admin.email,
      eventType: 'PASSWORD_RESET_REQUESTED',
      success: true,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return env.NODE_ENV === 'test' ? { devResetToken: rawToken } : {};
  }

  let tenantId: string | undefined;
  if (input.tenantCode) {
    const tenant = await prisma.tenant.findUnique({
      where: { tenantCode: input.tenantCode.trim().toUpperCase() },
      select: { id: true },
    });
    if (!tenant) {
      return {};
    }
    tenantId = tenant.id;
  }

  const users = await prisma.user.findMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      email: input.email.trim(),
      status: 'ACTIVE',
    },
    take: 2,
  });

  if (users.length !== 1) {
    return {};
  }

  const user = users[0]!;
  const rawToken = generateOpaqueToken(32);
  const tokenHash = hashToken(rawToken);

  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: {
        actorType: 'TENANT_USER',
        userId: user.id,
        usedAt: null,
      },
      data: { usedAt: now },
    });

    await tx.passwordResetToken.create({
      data: {
        actorType: 'TENANT_USER',
        tenantId: user.tenantId,
        userId: user.id,
        tokenHash,
        expiresAt: addMinutes(now, 15),
        ipAddress: meta.ipAddress,
      },
    });
  });

  await recordAuthLog({
    tenantId: user.tenantId,
    userId: user.id,
    actorType: 'TENANT_USER',
    identifierUsed: user.email,
    eventType: 'PASSWORD_RESET_REQUESTED',
    success: true,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return env.NODE_ENV === 'test' ? { devResetToken: rawToken } : {};
}

export async function resetPasswordWithToken(
  input: ResetPasswordInput,
  meta: AuthRequestMeta
): Promise<void> {
  const prisma = getPrisma();
  const tokenHash = hashToken(input.token);
  const now = new Date();

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });

  if (!record || record.usedAt !== null || record.expiresAt <= now) {
    throw new UnauthorizedError('Password reset token is invalid or expired.');
  }

  const nextHash = await hashPassword(input.newPassword);

  await prisma.$transaction(async (tx) => {
    // Atomically mark unused token as used to prevent replay
    const marked = await tx.passwordResetToken.updateMany({
      where: {
        id: record.id,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });

    if (marked.count === 0) {
      throw new UnauthorizedError('Password reset token has already been used.');
    }

    if (record.actorType === 'PLATFORM_ADMIN' && record.platformAdminId) {
      await tx.platformAdministrator.update({
        where: { id: record.platformAdminId },
        data: {
          passwordHash: nextHash,
          passwordUpdatedAt: now,
        },
      });

      await tx.platformSession.updateMany({
        where: { platformAdminId: record.platformAdminId, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'PASSWORD_RESET' },
      });
    } else if (record.actorType === 'TENANT_USER' && record.userId && record.tenantId) {
      await tx.user.update({
        where: { id: record.userId },
        data: {
          passwordHash: nextHash,
          passwordUpdatedAt: now,
        },
      });

      await tx.userSession.updateMany({
        where: {
          tenantId: record.tenantId,
          userId: record.userId,
          revokedAt: null,
        },
        data: { revokedAt: now, revokedReason: 'PASSWORD_RESET' },
      });
    } else {
      throw new UnauthorizedError('Invalid password reset token state.');
    }
  });

  await recordAuthLog({
    tenantId: record.tenantId,
    userId: record.userId,
    platformAdminId: record.platformAdminId,
    actorType: record.actorType === 'PLATFORM_ADMIN' ? 'PLATFORM_ADMIN' : 'TENANT_USER',
    identifierUsed: record.userId ?? record.platformAdminId ?? 'unknown',
    eventType: 'PASSWORD_RESET_COMPLETED',
    success: true,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
}
