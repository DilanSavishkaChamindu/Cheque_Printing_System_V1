import { Prisma } from '@prisma/client';
import {
  FEATURE_KEYS,
  type AuthenticatedTenantUser,
} from '@cheque-saas/shared';
import { getPrisma } from '../../config/prisma.js';
import { resolveAuthorizedCompanyId } from '../../core/authorization.js';
import { maskAccountNumber } from '../../utils/masking.js';

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export async function getTenantDashboardData(
  actor: AuthenticatedTenantUser,
  requestedCompanyId?: string
) {
  const prisma = getPrisma();
  const companiesEnabled = actor.tenant.enabledFeatures.includes(FEATURE_KEYS.COMPANIES);

  let companyWhere: { companyId?: string | { in: string[] } } = {};
  if (requestedCompanyId) {
    companyWhere = { companyId: resolveAuthorizedCompanyId(actor, requestedCompanyId) };
  } else if (!companiesEnabled) {
    companyWhere = { companyId: resolveAuthorizedCompanyId(actor, null) };
  } else if (actor.companyAccessScope === 'SELECTED_COMPANIES') {
    companyWhere = { companyId: { in: actor.allowedCompanyIds } };
  }

  const today = startOfUtcDay(new Date());
  const tomorrow = addUtcDays(today, 1);
  const dayAfterTomorrow = addUtcDays(today, 2);
  const sevenDaysAheadEnd = addUtcDays(today, 8);

  const [
    bankAccounts,
    issuedGroups,
    printedCount,
    todayCheques,
    tomorrowCheques,
    nextSevenDaysCheques,
    receivedTodayCount,
    pendingBankingCount,
    bankedTodayCount,
  ] = await Promise.all([
    prisma.bankAccount.findMany({
      where: {
        tenantId: actor.tenantId,
        ...companyWhere,
      },
      orderBy: [{ status: 'asc' }, { accountName: 'asc' }],
      include: {
        bank: { select: { bankCode: true, bankName: true } },
        branch: { select: { branchName: true } },
        company: { select: { companyCode: true, companyName: true } },
      },
    }),
    prisma.issuedCheque.groupBy({
      by: ['businessStatus', 'bankingStatus'],
      where: {
        tenantId: actor.tenantId,
        ...companyWhere,
      },
      _count: { _all: true },
    }),
    prisma.issuedCheque.count({
      where: {
        tenantId: actor.tenantId,
        ...companyWhere,
        printingStatus: 'PRINTED',
      },
    }),
    prisma.issuedCheque.findMany({
      where: {
        tenantId: actor.tenantId,
        ...companyWhere,
        businessStatus: { not: 'CANCELLED' },
        chequeDate: { gte: today, lt: tomorrow },
      },
      orderBy: { chequeNumber: 'asc' },
      take: 25,
      include: {
        company: { select: { companyName: true } },
        bankAccount: { select: { accountName: true, accountNumber: true } },
      },
    }),
    prisma.issuedCheque.findMany({
      where: {
        tenantId: actor.tenantId,
        ...companyWhere,
        businessStatus: { not: 'CANCELLED' },
        chequeDate: { gte: tomorrow, lt: dayAfterTomorrow },
      },
      orderBy: { chequeNumber: 'asc' },
      take: 25,
      include: {
        company: { select: { companyName: true } },
        bankAccount: { select: { accountName: true, accountNumber: true } },
      },
    }),
    prisma.issuedCheque.findMany({
      where: {
        tenantId: actor.tenantId,
        ...companyWhere,
        businessStatus: { not: 'CANCELLED' },
        chequeDate: { gte: dayAfterTomorrow, lt: sevenDaysAheadEnd },
      },
      orderBy: { chequeDate: 'asc' },
      take: 50,
      include: {
        company: { select: { companyName: true } },
        bankAccount: { select: { accountName: true, accountNumber: true } },
      },
    }),
    prisma.receivedCheque.count({
      where: {
        tenantId: actor.tenantId,
        ...companyWhere,
        receivedDate: { gte: today, lt: tomorrow },
      },
    }),
    prisma.receivedCheque.count({
      where: {
        tenantId: actor.tenantId,
        ...companyWhere,
        status: { in: ['RECEIVED', 'PENDING_DEPOSIT'] },
      },
    }),
    prisma.receivedCheque.count({
      where: {
        tenantId: actor.tenantId,
        ...companyWhere,
        depositedAt: { gte: today, lt: tomorrow },
      },
    }),
  ]);

  // Compute mutually exclusive lifecycle status counts + orthogonal printed count
  let totalCheques = 0;
  let draftCheques = 0;
  let cancelledCheques = 0;
  let issuedActiveTotal = 0;
  let pendingCheques = 0;
  let presentedCheques = 0;
  let clearedCheques = 0;
  let bouncedCheques = 0;
  let postponedCheques = 0;
  let stoppedCheques = 0;

  for (const row of issuedGroups) {
    const count = row._count._all;
    totalCheques += count;

    if (row.businessStatus === 'CANCELLED') {
      cancelledCheques += count;
    } else if (row.businessStatus === 'DRAFT') {
      draftCheques += count;
    } else if (row.businessStatus === 'ISSUED') {
      issuedActiveTotal += count;
      switch (row.bankingStatus) {
        case 'PENDING':
          pendingCheques += count;
          break;
        case 'PRESENTED':
          presentedCheques += count;
          break;
        case 'CLEARED':
          clearedCheques += count;
          break;
        case 'BOUNCED':
          bouncedCheques += count;
          break;
        case 'POSTPONED':
          postponedCheques += count;
          break;
        case 'STOPPED':
          stoppedCheques += count;
          break;
      }
    }
  }

  const mapMonitorItem = (
    c: Prisma.IssuedChequeGetPayload<{
      include: {
        company: { select: { companyName: true } };
        bankAccount: { select: { accountName: true; accountNumber: true } };
      };
    }>
  ) => ({
    id: c.id,
    chequeNumber: c.chequeNumber,
    payeeName: c.payeeName,
    companyName: c.company.companyName,
    bankAccountLabel: `${c.bankAccount.accountName} (${maskAccountNumber(c.bankAccount.accountNumber)})`,
    amount: c.amount.toFixed(2),
    currency: c.currency,
    chequeDate: c.chequeDate.toISOString().slice(0, 10),
    businessStatus: c.businessStatus,
    printingStatus: c.printingStatus,
    bankingStatus: c.bankingStatus,
  });

  return {
    bankAccounts: bankAccounts.map((acc) => ({
      id: acc.id,
      bankName: acc.bank.bankName,
      branchName: acc.branch?.branchName ?? 'Main',
      accountName: acc.accountName,
      accountNumberMasked: maskAccountNumber(acc.accountNumber),
      currency: acc.currency,
      currentBookBalance: acc.currentBookBalance.toFixed(2),
      status: acc.status,
      companyName: acc.company.companyName,
    })),
    chequeSummary: {
      totalCheques,
      draftCheques,
      issuedCheques: issuedActiveTotal,
      printedCheques: printedCount,
      pendingCheques,
      presentedCheques,
      clearedCheques,
      cancelledCheques,
      bouncedCheques,
      postponedCheques,
      stoppedCheques,
    },
    dateMonitor: {
      today: todayCheques.map(mapMonitorItem),
      tomorrow: tomorrowCheques.map(mapMonitorItem),
      nextSevenDays: nextSevenDaysCheques.map(mapMonitorItem),
    },
    receivedChequeMonitor: {
      receivedTodayCount,
      pendingBankingCount,
      bankedTodayCount,
    },
  };
}
