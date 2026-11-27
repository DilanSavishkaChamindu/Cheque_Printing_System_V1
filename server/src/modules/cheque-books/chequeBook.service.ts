import { Prisma } from '@prisma/client';
import {
  FEATURE_KEYS,
  formatChequeNumber,
  type AuthenticatedTenantUser,
  type CreateChequeAllocationInput,
  type CreateChequeBookInput,
  type ListChequeBooksQueryInput,
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

export function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export async function listChequeBooks(
  actor: AuthenticatedTenantUser,
  query: ListChequeBooksQueryInput
) {
  const prisma = getPrisma();
  const companiesEnabled = actor.tenant.enabledFeatures.includes(FEATURE_KEYS.COMPANIES);

  let companyFilter: Prisma.ChequeBookWhereInput = {};
  if (query.companyId) {
    companyFilter = { companyId: resolveAuthorizedCompanyId(actor, query.companyId) };
  } else if (!companiesEnabled) {
    companyFilter = { companyId: resolveAuthorizedCompanyId(actor, null) };
  } else if (actor.companyAccessScope === 'SELECTED_COMPANIES') {
    companyFilter = { companyId: { in: actor.allowedCompanyIds } };
  }

  const where: Prisma.ChequeBookWhereInput = {
    tenantId: actor.tenantId,
    ...companyFilter,
    ...(query.bankAccountId ? { bankAccountId: query.bankAccountId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.search ? { bookName: { contains: query.search } } : {}),
  };

  const skip = (query.page - 1) * query.limit;
  const [rows, totalItems] = await Promise.all([
    prisma.chequeBook.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip,
      take: query.limit,
      include: {
        bankAccount: {
          select: {
            id: true,
            accountName: true,
            accountNumber: true,
            currency: true,
            bank: { select: { id: true, bankCode: true, bankName: true } },
          },
        },
        company: { select: { id: true, companyCode: true, companyName: true } },
        allocations: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            deviceId: true,
            rangeStart: true,
            rangeEnd: true,
            nextNumber: true,
            allocationType: true,
          },
        },
      },
    }),
    prisma.chequeBook.count({ where }),
  ]);

  return {
    items: rows.map((book) => ({
      ...book,
      issuedDate: book.issuedDate?.toISOString().slice(0, 10) ?? null,
      nextChequeNumberFormatted: formatChequeNumber(
        book.chequePrefix,
        book.nextAvailableNumber,
        book.numberPaddingLength
      ),
      bankAccount: {
        ...book.bankAccount,
        accountNumberMasked: maskAccountNumber(book.bankAccount.accountNumber),
      },
    })),
    totalItems,
    page: query.page,
    limit: query.limit,
  };
}

