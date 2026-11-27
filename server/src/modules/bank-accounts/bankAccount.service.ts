import { Prisma } from '@prisma/client';
import {
  FEATURE_KEYS,
  type AuthenticatedTenantUser,
  type BankAccountStatus,
  type CreateBankAccountInput,
  type ListBankAccountsQueryInput,
  type UpdateBankAccountInput,
} from '@cheque-saas/shared';
import { getPrisma } from '../../config/prisma.js';
import { resolveAuthorizedCompanyId } from '../../core/authorization.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../core/errors.js';
import { maskAccountNumber } from '../../utils/masking.js';
import { recordTenantAudit } from '../audit-logs/audit.service.js';
import type { TenantActorMeta } from '../companies/company.service.js';

function mapBankAccountRow(
  acc: Prisma.BankAccountGetPayload<{
    include: {
      company: { select: { id: true; companyCode: true; companyName: true } };
      bank: { select: { id: true; bankCode: true; bankName: true } };
      branch: { select: { id: true; branchCode: true; branchName: true } };
    };
  }>
) {
  return {
    id: acc.id,
    tenantId: acc.tenantId,
    companyId: acc.companyId,
    company: acc.company,
    bankId: acc.bankId,
    bank: acc.bank,
    branchId: acc.branchId,
    branch: acc.branch,
    accountName: acc.accountName,
    accountNumber: acc.accountNumber,
    accountNumberMasked: maskAccountNumber(acc.accountNumber),
    accountType: acc.accountType,
    currency: acc.currency,
    openingBalance: acc.openingBalance.toFixed(2),
    openingBalanceDate: acc.openingBalanceDate.toISOString().slice(0, 10),
    currentBookBalance: acc.currentBookBalance.toFixed(2),
    status: acc.status,
    notes: acc.notes,
    createdAt: acc.createdAt.toISOString(),
    updatedAt: acc.updatedAt.toISOString(),
  };
}

export async function listBankAccounts(
  actor: AuthenticatedTenantUser,
  query: ListBankAccountsQueryInput
) {
  const prisma = getPrisma();
  const companiesEnabled = actor.tenant.enabledFeatures.includes(FEATURE_KEYS.COMPANIES);

  let companyFilter: Prisma.BankAccountWhereInput = {};
  if (query.companyId) {
    const authorizedCompanyId = resolveAuthorizedCompanyId(actor, query.companyId);
    companyFilter = { companyId: authorizedCompanyId };
  } else if (!companiesEnabled) {
    const defaultId = resolveAuthorizedCompanyId(actor, null);
    companyFilter = { companyId: defaultId };
  } else if (actor.companyAccessScope === 'SELECTED_COMPANIES') {
    companyFilter = { companyId: { in: actor.allowedCompanyIds } };
  }

  const where: Prisma.BankAccountWhereInput = {
    tenantId: actor.tenantId,
    ...companyFilter,
    ...(query.bankId ? { bankId: query.bankId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { accountName: { contains: query.search } },
            { accountNumber: { contains: query.search } },
          ],
        }
      : {}),
  };

  const skip = (query.page - 1) * query.limit;
  const [rows, totalItems] = await Promise.all([
    prisma.bankAccount.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip,
      take: query.limit,
      include: {
        company: { select: { id: true, companyCode: true, companyName: true } },
        bank: { select: { id: true, bankCode: true, bankName: true } },
        branch: { select: { id: true, branchCode: true, branchName: true } },
      },
    }),
    prisma.bankAccount.count({ where }),
  ]);

  return {
    items: rows.map(mapBankAccountRow),
    totalItems,
    page: query.page,
    limit: query.limit,
  };
}

export async function getBankAccountById(
  actor: AuthenticatedTenantUser,
  bankAccountId: string
) {
  const prisma = getPrisma();
  const account = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, tenantId: actor.tenantId },
    include: {
      company: { select: { id: true, companyCode: true, companyName: true } },
      bank: { select: { id: true, bankCode: true, bankName: true } },
      branch: { select: { id: true, branchCode: true, branchName: true } },
    },
  });

  if (!account) {
    throw new NotFoundError('Bank Account');
  }

  if (
    actor.companyAccessScope === 'SELECTED_COMPANIES' &&
    !actor.allowedCompanyIds.includes(account.companyId)
  ) {
    throw new ForbiddenError('You do not have access to this bank account.');
  }

  return mapBankAccountRow(account);
}

