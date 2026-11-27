import { Prisma } from '@prisma/client';
import {
  calculateLedgerBalance,
  calculateNextRunningBalance,
  FEATURE_KEYS,
  type AuthenticatedTenantUser,
  type BankTransactionType,
  type CreateBankTransactionInput,
  type ListBankTransactionsQueryInput,
  type ReverseBankTransactionInput,
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
import type { TenantActorMeta } from '../companies/company.service.js';

export interface PostLedgerEntryParams {
  tenantId: string;
  companyId: string;
  bankAccountId: string;
  transactionDate: Date;
  transactionType: BankTransactionType;
  referenceNumber?: string | null;
  description?: string | null;
  debitAmount: string;
  creditAmount: string;
  issuedChequeId?: string | null;
  receivedChequeId?: string | null;
  reversedTransactionId?: string | null;
  idempotencyKey?: string | null;
  createdBy: string;
}

export async function postLedgerEntryInTx(
  tx: Prisma.TransactionClient,
  params: PostLedgerEntryParams
) {
  if (params.idempotencyKey) {
    const existing = await tx.bankAccountTransaction.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId: params.tenantId,
          idempotencyKey: params.idempotencyKey,
        },
      },
    });
    if (existing) {
      return { transaction: existing, deduplicated: true };
    }
  }

  const account = await tx.bankAccount.findFirst({
    where: {
      id: params.bankAccountId,
      tenantId: params.tenantId,
    },
  });

  if (!account) {
    throw new NotFoundError('Bank Account');
  }
  if (account.companyId !== params.companyId) {
    throw new ForbiddenError('Bank account does not belong to the authorized company.');
  }

  const latestTx = await tx.bankAccountTransaction.findFirst({
    where: { bankAccountId: account.id },
    orderBy: { sequenceNumber: 'desc' },
    select: { sequenceNumber: true },
  });

  const nextSequence = (latestTx?.sequenceNumber ?? 0n) + 1n;
  const nextBalanceStr = calculateNextRunningBalance(
    account.currentBookBalance.toFixed(2),
    params.debitAmount,
    params.creditAmount
  );

  const debitDecimal = new Prisma.Decimal(params.debitAmount);
  const creditDecimal = new Prisma.Decimal(params.creditAmount);
  const nextBalanceDecimal = new Prisma.Decimal(nextBalanceStr);

  const created = await tx.bankAccountTransaction.create({
    data: {
      tenantId: params.tenantId,
      companyId: params.companyId,
      bankAccountId: account.id,
      transactionDate: params.transactionDate,
      transactionType: params.transactionType,
      referenceNumber: params.referenceNumber ?? null,
      description: params.description ?? null,
      debitAmount: debitDecimal,
      creditAmount: creditDecimal,
      balanceAfterTransaction: nextBalanceDecimal,
      issuedChequeId: params.issuedChequeId ?? null,
      receivedChequeId: params.receivedChequeId ?? null,
      reversedTransactionId: params.reversedTransactionId ?? null,
      idempotencyKey: params.idempotencyKey ?? null,
      sequenceNumber: nextSequence,
      createdBy: params.createdBy,
    },
  });

  await tx.bankAccount.update({
    where: { id: account.id },
    data: { currentBookBalance: nextBalanceDecimal },
  });

  return { transaction: created, deduplicated: false };
}

function mapLedgerTransactionDto(
  row: Prisma.BankAccountTransactionGetPayload<{
    include: {
      bankAccount: {
        select: {
          id: true;
          accountName: true;
          accountNumber: true;
          currency: true;
          bank: { select: { bankCode: true; bankName: true } };
        };
      };
      company: { select: { id: true; companyCode: true; companyName: true } };
      reversalEntries: { select: { id: true; sequenceNumber: true; createdAt: true } };
    };
  }>
) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    companyId: row.companyId,
    company: row.company,
    bankAccountId: row.bankAccountId,
    bankAccount: {
      id: row.bankAccount.id,
      accountName: row.bankAccount.accountName,
      accountNumberMasked: maskAccountNumber(row.bankAccount.accountNumber),
      currency: row.bankAccount.currency,
      bank: row.bankAccount.bank,
    },
    transactionDate: row.transactionDate.toISOString(),
    transactionType: row.transactionType,
    referenceNumber: row.referenceNumber,
    description: row.description,
    debitAmount: row.debitAmount.toFixed(2),
    creditAmount: row.creditAmount.toFixed(2),
    balanceAfterTransaction: row.balanceAfterTransaction.toFixed(2),
    issuedChequeId: row.issuedChequeId,
    receivedChequeId: row.receivedChequeId,
    reversedTransactionId: row.reversedTransactionId,
    isReversed: row.reversalEntries.length > 0,
    sequenceNumber: row.sequenceNumber.toString(),
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
  };
}

