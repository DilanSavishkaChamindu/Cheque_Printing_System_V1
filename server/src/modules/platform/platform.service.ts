import type { PlatformDashboardSummaryDto } from '@cheque-saas/shared';
import { checkDatabaseHealth, getPrisma } from '../../config/prisma.js';

export async function getPlatformDashboardSummary(): Promise<PlatformDashboardSummaryDto> {
  const prisma = getPrisma();

  const [
    statusCounts,
    totalUsers,
    totalIssuedCheques,
    totalReceivedCheques,
    recentTenants,
    tenantUsageRows,
    recentLogs,
    dbHealth,
  ] = await Promise.all([
    prisma.tenant.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.user.count(),
    prisma.issuedCheque.count(),
    prisma.receivedCheque.count(),
    prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        _count: {
          select: {
            users: true,
            companies: true,
            issuedCheques: true,
            receivedCheques: true,
          },
        },
        tenantFeatures: {
          where: { isEnabled: true },
          select: { id: true },
        },
      },
    }),
    prisma.platformAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        platformAdmin: { select: { email: true } },
        tenant: { select: { organizationName: true } },
      },
    }),
    checkDatabaseHealth(),
  ]);

  const countMap = new Map(statusCounts.map((row) => [row.status, row._count._all]));
  const activeTenants = countMap.get('ACTIVE') ?? 0;
  const pendingTenants = countMap.get('PENDING') ?? 0;
  const suspendedTenants = countMap.get('SUSPENDED') ?? 0;
  const inactiveTenants = countMap.get('INACTIVE') ?? 0;
  const expiredTenants = countMap.get('EXPIRED') ?? 0;
  const totalTenants =
    activeTenants + pendingTenants + suspendedTenants + inactiveTenants + expiredTenants;

  return {
    totals: {
      totalTenants,
      activeTenants,
      pendingTenants,
      suspendedTenants,
      inactiveTenants,
      expiredTenants,
      totalUsers,
      totalIssuedCheques,
      totalReceivedCheques,
    },
    recentTenants: recentTenants.map((t) => ({
      id: t.id,
      tenantCode: t.tenantCode,
      organizationName: t.organizationName,
      registeredBusinessName: t.registeredBusinessName,
      contactPerson: t.contactPerson,
      email: t.email,
      contactNumber: t.contactNumber,
      country: t.country,
      status: t.status,
      defaultCompanyId: t.defaultCompanyId,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })),
    tenantUsage: tenantUsageRows.map((t) => ({
      tenantId: t.id,
      tenantCode: t.tenantCode,
      organizationName: t.organizationName,
      status: t.status,
      usersCount: t._count.users,
      companiesCount: t._count.companies,
      issuedChequesCount: t._count.issuedCheques,
      receivedChequesCount: t._count.receivedCheques,
      enabledFeaturesCount: t.tenantFeatures.length,
    })),
    recentActivities: recentLogs.map((log) => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      tenantId: log.tenantId,
      tenantName: log.tenant?.organizationName ?? null,
      actorEmail: log.platformAdmin?.email ?? null,
      createdAt: log.createdAt.toISOString(),
    })),
    systemHealth: {
      databaseConnected: dbHealth.connected,
      uptimeSeconds: Math.floor(process.uptime()),
    },
  };
}