export async function createBankAccount(
  actor: AuthenticatedTenantUser,
  input: CreateBankAccountInput,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const companyId = resolveAuthorizedCompanyId(actor, input.companyId);

  const [company, bank, existingAccount] = await Promise.all([
    prisma.company.findFirst({
      where: { id: companyId, tenantId: actor.tenantId, status: 'ACTIVE' },
    }),
    prisma.bank.findFirst({
      where: {
        id: input.bankId,
        status: 'ACTIVE',
        OR: [{ isSystemShared: true }, { tenantId: actor.tenantId }],
      },
    }),
    prisma.bankAccount.findUnique({
      where: {
        tenantId_bankId_accountNumber: {
          tenantId: actor.tenantId,
          bankId: input.bankId,
          accountNumber: input.accountNumber,
        },
      },
      select: { id: true },
    }),
  ]);

  if (!company) {
    throw new NotFoundError('Company');
  }
  if (!bank) {
    throw new NotFoundError('Bank');
  }
  if (existingAccount) {
    throw new ConflictError('An account with this account number already exists for this bank.');
  }

  if (input.branchId) {
    const branch = await prisma.bankBranch.findFirst({
      where: {
        id: input.branchId,
        bankId: input.bankId,
        status: 'ACTIVE',
        OR: [{ isSystemShared: true }, { tenantId: actor.tenantId }],
      },
    });
    if (!branch) {
      throw new NotFoundError('Bank Branch');
    }
  }

  const openingDecimal = new Prisma.Decimal(input.openingBalance);
  const openingDate = new Date(`${input.openingBalanceDate}T00:00:00.000Z`);

  const created = await prisma.$transaction(async (tx) => {
    const account = await tx.bankAccount.create({
      data: {
        tenantId: actor.tenantId,
        companyId,
        bankId: input.bankId,
        branchId: input.branchId ?? null,
        accountName: input.accountName,
        accountNumber: input.accountNumber,
        accountType: input.accountType,
        currency: input.currency,
        openingBalance: openingDecimal,
        openingBalanceDate: openingDate,
        currentBookBalance: openingDecimal,
        status: 'ACTIVE',
        notes: input.notes ?? null,
        createdBy: actor.id,
      },
      include: {
        company: { select: { id: true, companyCode: true, companyName: true } },
        bank: { select: { id: true, bankCode: true, bankName: true } },
        branch: { select: { id: true, branchCode: true, branchName: true } },
      },
    });

    // Record Opening Balance as initial immutable ledger transaction
    await tx.bankAccountTransaction.create({
      data: {
        tenantId: actor.tenantId,
        companyId,
        bankAccountId: account.id,
        transactionDate: openingDate,
        transactionType: 'OPENING_BALANCE',
        referenceNumber: `OPEN-${account.accountNumber.slice(-4)}`,
        description: 'Initial opening book balance',
        debitAmount: new Prisma.Decimal('0.00'),
        creditAmount: openingDecimal,
        balanceAfterTransaction: openingDecimal,
        sequenceNumber: BigInt(1),
        idempotencyKey: `opening:${account.id}`,
        createdBy: actor.id,
      },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        companyId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'BANK_ACCOUNT_CREATED',
        entityType: 'BankAccount',
        entityId: account.id,
        newValues: {
          accountName: account.accountName,
          accountNumberMasked: maskAccountNumber(account.accountNumber),
          currency: account.currency,
          openingBalance: openingDecimal.toFixed(2),
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return account;
  });

  return mapBankAccountRow(created);
}

export async function updateBankAccount(
  actor: AuthenticatedTenantUser,
  bankAccountId: string,
  input: UpdateBankAccountInput,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, tenantId: actor.tenantId },
  });

  if (!existing) {
    throw new NotFoundError('Bank Account');
  }

  if (
    actor.companyAccessScope === 'SELECTED_COMPANIES' &&
    !actor.allowedCompanyIds.includes(existing.companyId)
  ) {
    throw new ForbiddenError('You do not have access to modify this bank account.');
  }

  if (input.branchId) {
    const branch = await prisma.bankBranch.findFirst({
      where: {
        id: input.branchId,
        bankId: existing.bankId,
        OR: [{ isSystemShared: true }, { tenantId: actor.tenantId }],
      },
    });
    if (!branch) {
      throw new NotFoundError('Bank Branch');
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const acc = await tx.bankAccount.update({
      where: { id: existing.id },
      data: {
        ...(input.branchId !== undefined ? { branchId: input.branchId } : {}),
        ...(input.accountName !== undefined ? { accountName: input.accountName } : {}),
        ...(input.accountType !== undefined ? { accountType: input.accountType } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        updatedBy: actor.id,
      },
      include: {
        company: { select: { id: true, companyCode: true, companyName: true } },
        bank: { select: { id: true, bankCode: true, bankName: true } },
        branch: { select: { id: true, branchCode: true, branchName: true } },
      },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        companyId: acc.companyId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'BANK_ACCOUNT_UPDATED',
        entityType: 'BankAccount',
        entityId: acc.id,
        previousValues: { accountName: existing.accountName, accountType: existing.accountType },
        newValues: input,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return acc;
  });

  return mapBankAccountRow(updated);
}

export async function updateBankAccountStatus(
  actor: AuthenticatedTenantUser,
  bankAccountId: string,
  status: BankAccountStatus,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, tenantId: actor.tenantId },
  });

  if (!existing) {
    throw new NotFoundError('Bank Account');
  }

  if (
    actor.companyAccessScope === 'SELECTED_COMPANIES' &&
    !actor.allowedCompanyIds.includes(existing.companyId)
  ) {
    throw new ForbiddenError('You do not have access to this bank account.');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const acc = await tx.bankAccount.update({
      where: { id: existing.id },
      data: { status, updatedBy: actor.id },
      include: {
        company: { select: { id: true, companyCode: true, companyName: true } },
        bank: { select: { id: true, bankCode: true, bankName: true } },
        branch: { select: { id: true, branchCode: true, branchName: true } },
      },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        companyId: acc.companyId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: `BANK_ACCOUNT_STATUS_${status}`,
        entityType: 'BankAccount',
        entityId: acc.id,
        previousValues: { status: existing.status },
        newValues: { status },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return acc;
  });

  return mapBankAccountRow(updated);
}

export async function listReferenceBanksForAccounts(tenantId: string) {
  const prisma = getPrisma();
  return prisma.bank.findMany({
    where: {
      status: 'ACTIVE',
      OR: [{ isSystemShared: true }, { tenantId }],
    },
    orderBy: [{ bankName: 'asc' }],
    select: {
      id: true,
      bankCode: true,
      bankName: true,
      branches: {
        where: {
          status: 'ACTIVE',
          OR: [{ isSystemShared: true }, { tenantId }],
        },
        orderBy: [{ branchName: 'asc' }],
        select: {
          id: true,
          branchCode: true,
          branchName: true,
        },
      },
    },
  });
}
