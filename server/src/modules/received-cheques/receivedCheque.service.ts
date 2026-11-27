import { Prisma } from '@prisma/client';
import {
  FEATURE_KEYS,
  isValidReceivedChequeTransition,
  type AuthenticatedTenantUser,
  type CreateReceivedChequeInput,
  type ListReceivedChequesQueryInput,
  type ReceivedChequeStatus,
  type UpdateReceivedChequeInput,
  type UpdateReceivedChequeStatusInput,
} from '@cheque-saas/shared';
import { getPrisma } from '../../config/prisma.js';
import { resolveAuthorizedCompanyId } from '../../core/authorization.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../core/errors.js';
import { maskAccountNumber } from '../../utils/masking.js';
import { recordTenantAudit } from '../audit-logs/audit.service.js';
import { postLedgerEntryInTx } from '../bank-transactions/ledger.service.js';
import type { TenantActorMeta } from '../companies/company.service.js';

const RECEIVED_INCLUDE = {
  company: { select: { id: true, companyCode: true, companyName: true } },
  bank: { select: { id: true, bankCode: true, bankName: true } },
  depositBankAccount: {
    select: {
      id: true,
      accountName: true,
      accountNumber: true,
      currency: true,
      bank: { select: { bankName: true } },
    },
  },
} satisfies Prisma.ReceivedChequeInclude;

function mapReceivedChequeDto(
  row: Prisma.ReceivedChequeGetPayload<{ include: typeof RECEIVED_INCLUDE }>
) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    companyId: row.companyId,
    company: row.company,
    chequeNumber: row.chequeNumber,
    chequeDate: row.chequeDate.toISOString().slice(0, 10),
    receivedDate: row.receivedDate.toISOString().slice(0, 10),
    bankId: row.bankId,
    bank: row.bank,
    bankName: row.bankName,
    branchName: row.branchName,
    receivedFrom: row.receivedFrom,
    amount: row.amount.toFixed(2),
    currency: row.currency,
    depositBankAccountId: row.depositBankAccountId,
    depositBankAccount: row.depositBankAccount
      ? {
          id: row.depositBankAccount.id,
          accountName: row.depositBankAccount.accountName,
          accountNumberMasked: maskAccountNumber(row.depositBankAccount.accountNumber),
          currency: row.depositBankAccount.currency,
          bankName: row.depositBankAccount.bank.bankName,
        }
      : null,
    depositedAt: row.depositedAt?.toISOString() ?? null,
    clearedAt: row.clearedAt?.toISOString() ?? null,
    note: row.note,
    status: row.status,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getReceivedChequeOptions(actor: AuthenticatedTenantUser) {
  const prisma = getPrisma();
  const companiesEnabled = actor.tenant.enabledFeatures.includes(FEATURE_KEYS.COMPANIES);
  const companyFilter = !companiesEnabled
    ? { companyId: resolveAuthorizedCompanyId(actor, null) }
    : actor.companyAccessScope === 'SELECTED_COMPANIES'
      ? { companyId: { in: actor.allowedCompanyIds } }
      : {};

  const [banks, bankAccounts] = await Promise.all([
    prisma.bank.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ isSystemShared: true }, { tenantId: actor.tenantId }],
      },
      orderBy: { bankName: 'asc' },
      select: { id: true, bankCode: true, bankName: true },
    }),
    prisma.bankAccount.findMany({
      where: {
        tenantId: actor.tenantId,
        status: 'ACTIVE',
        ...companyFilter,
      },
      orderBy: { accountName: 'asc' },
      include: {
        bank: { select: { bankName: true } },
      },
    }),
  ]);

  return {
    banks,
    bankAccounts: bankAccounts.map((a) => ({
      id: a.id,
      companyId: a.companyId,
      accountName: a.accountName,
      accountNumberMasked: maskAccountNumber(a.accountNumber),
      currency: a.currency,
      bankName: a.bank.bankName,
    })),
  };
}

