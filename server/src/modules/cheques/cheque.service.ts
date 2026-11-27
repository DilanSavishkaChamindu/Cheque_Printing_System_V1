import { Prisma } from '@prisma/client';
import {
  canEditChequeRecord,
  FEATURE_KEYS,
  formatChequeNumber,
  isValidBankingStatusTransition,
  verifyAmountInWordsMatch,
  type AuthenticatedTenantUser,
  type CancelChequeInput,
  type ChequeBankingStatus,
  type CreateIssuedChequeInput,
  type ListChequesQueryInput,
  type RecordChequePrintInput,
  type UpdateChequeBankingStatusInput,
  type UpdateIssuedChequeInput,
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

const CHEQUE_INCLUDE = {
  company: { select: { id: true, companyCode: true, companyName: true } },
  bank: { select: { id: true, bankCode: true, bankName: true } },
  bankAccount: {
    select: {
      id: true,
      accountName: true,
      accountNumber: true,
      currency: true,
    },
  },
  chequeBook: {
    select: { id: true, bookName: true, chequePrefix: true, numberPaddingLength: true },
  },
  template: {
    select: { id: true, templateName: true, dateFormat: true },
  },
} satisfies Prisma.IssuedChequeInclude;

function mapIssuedChequeDto(
  row: Prisma.IssuedChequeGetPayload<{ include: typeof CHEQUE_INCLUDE }>
) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    companyId: row.companyId,
    company: row.company,
    bankId: row.bankId,
    bank: row.bank,
    bankAccountId: row.bankAccountId,
    bankAccount: {
      ...row.bankAccount,
      accountNumberMasked: maskAccountNumber(row.bankAccount.accountNumber),
    },
    chequeBookId: row.chequeBookId,
    chequeBook: row.chequeBook,
    templateId: row.templateId,
    template: row.template,
    chequeNumber: row.chequeNumber,
    chequeNumberNumeric: row.chequeNumberNumeric,
    chequeDate: row.chequeDate.toISOString().slice(0, 10),
    dateFormat: row.dateFormat,
    payeeName: row.payeeName,
    amount: row.amount.toFixed(2),
    currency: row.currency,
    paymentType: row.paymentType,
    cashRecipient: row.cashRecipient,
    amountInWords: row.amountInWords,
    description: row.description,
    businessStatus: row.businessStatus,
    printingStatus: row.printingStatus,
    bankingStatus: row.bankingStatus,
    printCount: row.printCount,
    lastPrintedAt: row.lastPrintedAt?.toISOString() ?? null,
    clearedAt: row.clearedAt?.toISOString() ?? null,
    bouncedAt: row.bouncedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancellationReason: row.cancellationReason,
    isOfflineCreated: row.isOfflineCreated,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy,
  };
}

function parseNumericSuffix(rawChequeNumber: string, prefix: string | null): number | null {
  const stripped =
    prefix && rawChequeNumber.startsWith(prefix)
      ? rawChequeNumber.slice(prefix.length)
      : rawChequeNumber;
  if (!/^\d+$/.test(stripped)) {
    return null;
  }
  return Number.parseInt(stripped, 10);
}

