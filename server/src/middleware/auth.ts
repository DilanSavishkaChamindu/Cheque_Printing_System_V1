import type { NextFunction, Request, Response } from 'express';
import type {
  AuthenticatedPlatformAdmin,
  AuthenticatedTenantUser,
  FeatureKey,
  PermissionCode,
} from '@cheque-saas/shared';
import { getPrisma } from '../config/prisma.js';
import {
  computeEffectiveFeatures,
  computeEffectivePermissions,
} from '../core/authorization.js';
import {
  FeatureDisabledError,
  ForbiddenError,
  TenantStatusForbiddenError,
  UnauthorizedError,
} from '../core/errors.js';
import { recordSecurityEvent } from '../modules/audit-logs/audit.service.js';
import { verifyAccessToken } from '../utils/crypto.js';
import { getClientIp } from '../utils/sanitize.js';

declare module 'express-serve-static-core' {
  interface Request {
    platformAdmin?: AuthenticatedPlatformAdmin;
    tenantUser?: AuthenticatedTenantUser;
  }
}

function extractBearerToken(req: Request): string {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid Authorization header.');
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    throw new UnauthorizedError('Access token is missing.');
  }
  return token;
}

export async function authenticatePlatformAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawToken = extractBearerToken(req);
    const payload = verifyAccessToken(rawToken);

    if (payload.actorType !== 'PLATFORM_ADMIN') {
      throw new ForbiddenError(
        'Platform Administrator credentials are required.',
        'PLATFORM_ACCESS_REQUIRED'
      );
    }

    const prisma = getPrisma();
    const session = await prisma.platformSession.findUnique({
      where: { id: payload.sid },
      include: {
        platformAdmin: true,
      },
    });

    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt <= new Date() ||
      session.platformAdminId !== payload.sub
    ) {
      throw new UnauthorizedError('Platform session is expired or revoked.');
    }

    if (session.platformAdmin.status !== 'ACTIVE') {
      throw new ForbiddenError(
        `Platform administrator account is ${session.platformAdmin.status}.`,
        'ACCOUNT_INACTIVE'
      );
    }

    req.platformAdmin = {
      actorType: 'PLATFORM_ADMIN',
      id: session.platformAdmin.id,
      sessionId: session.id,
      email: session.platformAdmin.email,
      username: session.platformAdmin.username,
      firstName: session.platformAdmin.firstName,
      lastName: session.platformAdmin.lastName,
      status: session.platformAdmin.status,
    };

    next();
  } catch (error) {
    next(error);
  }
}

export async function authenticateTenantUser(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawToken = extractBearerToken(req);
    const payload = verifyAccessToken(rawToken);

    if (payload.actorType !== 'TENANT_USER') {
      throw new ForbiddenError(
        'Organization user credentials are required.',
        'TENANT_USER_REQUIRED'
      );
    }

    const prisma = getPrisma();
    const now = new Date();

    const session = await prisma.userSession.findUnique({
      where: { id: payload.sid },
      include: {
        device: true,
        user: {
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
                      include: {
                        permission: true,
                      },
                    },
                  },
                },
              },
            },
            permissionOverrides: {
              include: {
                permission: true,
              },
            },
            userCompanies: {
              select: {
                companyId: true,
              },
            },
          },
        },
      },
    });

    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt <= now ||
      session.userId !== payload.sub ||
      session.tenantId !== payload.tenantId
    ) {
      throw new UnauthorizedError('Session is expired or has been revoked.');
    }

    if (session.device && session.device.status === 'REVOKED') {
      throw new UnauthorizedError('This device has been revoked by an administrator.');
    }

    const { user } = session;
    const { tenant } = user;

    if (tenant.status !== 'ACTIVE') {
      throw new TenantStatusForbiddenError(tenant.status);
    }

    if (user.status !== 'ACTIVE') {
      throw new ForbiddenError(
        `User account is ${user.status}.`,
        'USER_INACTIVE'
      );
    }

    const featureCatalog = await prisma.feature.findMany({
      select: {
        id: true,
        key: true,
        isGlobalActive: true,
        isDefaultEnabled: true,
      },
    });

    const enabledFeatures = computeEffectiveFeatures(
      featureCatalog,
      tenant.tenantFeatures,
      now
    );

    const activeRoles = user.userRoles
      .map((ur) => ur.role)
      .filter((role) => role.status === 'ACTIVE');

    const hasClientAdminRole =
      user.isClientAdmin || activeRoles.some((role) => role.isClientAdmin);

    const rolePermissions = activeRoles.flatMap((role) =>
      role.rolePermissions.map((rp) => rp.permission.code as PermissionCode)
    );

    const effectivePermissions = computeEffectivePermissions({
      rolePermissions,
      overrides: user.permissionOverrides.map((ov) => ({
        code: ov.permission.code as PermissionCode,
        effect: ov.effect,
      })),
    });

    const assignedCompanyIds = new Set(user.userCompanies.map((uc) => uc.companyId));
    const authorizedCompanies =
      user.companyAccessScope === 'ALL_COMPANIES'
        ? tenant.companies
        : tenant.companies.filter((company) => assignedCompanyIds.has(company.id));

    req.tenantUser = {
      actorType: 'TENANT_USER',
      id: user.id,
      tenantId: tenant.id,
      sessionId: session.id,
      deviceId: session.deviceId,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      isClientAdmin: hasClientAdminRole,
      companyAccessScope: user.companyAccessScope,
      allowedCompanyIds: authorizedCompanies.map((c) => c.id),
      companies: authorizedCompanies,
      permissions: effectivePermissions,
      roles: activeRoles.map((r) => r.code),
      tenant: {
        id: tenant.id,
        tenantCode: tenant.tenantCode,
        organizationName: tenant.organizationName,
        status: tenant.status,
        defaultCompanyId: tenant.defaultCompanyId,
        enabledFeatures,
        defaultCurrency: tenant.settings?.defaultCurrency ?? 'LKR',
        dateFormat: tenant.settings?.dateFormat ?? 'DD/MM/YYYY',
        timezone: tenant.settings?.timezone ?? 'Asia/Colombo',
      },
    };

    // Update lastActivityAt asynchronously without failing the request
    void prisma.user
      .update({
        where: { id: user.id },
        data: { lastActivityAt: now },
      })
      .catch(() => undefined);

    next();
  } catch (error) {
    next(error);
  }
}