export async function listBankTransactions(
  actor: AuthenticatedTenantUser,
  query: ListBankTransactionsQueryInput
) {
  const prisma = getPrisma();
  const companiesEnabled = actor.tenant.enabledFeatures.includes(FEATURE_KEYS.COMPANIES);

  let companyFilter: Prisma.BankAccountTransactionWhereInput = {};
  if (query.companyId) {
    companyFilter = { companyId: resolveAuthorizedCompanyId(actor, query.companyId) };
  } else if (!companiesEnabled) {
    companyFilter = { companyId: resolveAuthorizedCompanyId(actor, null) };
  } else if (actor.companyAccessScope === 'SELECTED_COMPANIES') {
    companyFilter = { companyId: { in: actor.allowedCompanyIds } };
  }

  const where: Prisma.BankAccountTransactionWhereInput = {
    tenantId: actor.tenantId,
    ...companyFilter,
    ...(query.bankAccountId ? { bankAccountId: query.bankAccountId } : {}),
    ...(query.transactionType ? { transactionType: query.transactionType } : {}),
    ...(query.fromDate || query.toDate
      ? {
          transactionDate: {
            ...(query.fromDate ? { gte: new Date(`${query.fromDate}T00:00:00.000Z`) } : {}),
            ...(query.toDate ? { lte: new Date(`${query.toDate}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { referenceNumber: { contains: query.search } },
            { description: { contains: query.search } },
          ],
        }
      : {}),
  };

  const skip = (query.page - 1) * query.limit;
  const [rows, totalItems] = await Promise.all([
    prisma.bankAccountTransaction.findMany({
      where,
      orderBy: [{ transactionDate: 'desc' }, { sequenceNumber: 'desc' }],
      skip,
      take: query.limit,
      include: {
        bankAccount: {
          select: {
            id: true,
            accountName: true,
            accountNumber: true,
            currency: true,
            bank: { select: { bankCode: true, bankName: true } },
          },
        },
        company: { select: { id: true, companyCode: true, companyName: true } },
        reversalEntries: { select: { id: true, sequenceNumber: true, createdAt: true } },
      },
    }),
    prisma.bankAccountTransaction.count({ where }),
  ]);

  return {
    items: rows.map(mapLedgerTransactionDto),
    totalItems,
    page: query.page,
    limit: query.limit,
  };
}

export async function postManualBankTransaction(
  actor: AuthenticatedTenantUser,
  input: CreateBankTransactionInput,
  idempotencyHeader: string | undefined,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const idempotencyKey = idempotencyHeader?.trim() || input.idempotencyKey?.trim() || null;

  const account = await prisma.bankAccount.findFirst({
    where: { id: input.bankAccountId, tenantId: actor.tenantId },
  });

  if (!account) {
    throw new NotFoundError('Bank Account');
  }
  if (account.status !== 'ACTIVE') {
    throw new ValidationError(`Transactions cannot be posted to a ${account.status} account.`);
  }
  if (
    actor.companyAccessScope === 'SELECTED_COMPANIES' &&
    !actor.allowedCompanyIds.includes(account.companyId)
  ) {
    throw new ForbiddenError('You do not have access to this bank account.');
  }

  const isCredit =
    input.transactionType === 'DEPOSIT' ||
    (input.transactionType === 'ADJUSTMENT' && input.adjustmentDirection === 'CREDIT');

  const debitAmount = isCredit ? '0.00' : input.amount;
  const creditAmount = isCredit ? input.amount : '0.00';
  const txDate = input.transactionDate
    ? new Date(`${input.transactionDate}T12:00:00.000Z`)
    : new Date();

  const result = await prisma.$transaction(async (tx) => {
    const posted = await postLedgerEntryInTx(tx, {
      tenantId: actor.tenantId,
      companyId: account.companyId,
      bankAccountId: account.id,
      transactionDate: txDate,
      transactionType: input.transactionType,
      referenceNumber: input.referenceNumber ?? null,
      description: input.description,
      debitAmount,
      creditAmount,
      idempotencyKey,
      createdBy: actor.id,
    });

    if (!posted.deduplicated) {
      if (input.transactionType === 'ADJUSTMENT') {
        await tx.bankAccountAdjustment.create({
          data: {
            tenantId: actor.tenantId,
            companyId: account.companyId,
            bankAccountId: account.id,
            adjustmentType: isCredit ? 'CREDIT' : 'DEBIT',
            amount: new Prisma.Decimal(input.amount),
            reason: input.description,
            status: 'POSTED',
            postedTransactionId: posted.transaction.id,
            requestedBy: actor.id,
            approvedBy: actor.id,
            approvedAt: new Date(),
          },
        });
      }

      await recordTenantAudit(
        {
          tenantId: actor.tenantId,
          companyId: account.companyId,
          userId: actor.id,
          deviceId: actor.deviceId,
          actorType: 'TENANT_USER',
          action: 'BANK_TRANSACTION_POSTED',
          entityType: 'BankAccountTransaction',
          entityId: posted.transaction.id,
          newValues: {
            bankAccountId: account.id,
            transactionType: input.transactionType,
            debitAmount,
            creditAmount,
            balanceAfterTransaction: posted.transaction.balanceAfterTransaction.toFixed(2),
          },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          requestId: meta.requestId,
        },
        tx
      );
    }

    return posted;
  });

  const hydrated = await prisma.bankAccountTransaction.findUniqueOrThrow({
    where: { id: result.transaction.id },
    include: {
      bankAccount: {
        select: {
          id: true,
          accountName: true,
          accountNumber: true,
          currency: true,
          bank: { select: { bankCode: true, bankName: true } },
        },
      },
      company: { select: { id: true, companyCode: true, companyName: true } },
      reversalEntries: { select: { id: true, sequenceNumber: true, createdAt: true } },
    },
  });

  return {
    transaction: mapLedgerTransactionDto(hydrated),
    deduplicated: result.deduplicated,
  };
}

export async function reverseBankTransaction(
  actor: AuthenticatedTenantUser,
  transactionId: string,
  input: ReverseBankTransactionInput,
  idempotencyHeader: string | undefined,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const idempotencyKey =
    idempotencyHeader?.trim() || input.idempotencyKey?.trim() || `reversal:${transactionId}`;

  const original = await prisma.bankAccountTransaction.findFirst({
    where: { id: transactionId, tenantId: actor.tenantId },
    include: {
      reversalEntries: { select: { id: true } },
    },
  });

  if (!original) {
    throw new NotFoundError('Bank Transaction');
  }

  if (
    actor.companyAccessScope === 'SELECTED_COMPANIES' &&
    !actor.allowedCompanyIds.includes(original.companyId)
  ) {
    throw new ForbiddenError('You do not have access to this bank transaction.');
  }

  if (original.transactionType === 'OPENING_BALANCE') {
    throw new ValidationError('Opening balance entries cannot be reversed directly.');
  }

  if (original.transactionType === 'REVERSAL') {
    throw new ValidationError('A reversal transaction cannot be reversed directly.');
  }

  if (original.reversalEntries.length > 0) {
    throw new ConflictError('This transaction has already been reversed.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const reversal = await postLedgerEntryInTx(tx, {
      tenantId: actor.tenantId,
      companyId: original.companyId,
      bankAccountId: original.bankAccountId,
      transactionDate: new Date(),
      transactionType: 'REVERSAL',
      referenceNumber: original.referenceNumber
        ? `REV-${original.referenceNumber}`
        : `REV-${original.sequenceNumber.toString()}`,
      description: `Reversal of entry #${original.sequenceNumber.toString()}: ${input.reason}`,
      // Swap debit & credit amounts to offset the original posting
      debitAmount: original.creditAmount.toFixed(2),
      creditAmount: original.debitAmount.toFixed(2),
      reversedTransactionId: original.id,
      idempotencyKey,
      createdBy: actor.id,
    });

    if (!reversal.deduplicated) {
      await recordTenantAudit(
        {
          tenantId: actor.tenantId,
          companyId: original.companyId,
          userId: actor.id,
          deviceId: actor.deviceId,
          actorType: 'TENANT_USER',
          action: 'BANK_TRANSACTION_REVERSED',
          entityType: 'BankAccountTransaction',
          entityId: reversal.transaction.id,
          previousValues: { reversedTransactionId: original.id },
          newValues: {
            reason: input.reason,
            debitAmount: reversal.transaction.debitAmount.toFixed(2),
            creditAmount: reversal.transaction.creditAmount.toFixed(2),
          },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          requestId: meta.requestId,
        },
        tx
      );
    }

    return reversal;
  });

  const hydrated = await prisma.bankAccountTransaction.findUniqueOrThrow({
    where: { id: result.transaction.id },
    include: {
      bankAccount: {
        select: {
          id: true,
          accountName: true,
          accountNumber: true,
          currency: true,
          bank: { select: { bankCode: true, bankName: true } },
        },
      },
      company: { select: { id: true, companyCode: true, companyName: true } },
      reversalEntries: { select: { id: true, sequenceNumber: true, createdAt: true } },
    },
  });

  return mapLedgerTransactionDto(hydrated);
}

export async function reconcileBankAccountBalance(
  actor: AuthenticatedTenantUser,
  bankAccountId: string
) {
  const prisma = getPrisma();
  const account = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, tenantId: actor.tenantId },
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

  const rows = await prisma.bankAccountTransaction.findMany({
    where: { tenantId: actor.tenantId, bankAccountId: account.id },
    select: {
      transactionType: true,
      debitAmount: true,
      creditAmount: true,
    },
  });

  const nonOpening = rows
    .filter((r) => r.transactionType !== 'OPENING_BALANCE')
    .map((r) => ({
      debitAmount: r.debitAmount.toFixed(2),
      creditAmount: r.creditAmount.toFixed(2),
    }));

  const calculatedBalance = calculateLedgerBalance(
    account.openingBalance.toFixed(2),
    nonOpening
  );
  const cachedBalance = account.currentBookBalance.toFixed(2);

  return {
    bankAccountId: account.id,
    openingBalance: account.openingBalance.toFixed(2),
    cachedBookBalance: cachedBalance,
    calculatedLedgerBalance: calculatedBalance,
    isReconciled: cachedBalance === calculatedBalance,
    transactionCount: rows.length,
  };
}

export async function getBankLedgerSummary(
  actor: AuthenticatedTenantUser,
  params: { companyId?: string; bankAccountId?: string; fromDate?: string; toDate?: string }
) {
  const prisma = getPrisma();
  const companiesEnabled = actor.tenant.enabledFeatures.includes(FEATURE_KEYS.COMPANIES);

  const companyFilter = params.companyId
    ? { companyId: resolveAuthorizedCompanyId(actor, params.companyId) }
    : !companiesEnabled
      ? { companyId: resolveAuthorizedCompanyId(actor, null) }
      : actor.companyAccessScope === 'SELECTED_COMPANIES'
        ? { companyId: { in: actor.allowedCompanyIds } }
        : {};

  const where: Prisma.BankAccountTransactionWhereInput = {
    tenantId: actor.tenantId,
    ...companyFilter,
    ...(params.bankAccountId ? { bankAccountId: params.bankAccountId } : {}),
    ...(params.fromDate || params.toDate
      ? {
          transactionDate: {
            ...(params.fromDate ? { gte: new Date(`${params.fromDate}T00:00:00.000Z`) } : {}),
            ...(params.toDate ? { lte: new Date(`${params.toDate}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
  };

  const grouped = await prisma.bankAccountTransaction.groupBy({
    by: ['transactionType'],
    where,
    _sum: { debitAmount: true, creditAmount: true },
    _count: { _all: true },
  });

  return grouped.map((g) => ({
    transactionType: g.transactionType,
    count: g._count._all,
    totalDebits: (g._sum.debitAmount ?? new Prisma.Decimal(0)).toFixed(2),
    totalCredits: (g._sum.creditAmount ?? new Prisma.Decimal(0)).toFixed(2),
  }));
}