export async function createChequeBook(
  actor: AuthenticatedTenantUser,
  input: CreateChequeBookInput,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const bankAccount = await prisma.bankAccount.findFirst({
    where: { id: input.bankAccountId, tenantId: actor.tenantId },
  });

  if (!bankAccount) {
    throw new NotFoundError('Bank Account');
  }

  if (bankAccount.status !== 'ACTIVE') {
    throw new ValidationError('Cheque books can only be added to active bank accounts.');
  }

  if (
    actor.companyAccessScope === 'SELECTED_COMPANIES' &&
    !actor.allowedCompanyIds.includes(bankAccount.companyId)
  ) {
    throw new ForbiddenError('You do not have access to this bank account.');
  }

  const companyId = input.companyId
    ? resolveAuthorizedCompanyId(actor, input.companyId)
    : bankAccount.companyId;

  if (companyId !== bankAccount.companyId) {
    throw new ValidationError('Cheque book company must match the selected bank account company.');
  }

  // Prevent overlapping cheque number ranges on the same bank account
  const existingBooks = await prisma.chequeBook.findMany({
    where: {
      tenantId: actor.tenantId,
      bankAccountId: bankAccount.id,
      status: { in: ['ACTIVE', 'EXHAUSTED'] },
    },
    select: { id: true, bookName: true, startingNumber: true, endingNumber: true },
  });

  for (const existing of existingBooks) {
    if (
      rangesOverlap(
        input.startingNumber,
        input.endingNumber,
        existing.startingNumber,
        existing.endingNumber
      )
    ) {
      throw new ConflictError(
        `Cheque range ${input.startingNumber}-${input.endingNumber} overlaps existing book '${existing.bookName}' (${existing.startingNumber}-${existing.endingNumber}).`
      );
    }
  }

  const totalLeaves = input.endingNumber - input.startingNumber + 1;

  return prisma.$transaction(async (tx) => {
    const created = await tx.chequeBook.create({
      data: {
        tenantId: actor.tenantId,
        companyId,
        bankAccountId: bankAccount.id,
        bookName: input.bookName,
        chequePrefix: input.chequePrefix ?? null,
        startingNumber: input.startingNumber,
        endingNumber: input.endingNumber,
        nextAvailableNumber: input.startingNumber,
        numberPaddingLength: input.numberPaddingLength,
        totalLeaves,
        usedLeaves: 0,
        status: 'ACTIVE',
        issuedDate: input.issuedDate ? new Date(`${input.issuedDate}T00:00:00.000Z`) : null,
        notes: input.notes ?? null,
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
        action: 'CHEQUE_BOOK_CREATED',
        entityType: 'ChequeBook',
        entityId: created.id,
        newValues: {
          bookName: created.bookName,
          startingNumber: created.startingNumber,
          endingNumber: created.endingNumber,
          totalLeaves: created.totalLeaves,
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return created;
  });
}

export async function updateChequeBookStatus(
  actor: AuthenticatedTenantUser,
  chequeBookId: string,
  status: 'ACTIVE' | 'INACTIVE' | 'CANCELLED',
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.chequeBook.findFirst({
    where: { id: chequeBookId, tenantId: actor.tenantId },
  });

  if (!existing) {
    throw new NotFoundError('Cheque Book');
  }

  if (
    actor.companyAccessScope === 'SELECTED_COMPANIES' &&
    !actor.allowedCompanyIds.includes(existing.companyId)
  ) {
    throw new ForbiddenError('You do not have access to this cheque book.');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.chequeBook.update({
      where: { id: existing.id },
      data: { status, updatedBy: actor.id },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        companyId: existing.companyId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: `CHEQUE_BOOK_STATUS_${status}`,
        entityType: 'ChequeBook',
        entityId: existing.id,
        previousValues: { status: existing.status },
        newValues: { status },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return updated;
  });
}

export async function listChequeBookAllocations(
  actor: AuthenticatedTenantUser,
  chequeBookId: string
) {
  const prisma = getPrisma();
  const book = await prisma.chequeBook.findFirst({
    where: { id: chequeBookId, tenantId: actor.tenantId },
  });
  if (!book) {
    throw new NotFoundError('Cheque Book');
  }

  return prisma.chequeNumberAllocation.findMany({
    where: { tenantId: actor.tenantId, chequeBookId },
    orderBy: { rangeStart: 'asc' },
    include: {
      device: { select: { id: true, deviceName: true, status: true } },
      assignedUser: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
}

export async function allocateChequeRange(
  actor: AuthenticatedTenantUser,
  chequeBookId: string,
  input: CreateChequeAllocationInput,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const book = await tx.chequeBook.findFirst({
      where: { id: chequeBookId, tenantId: actor.tenantId },
    });

    if (!book) {
      throw new NotFoundError('Cheque Book');
    }

    if (book.status !== 'ACTIVE') {
      throw new ValidationError('Allocations can only be created from an active cheque book.');
    }

    if (
      actor.companyAccessScope === 'SELECTED_COMPANIES' &&
      !actor.allowedCompanyIds.includes(book.companyId)
    ) {
      throw new ForbiddenError('You do not have access to this cheque book.');
    }

    if (input.rangeStart < book.startingNumber || input.rangeEnd > book.endingNumber) {
      throw new ValidationError(
        `Requested range must fall within book range ${book.startingNumber}-${book.endingNumber}.`
      );
    }

    if (input.deviceId) {
      const device = await tx.registeredDevice.findFirst({
        where: { id: input.deviceId, tenantId: actor.tenantId, status: 'ACTIVE' },
      });
      if (!device) {
        throw new ValidationError('Target device must be approved and active before allocating offline cheque numbers.');
      }
    }

    // Check existing non-revoked allocations for overlap
    const existingAllocations = await tx.chequeNumberAllocation.findMany({
      where: {
        tenantId: actor.tenantId,
        chequeBookId: book.id,
        status: { in: ['ACTIVE', 'EXHAUSTED'] },
      },
      select: { id: true, rangeStart: true, rangeEnd: true },
    });

    for (const alloc of existingAllocations) {
      if (rangesOverlap(input.rangeStart, input.rangeEnd, alloc.rangeStart, alloc.rangeEnd)) {
        throw new ConflictError(
          `Requested range ${input.rangeStart}-${input.rangeEnd} overlaps an existing allocation (${alloc.rangeStart}-${alloc.rangeEnd}).`
        );
      }
    }

    // Check if any cheque inside this range has already been issued
    const existingCheque = await tx.issuedCheque.findFirst({
      where: {
        tenantId: actor.tenantId,
        bankAccountId: book.bankAccountId,
        chequeNumberNumeric: {
          gte: input.rangeStart,
          lte: input.rangeEnd,
        },
      },
      select: { chequeNumber: true },
    });

    if (existingCheque) {
      throw new ConflictError(
        `Cheque number ${existingCheque.chequeNumber} within this range has already been used.`
      );
    }

    const allocation = await tx.chequeNumberAllocation.create({
      data: {
        tenantId: actor.tenantId,
        companyId: book.companyId,
        bankAccountId: book.bankAccountId,
        chequeBookId: book.id,
        deviceId: input.deviceId ?? null,
        assignedUserId: input.assignedUserId ?? null,
        rangeStart: input.rangeStart,
        rangeEnd: input.rangeEnd,
        nextNumber: input.rangeStart,
        allocationType: input.allocationType,
        status: 'ACTIVE',
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdBy: actor.id,
      },
    });

    // Advance book cursor past allocated range if needed so online issuance does not collide
    if (book.nextAvailableNumber <= input.rangeEnd && book.nextAvailableNumber >= input.rangeStart) {
      const nextAfterRange = input.rangeEnd + 1;
      await tx.chequeBook.update({
        where: { id: book.id },
        data: {
          nextAvailableNumber: Math.min(nextAfterRange, book.endingNumber + 1),
          updatedBy: actor.id,
        },
      });
    }

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        companyId: book.companyId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'CHEQUE_RANGE_ALLOCATED',
        entityType: 'ChequeNumberAllocation',
        entityId: allocation.id,
        newValues: {
          chequeBookId: book.id,
          rangeStart: allocation.rangeStart,
          rangeEnd: allocation.rangeEnd,
          deviceId: allocation.deviceId,
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return allocation;
  });
}

export async function revokeChequeAllocation(
  actor: AuthenticatedTenantUser,
  allocationId: string,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.chequeNumberAllocation.findFirst({
    where: { id: allocationId, tenantId: actor.tenantId },
  });

  if (!existing) {
    throw new NotFoundError('Cheque Number Allocation');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.chequeNumberAllocation.update({
      where: { id: existing.id },
      data: { status: 'REVOKED' },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        companyId: existing.companyId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'CHEQUE_RANGE_REVOKED',
        entityType: 'ChequeNumberAllocation',
        entityId: existing.id,
        previousValues: { status: existing.status },
        newValues: { status: 'REVOKED' },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return updated;
  });
}