export async function getChequeCreationContext(
  actor: AuthenticatedTenantUser,
  requestedCompanyId?: string
) {
  const prisma = getPrisma();
  const companiesEnabled = actor.tenant.enabledFeatures.includes(FEATURE_KEYS.COMPANIES);

  const companyFilter = requestedCompanyId
    ? { companyId: resolveAuthorizedCompanyId(actor, requestedCompanyId) }
    : !companiesEnabled
      ? { companyId: resolveAuthorizedCompanyId(actor, null) }
      : actor.companyAccessScope === 'SELECTED_COMPANIES'
        ? { companyId: { in: actor.allowedCompanyIds } }
        : {};

  const [bankAccounts, chequeBooks, templates] = await Promise.all([
    prisma.bankAccount.findMany({
      where: {
        tenantId: actor.tenantId,
        status: 'ACTIVE',
        ...companyFilter,
      },
      orderBy: { accountName: 'asc' },
      include: {
        bank: { select: { id: true, bankCode: true, bankName: true } },
        branch: { select: { id: true, branchCode: true, branchName: true } },
        company: { select: { id: true, companyCode: true, companyName: true } },
      },
    }),
    prisma.chequeBook.findMany({
      where: {
        tenantId: actor.tenantId,
        status: 'ACTIVE',
        ...companyFilter,
      },
      orderBy: { bookName: 'asc' },
    }),
    prisma.chequeTemplate.findMany({
      where: {
        tenantId: actor.tenantId,
        status: 'ACTIVE',
      },
      include: {
        fields: true,
        calibrationProfiles: { where: { isDefault: true } },
      },
      orderBy: [{ isDefault: 'desc' }, { templateName: 'asc' }],
    }),
  ]);

  return {
    bankAccounts: bankAccounts.map((acc) => ({
      id: acc.id,
      companyId: acc.companyId,
      company: acc.company,
      bankId: acc.bankId,
      bank: acc.bank,
      branch: acc.branch,
      accountName: acc.accountName,
      accountNumberMasked: maskAccountNumber(acc.accountNumber),
      currency: acc.currency,
    })),
    chequeBooks: chequeBooks.map((book) => ({
      id: book.id,
      companyId: book.companyId,
      bankAccountId: book.bankAccountId,
      bookName: book.bookName,
      chequePrefix: book.chequePrefix,
      startingNumber: book.startingNumber,
      endingNumber: book.endingNumber,
      nextAvailableNumber: book.nextAvailableNumber,
      nextChequeNumberFormatted: formatChequeNumber(
        book.chequePrefix,
        book.nextAvailableNumber,
        book.numberPaddingLength
      ),
      remainingLeaves: Math.max(0, book.totalLeaves - book.usedLeaves),
    })),
    templates: templates.map((t) => ({
      ...t,
      paperWidthMm: t.paperWidthMm.toString(),
      paperHeightMm: t.paperHeightMm.toString(),
      fields: t.fields.map((f) => ({
        ...f,
        xMm: f.xMm.toString(),
        yMm: f.yMm.toString(),
        widthMm: f.widthMm.toString(),
        heightMm: f.heightMm.toString(),
        fontSizePt: f.fontSizePt.toString(),
        letterSpacingMm: f.letterSpacingMm.toString(),
        lineHeight: f.lineHeight.toString(),
        dateDigitGapMm: f.dateDigitGapMm?.toString() ?? null,
      })),
    })),
  };
}

const CHEQUE_SORT_FIELDS: Record<string, keyof Prisma.IssuedChequeOrderByWithRelationInput> = {
  chequeDate: 'chequeDate',
  createdAt: 'createdAt',
  amount: 'amount',
  chequeNumber: 'chequeNumber',
  payeeName: 'payeeName',
};

export async function listIssuedCheques(
  actor: AuthenticatedTenantUser,
  query: ListChequesQueryInput
) {
  const prisma = getPrisma();
  const companiesEnabled = actor.tenant.enabledFeatures.includes(FEATURE_KEYS.COMPANIES);

  let companyFilter: Prisma.IssuedChequeWhereInput = {};
  if (query.companyId) {
    companyFilter = { companyId: resolveAuthorizedCompanyId(actor, query.companyId) };
  } else if (!companiesEnabled) {
    companyFilter = { companyId: resolveAuthorizedCompanyId(actor, null) };
  } else if (actor.companyAccessScope === 'SELECTED_COMPANIES') {
    companyFilter = { companyId: { in: actor.allowedCompanyIds } };
  }

  const where: Prisma.IssuedChequeWhereInput = {
    tenantId: actor.tenantId,
    ...companyFilter,
    ...(query.bankId ? { bankId: query.bankId } : {}),
    ...(query.bankAccountId ? { bankAccountId: query.bankAccountId } : {}),
    ...(query.chequeNumber ? { chequeNumber: { contains: query.chequeNumber } } : {}),
    ...(query.payeeName ? { payeeName: { contains: query.payeeName } } : {}),
    ...(query.businessStatus ? { businessStatus: query.businessStatus } : {}),
    ...(query.printingStatus ? { printingStatus: query.printingStatus } : {}),
    ...(query.bankingStatus ? { bankingStatus: query.bankingStatus } : {}),
    ...(query.fromDate || query.toDate
      ? {
          chequeDate: {
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
            { payeeName: { contains: query.search } },
            { description: { contains: query.search } },
          ],
        }
      : {}),
  };

  const sortField = (query.sortBy && CHEQUE_SORT_FIELDS[query.sortBy]) || 'createdAt';
  const skip = (query.page - 1) * query.limit;

  const [rows, totalItems] = await Promise.all([
    prisma.issuedCheque.findMany({
      where,
      orderBy: { [sortField]: query.sortOrder },
      skip,
      take: query.limit,
      include: CHEQUE_INCLUDE,
    }),
    prisma.issuedCheque.count({ where }),
  ]);

  return {
    items: rows.map(mapIssuedChequeDto),
    totalItems,
    page: query.page,
    limit: query.limit,
  };
}