export async function listReceivedCheques(
  actor: AuthenticatedTenantUser,
  query: ListReceivedChequesQueryInput
) {
  const prisma = getPrisma();
  const companiesEnabled = actor.tenant.enabledFeatures.includes(FEATURE_KEYS.COMPANIES);

  let companyFilter: Prisma.ReceivedChequeWhereInput = {};
  if (query.companyId) {
    companyFilter = { companyId: resolveAuthorizedCompanyId(actor, query.companyId) };
  } else if (!companiesEnabled) {
    companyFilter = { companyId: resolveAuthorizedCompanyId(actor, null) };
  } else if (actor.companyAccessScope === 'SELECTED_COMPANIES') {
    companyFilter = { companyId: { in: actor.allowedCompanyIds } };
  }

  const where: Prisma.ReceivedChequeWhereInput = {
    tenantId: actor.tenantId,
    ...companyFilter,
    ...(query.status ? { status: query.status } : {}),
    ...(query.fromDate || query.toDate
      ? {
          receivedDate: {
            ...(query.fromDate ? { gte: new Date(`${query.fromDate}T00:00:00.000Z`) } : {}),
            ...(query.toDate ? { lte: new Date(`${query.toDate}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
    ...(query.minAmount || query.maxAmount
      ? {
          amount: {
            ...(query.minAmount ? { gte: new Prisma.Decimal(query.minAmount) } : {}),
            ...(query.maxAmount ? { lte: new Prisma.Decimal(query.maxAmount) } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { chequeNumber: { contains: query.search } },
            { receivedFrom: { contains: query.search } },
            { bankName: { contains: query.search } },
            { note: { contains: query.search } },
          ],
        }
      : {}),
  };

  const skip = (query.page - 1) * query.limit;
  const [rows, totalItems] = await Promise.all([
    prisma.receivedCheque.findMany({
      where,
      orderBy: [{ receivedDate: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: query.limit,
      include: RECEIVED_INCLUDE,
    }),
    prisma.receivedCheque.count({ where }),
  ]);

  return {
    items: rows.map(mapReceivedChequeDto),
    totalItems,
    page: query.page,
    limit: query.limit,
  };
}

export async function getReceivedChequeById(
  actor: AuthenticatedTenantUser,
  receivedChequeId: string
) {
  const prisma = getPrisma();
  const cheque = await prisma.receivedCheque.findFirst({
    where: { id: receivedChequeId, tenantId: actor.tenantId },
    include: {
      ...RECEIVED_INCLUDE,
      statusHistory: { orderBy: { createdAt: 'desc' } },
    },
  });

  if (!cheque) {
    throw new NotFoundError('Received Cheque');
  }

  if (
    actor.companyAccessScope === 'SELECTED_COMPANIES' &&
    !actor.allowedCompanyIds.includes(cheque.companyId)
  ) {
    throw new ForbiddenError('You do not have access to this received cheque.');
  }

  return {
    ...mapReceivedChequeDto(cheque),
    statusHistory: cheque.statusHistory.map((h) => ({
      ...h,
      createdAt: h.createdAt.toISOString(),
    })),
  };
}

export async function createReceivedCheque(
  actor: AuthenticatedTenantUser,
  input: CreateReceivedChequeInput,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const companyId = resolveAuthorizedCompanyId(actor, input.companyId);

  if (input.depositBankAccountId) {
    const acc = await prisma.bankAccount.findFirst({
      where: {
        id: input.depositBankAccountId,
        tenantId: actor.tenantId,
        companyId,
        status: 'ACTIVE',
      },
    });
    if (!acc) {
      throw new NotFoundError('Deposit Bank Account');
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const cheque = await tx.receivedCheque.create({
      data: {
        tenantId: actor.tenantId,
        companyId,
        chequeNumber: input.chequeNumber,
        chequeDate: new Date(`${input.chequeDate}T00:00:00.000Z`),
        receivedDate: new Date(`${input.receivedDate}T00:00:00.000Z`),
        bankId: input.bankId ?? null,
        bankName: input.bankName,
        branchName: input.branchName ?? null,
        receivedFrom: input.receivedFrom,
        amount: new Prisma.Decimal(input.amount),
        currency: input.currency,
        depositBankAccountId: input.depositBankAccountId ?? null,
        note: input.note ?? null,
        status: input.status,
        createdBy: actor.id,
      },
      include: RECEIVED_INCLUDE,
    });

    await tx.receivedChequeStatusHistory.create({
      data: {
        tenantId: actor.tenantId,
        receivedChequeId: cheque.id,
        previousStatus: null,
        newStatus: input.status,
        reason: 'Received cheque recorded',
        changedBy: actor.id,
      },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        companyId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'RECEIVED_CHEQUE_CREATED',
        entityType: 'ReceivedCheque',
        entityId: cheque.id,
        newValues: {
          chequeNumber: cheque.chequeNumber,
          receivedFrom: cheque.receivedFrom,
          amount: cheque.amount.toFixed(2),
          status: cheque.status,
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return cheque;
  });

  return mapReceivedChequeDto(created);
}

export async function updateReceivedCheque(
  actor: AuthenticatedTenantUser,
  receivedChequeId: string,
  input: UpdateReceivedChequeInput,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.receivedCheque.findFirst({
    where: { id: receivedChequeId, tenantId: actor.tenantId },
  });

  if (!existing) {
    throw new NotFoundError('Received Cheque');
  }
  if (
    actor.companyAccessScope === 'SELECTED_COMPANIES' &&
    !actor.allowedCompanyIds.includes(existing.companyId)
  ) {
    throw new ForbiddenError('You do not have access to this received cheque.');
  }
  if (existing.version !== input.expectedVersion) {
    throw new ConflictError('Received cheque was updated elsewhere; please refresh.', 'VERSION_CONFLICT');
  }
  if (
    existing.status === 'CLEARED' ||
    existing.status === 'CANCELLED' ||
    existing.status === 'RETURNED'
  ) {
    throw new ForbiddenError(
      `Received cheques in ${existing.status} status cannot be modified.`
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.receivedCheque.update({
      where: { id: existing.id },
      data: {
        ...(input.chequeNumber !== undefined ? { chequeNumber: input.chequeNumber } : {}),
        ...(input.chequeDate !== undefined
          ? { chequeDate: new Date(`${input.chequeDate}T00:00:00.000Z`) }
          : {}),
        ...(input.receivedDate !== undefined
          ? { receivedDate: new Date(`${input.receivedDate}T00:00:00.000Z`) }
          : {}),
        ...(input.bankId !== undefined ? { bankId: input.bankId } : {}),
        ...(input.bankName !== undefined ? { bankName: input.bankName } : {}),
        ...(input.branchName !== undefined ? { branchName: input.branchName } : {}),
        ...(input.receivedFrom !== undefined ? { receivedFrom: input.receivedFrom } : {}),
        ...(input.amount !== undefined ? { amount: new Prisma.Decimal(input.amount) } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.depositBankAccountId !== undefined
          ? { depositBankAccountId: input.depositBankAccountId }
          : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        version: { increment: 1 },
        updatedBy: actor.id,
      },
      include: RECEIVED_INCLUDE,
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        companyId: existing.companyId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'RECEIVED_CHEQUE_UPDATED',
        entityType: 'ReceivedCheque',
        entityId: existing.id,
        newValues: input,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return row;
  });

  return mapReceivedChequeDto(updated);
}

export async function updateReceivedChequeStatus(
  actor: AuthenticatedTenantUser,
  receivedChequeId: string,
  input: UpdateReceivedChequeStatusInput,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.receivedCheque.findFirst({
    where: { id: receivedChequeId, tenantId: actor.tenantId },
  });

  if (!existing) {
    throw new NotFoundError('Received Cheque');
  }
  if (
    actor.companyAccessScope === 'SELECTED_COMPANIES' &&
    !actor.allowedCompanyIds.includes(existing.companyId)
  ) {
    throw new ForbiddenError('You do not have access to this received cheque.');
  }
  if (
    input.expectedVersion !== undefined &&
    existing.version !== input.expectedVersion
  ) {
    throw new ConflictError('Version conflict; refresh and retry.', 'VERSION_CONFLICT');
  }

  const nextStatus: ReceivedChequeStatus = input.status;
  if (!isValidReceivedChequeTransition(existing.status, nextStatus)) {
    throw new ValidationError(
      `Invalid status transition from ${existing.status} to ${nextStatus}.`
    );
  }

  const depositBankAccountId =
    input.depositBankAccountId ?? existing.depositBankAccountId;

  if (
    (nextStatus === 'DEPOSITED' || nextStatus === 'CLEARED') &&
    !depositBankAccountId
  ) {
    throw new ValidationError(
      'Deposit bank account is required when depositing or clearing a received cheque.'
    );
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.receivedCheque.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        depositBankAccountId,
        depositedAt:
          nextStatus === 'DEPOSITED' && !existing.depositedAt ? now : existing.depositedAt,
        clearedAt: nextStatus === 'CLEARED' ? now : existing.clearedAt,
        version: { increment: 1 },
        updatedBy: actor.id,
      },
      include: RECEIVED_INCLUDE,
    });

    await tx.receivedChequeStatusHistory.create({
      data: {
        tenantId: actor.tenantId,
        receivedChequeId: existing.id,
        previousStatus: existing.status,
        newStatus: nextStatus,
        reason: input.reason ?? null,
        changedBy: actor.id,
      },
    });

    // Credit bank book balance atomically once received cheque is CLEARED
    if (nextStatus === 'CLEARED' && depositBankAccountId) {
      await postLedgerEntryInTx(tx, {
        tenantId: actor.tenantId,
        companyId: existing.companyId,
        bankAccountId: depositBankAccountId,
        transactionDate: now,
        transactionType: 'RECEIVED_CHEQUE_DEPOSIT',
        referenceNumber: existing.chequeNumber,
        description: `Cleared received cheque from ${existing.receivedFrom} (${existing.bankName})`,
        debitAmount: '0.00',
        creditAmount: existing.amount.toFixed(2),
        receivedChequeId: existing.id,
        idempotencyKey: `received-clear:${existing.id}`,
        createdBy: actor.id,
      });
    }

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        companyId: existing.companyId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'RECEIVED_CHEQUE_STATUS_CHANGED',
        entityType: 'ReceivedCheque',
        entityId: existing.id,
        previousValues: { status: existing.status },
        newValues: { status: nextStatus, depositBankAccountId, reason: input.reason ?? null },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return row;
  });

  return mapReceivedChequeDto(updated);
}