export function requireFeature(featureKey: FeatureKey) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const tenantUser = req.tenantUser;
    if (!tenantUser) {
      next(new UnauthorizedError());
      return;
    }

    if (!tenantUser.tenant.enabledFeatures.includes(featureKey)) {
      await recordSecurityEvent({
        tenantId: tenantUser.tenantId,
        userId: tenantUser.id,
        actorType: 'TENANT_USER',
        eventType: 'DISABLED_FEATURE_ACCESS_ATTEMPT',
        severity: 'LOW',
        description: `User attempted to access disabled feature '${featureKey}'.`,
        metadata: { featureKey },
        ipAddress: getClientIp(req),
        requestPath: req.originalUrl,
      });
      next(new FeatureDisabledError(featureKey));
      return;
    }

    next();
  };
}

export function requireAnyFeature(...featureKeys: FeatureKey[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const tenantUser = req.tenantUser;
    if (!tenantUser) {
      next(new UnauthorizedError());
      return;
    }

    const enabled = featureKeys.some((key) =>
      tenantUser.tenant.enabledFeatures.includes(key)
    );

    if (!enabled) {
      await recordSecurityEvent({
        tenantId: tenantUser.tenantId,
        userId: tenantUser.id,
        actorType: 'TENANT_USER',
        eventType: 'DISABLED_FEATURE_ACCESS_ATTEMPT',
        severity: 'LOW',
        description: `User attempted to access endpoint requiring one of: ${featureKeys.join(', ')}.`,
        metadata: { featureKeys },
        ipAddress: getClientIp(req),
        requestPath: req.originalUrl,
      });
      next(new FeatureDisabledError(featureKeys[0] ?? 'unknown'));
      return;
    }

    next();
  };
}

export function requirePermission(...requiredPermissions: PermissionCode[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const tenantUser = req.tenantUser;
    if (!tenantUser) {
      next(new UnauthorizedError());
      return;
    }

    if (tenantUser.isClientAdmin) {
      next();
      return;
    }

    const permissionSet = new Set(tenantUser.permissions);
    const missing = requiredPermissions.filter((perm) => !permissionSet.has(perm));

    if (missing.length > 0) {
      await recordSecurityEvent({
        tenantId: tenantUser.tenantId,
        userId: tenantUser.id,
        actorType: 'TENANT_USER',
        eventType: 'UNAUTHORIZED_PERMISSION_ATTEMPT',
        severity: 'MEDIUM',
        description: `Missing required permissions: ${missing.join(', ')}`,
        metadata: { requiredPermissions, missing },
        ipAddress: getClientIp(req),
        requestPath: req.originalUrl,
      });
      next(new ForbiddenError('You do not have the required permissions for this action.'));
      return;
    }

    next();
  };
}

export function requireClientAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const tenantUser = req.tenantUser;
  if (!tenantUser) {
    next(new UnauthorizedError());
    return;
  }
  if (!tenantUser.isClientAdmin) {
    next(new ForbiddenError('Client Administrator privileges are required.'));
    return;
  }
  next();
}