export async function getIssuedChequeById(
  actor: AuthenticatedTenantUser,
  chequeId: string
) {
  const prisma = getPrisma();
  const cheque = await prisma.issuedCheque.findFirst({
    where: { id: chequeId, tenantId: actor.tenantId },
    include: {
      ...CHEQUE_INCLUDE,
      statusHistory: { orderBy: { createdAt: 'desc' } },
      printJobs: { orderBy: { printedAt: 'desc' } },
    },
  });

  if (!cheque) {
    throw new NotFoundError('Issued Cheque');
  }

  if (
    actor.companyAccessScope === 'SELECTED_COMPANIES' &&
    !actor.allowedCompanyIds.includes(cheque.companyId)
  ) {
    throw new ForbiddenError('You do not have access to this cheque.');
  }

  return {
    ...mapIssuedChequeDto(cheque),
    statusHistory: cheque.statusHistory.map((h) => ({
      ...h,
      createdAt: h.createdAt.toISOString(),
    })),
    printJobs: cheque.printJobs.map((p) => ({
      ...p,
      scalePercent: p.scalePercent?.toString() ?? null,
      printedAt: p.printedAt.toISOString(),
    })),
  };
}

export async function createIssuedCheque(
  actor: AuthenticatedTenantUser,
  input: CreateIssuedChequeInput,
  idempotencyKeyHeader: string | undefined,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const idempotencyKey = idempotencyKeyHeader?.trim() || input.idempotencyKey?.trim() || null;

  // Idempotent return if this operation already completed
  if (idempotencyKey) {
    const existing = await prisma.issuedCheque.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId: actor.tenantId,
          idempotencyKey,
        },
      },
      include: CHEQUE_INCLUDE,
    });
    if (existing) {
      return { cheque: mapIssuedChequeDto(existing), deduplicated: true };
    }
  }

  if (!verifyAmountInWordsMatch(input.amount, input.currency, input.amountInWords, 'en')) {
    throw new ValidationError(
      'Amount in words does not match the numeric amount and currency.'
    );
  }

  const companyId = resolveAuthorizedCompanyId(actor, input.companyId);

  const created = await prisma.$transaction(async (tx) => {
    const bankAccount = await tx.bankAccount.findFirst({
      where: { id: input.bankAccountId, tenantId: actor.tenantId },
    });

    if (!bankAccount) {
      throw new NotFoundError('Bank Account');
    }
    if (bankAccount.status !== 'ACTIVE') {
      throw new ValidationError('Cheques can only be issued from active bank accounts.');
    }
    if (bankAccount.companyId !== companyId) {
      throw new ForbiddenError('Bank account does not belong to the authorized company.');
    }

    const chequeBook = await tx.chequeBook.findFirst({
      where: {
        id: input.chequeBookId,
        tenantId: actor.tenantId,
        bankAccountId: bankAccount.id,
      },
    });

    if (!chequeBook) {
      throw new NotFoundError('Cheque Book');
    }
    if (chequeBook.status !== 'ACTIVE') {
      throw new ValidationError(`Cheque book '${chequeBook.bookName}' is ${chequeBook.status}.`);
    }

    let resolvedNumeric: number | null = null;
    let resolvedChequeNumber: string;

    if (input.chequeNumber) {
      resolvedChequeNumber = input.chequeNumber.trim();
      resolvedNumeric = parseNumericSuffix(resolvedChequeNumber, chequeBook.chequePrefix);
      if (resolvedNumeric !== null) {
        if (
          resolvedNumeric < chequeBook.startingNumber ||
          resolvedNumeric > chequeBook.endingNumber
        ) {
          throw new ValidationError(
            `Cheque number ${resolvedChequeNumber} falls outside cheque book range (${chequeBook.startingNumber}-${chequeBook.endingNumber}).`
          );
        }
      }
    } else {
      if (chequeBook.nextAvailableNumber > chequeBook.endingNumber) {
        throw new ConflictError('Cheque book has no remaining leaves available.');
      }
      resolvedNumeric = chequeBook.nextAvailableNumber;
      resolvedChequeNumber = formatChequeNumber(
        chequeBook.chequePrefix,
        resolvedNumeric,
        chequeBook.numberPaddingLength
      );
    }

    // Check offline range reservations so online issuance never steals an offline device range
    if (resolvedNumeric !== null) {
      const reservedOffline = await tx.chequeNumberAllocation.findFirst({
        where: {
          tenantId: actor.tenantId,
          chequeBookId: chequeBook.id,
          allocationType: 'OFFLINE_RANGE',
          status: 'ACTIVE',
          rangeStart: { lte: resolvedNumeric },
          rangeEnd: { gte: resolvedNumeric },
          ...(actor.deviceId ? { deviceId: { not: actor.deviceId } } : {}),
        },
        select: { id: true, rangeStart: true, rangeEnd: true },
      });

      if (reservedOffline) {
        throw new ConflictError(
          `Cheque number ${resolvedChequeNumber} is reserved inside offline allocation range ${reservedOffline.rangeStart}-${reservedOffline.rangeEnd}.`
        );
      }
    }

    const dupCheque = await tx.issuedCheque.findUnique({
      where: {
        tenantId_bankAccountId_chequeNumber: {
          tenantId: actor.tenantId,
          bankAccountId: bankAccount.id,
          chequeNumber: resolvedChequeNumber,
        },
      },
      select: { id: true },
    });

    if (dupCheque) {
      throw new ConflictError(
        `Cheque number '${resolvedChequeNumber}' already exists on this bank account.`
      );
    }

    if (input.templateId) {
      const tpl = await tx.chequeTemplate.findFirst({
        where: { id: input.templateId, tenantId: actor.tenantId },
        select: { id: true },
      });
      if (!tpl) {
        throw new NotFoundError('Cheque Template');
      }
    }

    const businessStatus = input.issueImmediately ? 'ISSUED' : 'DRAFT';
    const amountDecimal = new Prisma.Decimal(input.amount);

    const cheque = await tx.issuedCheque.create({
      data: {
        tenantId: actor.tenantId,
        companyId,
        bankId: bankAccount.bankId,
        bankAccountId: bankAccount.id,
        chequeBookId: chequeBook.id,
        templateId: input.templateId ?? null,
        chequeNumber: resolvedChequeNumber,
        chequeNumberNumeric: resolvedNumeric,
        chequeDate: new Date(`${input.chequeDate}T00:00:00.000Z`),
        dateFormat: input.dateFormat,
        payeeName: input.payeeName,
        amount: amountDecimal,
        currency: input.currency,
        paymentType: input.paymentType,
        cashRecipient:
          input.paymentType === 'CASH' ? (input.cashRecipient ?? null) : null,
        amountInWords: input.amountInWords,
        description: input.description ?? null,
        businessStatus,
        printingStatus: 'NOT_PRINTED',
        bankingStatus: 'PENDING',
        idempotencyKey,
        originDeviceId: actor.deviceId,
        createdBy: actor.id,
      },
      include: CHEQUE_INCLUDE,
    });

    // Advance cheque book counters
    const nextUsed = chequeBook.usedLeaves + 1;
    const isExhausted = nextUsed >= chequeBook.totalLeaves;
    const nextCursor =
      resolvedNumeric !== null && resolvedNumeric >= chequeBook.nextAvailableNumber
        ? resolvedNumeric + 1
        : chequeBook.nextAvailableNumber;

    await tx.chequeBook.update({
      where: { id: chequeBook.id },
      data: {
        usedLeaves: nextUsed,
        nextAvailableNumber: nextCursor,
        status: isExhausted ? 'EXHAUSTED' : chequeBook.status,
        updatedBy: actor.id,
      },
    });

    await tx.issuedChequeStatusHistory.create({
      data: {
        tenantId: actor.tenantId,
        issuedChequeId: cheque.id,
        statusCategory: 'BUSINESS',
        previousStatus: null,
        newStatus: businessStatus,
        reason: input.issueImmediately ? 'Cheque created and issued' : 'Draft saved',
        changedBy: actor.id,
        deviceId: actor.deviceId,
      },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        companyId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'CHEQUE_CREATED',
        entityType: 'IssuedCheque',
        entityId: cheque.id,
        newValues: {
          chequeNumber: cheque.chequeNumber,
          payeeName: cheque.payeeName,
          amount: amountDecimal.toFixed(2),
          currency: cheque.currency,
          businessStatus,
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return cheque;
  });

  return { cheque: mapIssuedChequeDto(created), deduplicated: false };
}

export async function updateIssuedCheque(
  actor: AuthenticatedTenantUser,
  chequeId: string,
  input: UpdateIssuedChequeInput,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.issuedCheque.findFirst({
    where: { id: chequeId, tenantId: actor.tenantId },
  });

  if (!existing) {
    throw new NotFoundError('Issued Cheque');
  }

  if (
    actor.companyAccessScope === 'SELECTED_COMPANIES' &&
    !actor.allowedCompanyIds.includes(existing.companyId)
  ) {
    throw new ForbiddenError('You do not have access to this cheque.');
  }

  if (existing.version !== input.expectedVersion) {
    throw new ConflictError(
      'Cheque record was modified by another request. Refresh before saving.',
      'VERSION_CONFLICT'
    );
  }

  const editCheck = canEditChequeRecord({
    businessStatus: existing.businessStatus,
    printingStatus: existing.printingStatus,
    bankingStatus: existing.bankingStatus,
  });

  if (!editCheck.allowed) {
    throw new ForbiddenError(editCheck.reason ?? 'Cheque cannot be modified.');
  }

  const nextAmount = input.amount ?? existing.amount.toFixed(2);
  const nextCurrency = input.currency ?? existing.currency;
  const nextWords = input.amountInWords ?? existing.amountInWords;

  if (!verifyAmountInWordsMatch(nextAmount, nextCurrency, nextWords, 'en')) {
    throw new ValidationError(
      'Amount in words does not match the numeric amount and currency.'
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.issuedCheque.update({
      where: { id: existing.id },
      data: {
        ...(input.chequeDate !== undefined
          ? { chequeDate: new Date(`${input.chequeDate}T00:00:00.000Z`) }
          : {}),
        ...(input.dateFormat !== undefined ? { dateFormat: input.dateFormat } : {}),
        ...(input.payeeName !== undefined ? { payeeName: input.payeeName } : {}),
        ...(input.amount !== undefined ? { amount: new Prisma.Decimal(input.amount) } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.paymentType !== undefined ? { paymentType: input.paymentType } : {}),
        ...(input.cashRecipient !== undefined
          ? { cashRecipient: input.cashRecipient }
          : {}),
        ...(input.amountInWords !== undefined ? { amountInWords: input.amountInWords } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.templateId !== undefined ? { templateId: input.templateId } : {}),
        version: { increment: 1 },
        updatedBy: actor.id,
      },
      include: CHEQUE_INCLUDE,
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        companyId: existing.companyId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'CHEQUE_UPDATED',
        entityType: 'IssuedCheque',
        entityId: existing.id,
        previousValues: {
          payeeName: existing.payeeName,
          amount: existing.amount.toFixed(2),
          chequeDate: existing.chequeDate.toISOString().slice(0, 10),
        },
        newValues: input,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return row;
  });

  return mapIssuedChequeDto(updated);
}

export async function issueDraftCheque(
  actor: AuthenticatedTenantUser,
  chequeId: string,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.issuedCheque.findFirst({
    where: { id: chequeId, tenantId: actor.tenantId },
  });

  if (!existing) {
    throw new NotFoundError('Issued Cheque');
  }
  if (
    actor.companyAccessScope === 'SELECTED_COMPANIES' &&
    !actor.allowedCompanyIds.includes(existing.companyId)
  ) {
    throw new ForbiddenError('You do not have access to this cheque.');
  }
  if (existing.businessStatus !== 'DRAFT') {
    throw new ConflictError(`Only DRAFT cheques can be issued (current: ${existing.businessStatus}).`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.issuedCheque.update({
      where: { id: existing.id },
      data: {
        businessStatus: 'ISSUED',
        version: { increment: 1 },
        updatedBy: actor.id,
      },
      include: CHEQUE_INCLUDE,
    });

    await tx.issuedChequeStatusHistory.create({
      data: {
        tenantId: actor.tenantId,
        issuedChequeId: existing.id,
        statusCategory: 'BUSINESS',
        previousStatus: 'DRAFT',
        newStatus: 'ISSUED',
        reason: 'Draft finalized and issued',
        changedBy: actor.id,
        deviceId: actor.deviceId,
      },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        companyId: existing.companyId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'CHEQUE_ISSUED',
        entityType: 'IssuedCheque',
        entityId: existing.id,
        previousValues: { businessStatus: 'DRAFT' },
        newValues: { businessStatus: 'ISSUED' },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return row;
  });

  return mapIssuedChequeDto(updated);
}

export async function cancelIssuedCheque(
  actor: AuthenticatedTenantUser,
  chequeId: string,
  input: CancelChequeInput,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.issuedCheque.findFirst({
    where: { id: chequeId, tenantId: actor.tenantId },
  });

  if (!existing) {
    throw new NotFoundError('Issued Cheque');
  }
  if (
    actor.companyAccessScope === 'SELECTED_COMPANIES' &&
    !actor.allowedCompanyIds.includes(existing.companyId)
  ) {
    throw new ForbiddenError('You do not have access to this cheque.');
  }
  if (existing.businessStatus === 'CANCELLED') {
    throw new ConflictError('Cheque is already cancelled.');
  }
  if (existing.bankingStatus === 'CLEARED') {
    throw new ConflictError('Cleared cheques cannot be cancelled.');
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.issuedCheque.update({
      where: { id: existing.id },
      data: {
        businessStatus: 'CANCELLED',
        cancelledAt: now,
        cancellationReason: input.reason,
        version: { increment: 1 },
        updatedBy: actor.id,
      },
      include: CHEQUE_INCLUDE,
    });

    await tx.issuedChequeStatusHistory.create({
      data: {
        tenantId: actor.tenantId,
        issuedChequeId: existing.id,
        statusCategory: 'BUSINESS',
        previousStatus: existing.businessStatus,
        newStatus: 'CANCELLED',
        reason: input.reason,
        changedBy: actor.id,
        deviceId: actor.deviceId,
      },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        companyId: existing.companyId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'CHEQUE_CANCELLED',
        entityType: 'IssuedCheque',
        entityId: existing.id,
        previousValues: { businessStatus: existing.businessStatus },
        newValues: { businessStatus: 'CANCELLED', reason: input.reason },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return row;
  });

  return mapIssuedChequeDto(updated);
}

export async function updateChequeBankingStatus(
  actor: AuthenticatedTenantUser,
  chequeId: string,
  input: UpdateChequeBankingStatusInput,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.issuedCheque.findFirst({
    where: { id: chequeId, tenantId: actor.tenantId },
  });

  if (!existing) {
    throw new NotFoundError('Issued Cheque');
  }
  if (
    actor.companyAccessScope === 'SELECTED_COMPANIES' &&
    !actor.allowedCompanyIds.includes(existing.companyId)
  ) {
    throw new ForbiddenError('You do not have access to this cheque.');
  }
  if (existing.businessStatus !== 'ISSUED') {
    throw new ValidationError('Banking status can only be updated on ISSUED cheques.');
  }
  if (
    input.expectedVersion !== undefined &&
    existing.version !== input.expectedVersion
  ) {
    throw new ConflictError('Cheque version mismatch; please refresh.', 'VERSION_CONFLICT');
  }

  const nextStatus: ChequeBankingStatus = input.bankingStatus;
  if (!isValidBankingStatusTransition(existing.bankingStatus, nextStatus)) {
    throw new ValidationError(
      `Invalid banking status transition from ${existing.bankingStatus} to ${nextStatus}.`
    );
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.issuedCheque.update({
      where: { id: existing.id },
      data: {
        bankingStatus: nextStatus,
        clearedAt: nextStatus === 'CLEARED' ? now : existing.clearedAt,
        bouncedAt: nextStatus === 'BOUNCED' ? now : existing.bouncedAt,
        version: { increment: 1 },
        updatedBy: actor.id,
      },
      include: CHEQUE_INCLUDE,
    });

    await tx.issuedChequeStatusHistory.create({
      data: {
        tenantId: actor.tenantId,
        issuedChequeId: existing.id,
        statusCategory: 'BANKING',
        previousStatus: existing.bankingStatus,
        newStatus: nextStatus,
        reason: input.reason ?? null,
        changedBy: actor.id,
        deviceId: actor.deviceId,
      },
    });

    // Post ledger debit atomically only once the issued cheque clears the bank
    if (nextStatus === 'CLEARED') {
      await postLedgerEntryInTx(tx, {
        tenantId: actor.tenantId,
        companyId: existing.companyId,
        bankAccountId: existing.bankAccountId,
        transactionDate: now,
        transactionType: 'CHEQUE_PAYMENT',
        referenceNumber: existing.chequeNumber,
        description: `Cleared cheque #${existing.chequeNumber} to ${existing.payeeName}`,
        debitAmount: existing.amount.toFixed(2),
        creditAmount: '0.00',
        issuedChequeId: existing.id,
        idempotencyKey: `cheque-clear:${existing.id}`,
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
        action: 'CHEQUE_STATUS_CHANGED',
        entityType: 'IssuedCheque',
        entityId: existing.id,
        previousValues: { bankingStatus: existing.bankingStatus },
        newValues: { bankingStatus: nextStatus, reason: input.reason ?? null },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return row;
  });

  return mapIssuedChequeDto(updated);
}

export async function recordChequePrintJob(
  actor: AuthenticatedTenantUser,
  chequeId: string,
  input: RecordChequePrintInput,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.issuedCheque.findFirst({
    where: { id: chequeId, tenantId: actor.tenantId },
  });

  if (!existing) {
    throw new NotFoundError('Issued Cheque');
  }
  if (
    actor.companyAccessScope === 'SELECTED_COMPANIES' &&
    !actor.allowedCompanyIds.includes(existing.companyId)
  ) {
    throw new ForbiddenError('You do not have access to this cheque.');
  }
  if (existing.businessStatus === 'CANCELLED') {
    throw new ValidationError('Cancelled cheques cannot be printed.');
  }

  const nextPrintingStatus = input.status === 'SUCCESS' ? 'PRINTED' : 'PRINT_FAILED';
  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    await tx.chequePrintJob.create({
      data: {
        tenantId: actor.tenantId,
        issuedChequeId: existing.id,
        templateId: input.templateId ?? existing.templateId ?? null,
        calibrationProfileId: input.calibrationProfileId ?? null,
        jobType: input.jobType,
        status: input.status,
        printerName: input.printerName ?? null,
        paperSize: input.paperSize ?? null,
        scalePercent:
          input.scalePercent !== undefined
            ? new Prisma.Decimal(input.scalePercent.toFixed(2))
            : null,
        errorMessage: input.errorMessage ?? null,
        printedBy: actor.id,
        deviceId: actor.deviceId,
      },
    });

    // Note: printing NEVER changes bankingStatus to CLEARED (Rule 20)
    const row = await tx.issuedCheque.update({
      where: { id: existing.id },
      data: {
        printingStatus: nextPrintingStatus,
        printCount: input.status === 'SUCCESS' ? { increment: 1 } : undefined,
        lastPrintedAt: input.status === 'SUCCESS' ? now : existing.lastPrintedAt,
        version: { increment: 1 },
        updatedBy: actor.id,
      },
      include: CHEQUE_INCLUDE,
    });

    await tx.issuedChequeStatusHistory.create({
      data: {
        tenantId: actor.tenantId,
        issuedChequeId: existing.id,
        statusCategory: 'PRINTING',
        previousStatus: existing.printingStatus,
        newStatus: nextPrintingStatus,
        reason: `${input.jobType} (${input.status})`,
        changedBy: actor.id,
        deviceId: actor.deviceId,
      },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        companyId: existing.companyId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'CHEQUE_PRINTED',
        entityType: 'IssuedCheque',
        entityId: existing.id,
        previousValues: { printingStatus: existing.printingStatus, printCount: existing.printCount },
        newValues: { printingStatus: nextPrintingStatus, jobType: input.jobType, status: input.status },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return row;
  });

  return mapIssuedChequeDto(updated);
}
