import type { Prisma } from '@prisma/client';
import type { AuditLogQueryInput } from '@cheque-saas/shared';
import { getPrisma } from '../../config/prisma.js';
import { getLogger } from '../../config/logger.js';
import { sanitizeAuditValue } from '../../utils/sanitize.js';

export interface TenantAuditEntryInput {
  tenantId: string;
  companyId?: string | null;
  userId?: string | null;
  platformAdminId?: string | null;
  deviceId?: string | null;
  actorType: 'PLATFORM_ADMIN' | 'TENANT_USER' | 'SYSTEM';
  action: string;
  entityType: string;
  entityId?: string | null;
  previousValues?: unknown;
  newValues?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export interface PlatformAuditEntryInput {
  platformAdminId?: string | null;
  tenantId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  previousValues?: unknown;
  newValues?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuthLogEntryInput {
  tenantId?: string | null;
  userId?: string | null;
  platformAdminId?: string | null;
  actorType: 'PLATFORM_ADMIN' | 'TENANT_USER';
  identifierUsed: string;
  eventType:
    | 'LOGIN_SUCCESS'
    | 'LOGIN_FAILED'
    | 'LOGOUT'
    | 'TOKEN_REFRESH'
    | 'PASSWORD_RESET_REQUESTED'
    | 'PASSWORD_RESET_COMPLETED'
    | 'SESSION_REVOKED';
  success: boolean;
  failureReason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceId?: string | null;
}

export interface SecurityEventInput {
  tenantId?: string | null;
  userId?: string | null;
  actorType?: 'PLATFORM_ADMIN' | 'TENANT_USER' | 'SYSTEM' | null;
  eventType: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  metadata?: unknown;
  ipAddress?: string | null;
  requestPath?: string | null;
}

function toJsonInput(val: unknown): Prisma.InputJsonValue | undefined {
  if (val === undefined || val === null) {
    return undefined;
  }
  return sanitizeAuditValue(val) as Prisma.InputJsonValue;
}

export async function recordTenantAudit(
  input: TenantAuditEntryInput,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const db = tx ?? getPrisma();
  await db.auditLog.create({
    data: {
      tenantId: input.tenantId,
      companyId: input.companyId ?? null,
      userId: input.userId ?? null,
      platformAdminId: input.platformAdminId ?? null,
      deviceId: input.deviceId ?? null,
      actorType: input.actorType,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      previousValues: toJsonInput(input.previousValues),
      newValues: toJsonInput(input.newValues),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      requestId: input.requestId ?? null,
    },
  });
}

export async function recordPlatformAudit(
  input: PlatformAuditEntryInput,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const db = tx ?? getPrisma();
  await db.platformAuditLog.create({
    data: {
      platformAdminId: input.platformAdminId ?? null,
      tenantId: input.tenantId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      previousValues: toJsonInput(input.previousValues),
      newValues: toJsonInput(input.newValues),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}

export async function recordAuthLog(input: AuthLogEntryInput): Promise<void> {
  try {
    const prisma = getPrisma();
    await prisma.authenticationLog.create({
      data: {
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
        platformAdminId: input.platformAdminId ?? null,
        actorType: input.actorType,
        identifierUsed: input.identifierUsed.slice(0, 191),
        eventType: input.eventType,
        success: input.success,
        failureReason: input.failureReason?.slice(0, 255) ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        deviceId: input.deviceId ?? null,
      },
    });
  } catch (error) {
    getLogger().error({ err: error }, 'Failed to persist authentication log');
  }
}

export async function recordSecurityEvent(input: SecurityEventInput): Promise<void> {
  try {
    const prisma = getPrisma();
    await prisma.securityEvent.create({
      data: {
        tenantId: input.tenantId ?? null,
        userId: input.userId ?? null,
        actorType: input.actorType ?? null,
        eventType: input.eventType,
        severity: input.severity ?? 'MEDIUM',
        description: input.description,
        metadataJson: toJsonInput(input.metadata),
        ipAddress: input.ipAddress ?? null,
        requestPath: input.requestPath?.slice(0, 255) ?? null,
      },
    });
  } catch (error) {
    getLogger().error({ err: error }, 'Failed to persist security event');
  }
}

export async function listTenantAuditLogs(
  tenantId: string,
  query: AuditLogQueryInput
) {
  const prisma = getPrisma();
  const where: Prisma.AuditLogWhereInput = {
    tenantId,
    ...(query.action ? { action: query.action } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.entityId ? { entityId: query.entityId } : {}),
    ...(query.userId ? { userId: query.userId } : {}),
    ...(query.fromDate || query.toDate
      ? {
          createdAt: {
            ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
            ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
          },
        }
      : {}),
  };

  const skip = (query.page - 1) * query.limit;

  const [items, totalItems] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.limit,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items,
    totalItems,
    page: query.page,
    limit: query.limit,
  };
}

export async function listPlatformAuditLogs(query: AuditLogQueryInput) {
  const prisma = getPrisma();
  const where: Prisma.PlatformAuditLogWhereInput = {
    ...(query.tenantId ? { tenantId: query.tenantId } : {}),
    ...(query.action ? { action: query.action } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.entityId ? { entityId: query.entityId } : {}),
    ...(query.fromDate || query.toDate
      ? {
          createdAt: {
            ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
            ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
          },
        }
      : {}),
  };

  const skip = (query.page - 1) * query.limit;

  const [items, totalItems] = await Promise.all([
    prisma.platformAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.limit,
      include: {
        platformAdmin: {
          select: {
            id: true,
            email: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
        tenant: {
          select: {
            id: true,
            tenantCode: true,
            organizationName: true,
          },
        },
      },
    }),
    prisma.platformAuditLog.count({ where }),
  ]);

  return {
    items,
    totalItems,
    page: query.page,
    limit: query.limit,
  };
}
