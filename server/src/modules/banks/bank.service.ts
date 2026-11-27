import type { Prisma } from '@prisma/client';
import type {
  AuthenticatedTenantUser,
  CreateBankBranchInput,
  CreateBankInput,
  ListBankBranchesQueryInput,
  ListBanksQueryInput,
  UpdateBankBranchInput,
  UpdateBankInput,
} from '@cheque-saas/shared';
import { getPrisma } from '../../config/prisma.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../core/errors.js';
import { recordTenantAudit } from '../audit-logs/audit.service.js';
import type { TenantActorMeta } from '../companies/company.service.js';

export async function listVisibleBanks(
  tenantId: string,
  query: ListBanksQueryInput
) {
  const prisma = getPrisma();
  const where: Prisma.BankWhereInput = {
    OR: [{ isSystemShared: true }, { tenantId }],
    ...(query.status ? { status: query.status } : {}),
    ...(query.country ? { country: query.country } : {}),
    ...(query.search
      ? {
          AND: [
            {
              OR: [
                { bankCode: { contains: query.search } },
                { bankName: { contains: query.search } },
              ],
            },
          ],
        }
      : {}),
  };

  const skip = (query.page - 1) * query.limit;
  const [items, totalItems] = await Promise.all([
    prisma.bank.findMany({
      where,
      orderBy: [{ isSystemShared: 'desc' }, { bankName: 'asc' }],
      skip,
      take: query.limit,
      include: {
        _count: { select: { branches: true } },
      },
    }),
    prisma.bank.count({ where }),
  ]);

  return { items, totalItems, page: query.page, limit: query.limit };
}

export async function createTenantBank(
  actor: AuthenticatedTenantUser,
  input: CreateBankInput,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.bank.findUnique({
    where: {
      ownerScope_bankCode: {
        ownerScope: actor.tenantId,
        bankCode: input.bankCode,
      },
    },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictError(`Bank code '${input.bankCode}' already exists in your organization.`);
  }

  return prisma.$transaction(async (tx) => {
    const bank = await tx.bank.create({
      data: {
        ownerScope: actor.tenantId,
        tenantId: actor.tenantId,
        isSystemShared: false,
        bankCode: input.bankCode,
        bankName: input.bankName,
        country: input.country,
        status: 'ACTIVE',
        createdBy: actor.id,
      },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'BANK_CREATED',
        entityType: 'Bank',
        entityId: bank.id,
        newValues: bank,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return bank;
  });
}

export async function updateTenantBank(
  actor: AuthenticatedTenantUser,
  bankId: string,
  input: UpdateBankInput,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.bank.findFirst({
    where: {
      id: bankId,
      OR: [{ isSystemShared: true }, { tenantId: actor.tenantId }],
    },
  });

  if (!existing) {
    throw new NotFoundError('Bank');
  }

  if (existing.isSystemShared || existing.tenantId !== actor.tenantId) {
    throw new ForbiddenError(
      'Central system-shared bank references cannot be modified by an organization.'
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.bank.update({
      where: { id: existing.id },
      data: {
        ...(input.bankName !== undefined ? { bankName: input.bankName } : {}),
        ...(input.country !== undefined ? { country: input.country } : {}),
        updatedBy: actor.id,
      },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'BANK_UPDATED',
        entityType: 'Bank',
        entityId: updated.id,
        previousValues: existing,
        newValues: updated,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return updated;
  });
}

export async function updateTenantBankStatus(
  actor: AuthenticatedTenantUser,
  bankId: string,
  status: 'ACTIVE' | 'INACTIVE',
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.bank.findFirst({
    where: {
      id: bankId,
      OR: [{ isSystemShared: true }, { tenantId: actor.tenantId }],
    },
  });

  if (!existing) {
    throw new NotFoundError('Bank');
  }
  if (existing.isSystemShared || existing.tenantId !== actor.tenantId) {
    throw new ForbiddenError('Central system-shared bank references cannot be deactivated.');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.bank.update({
      where: { id: existing.id },
      data: { status, updatedBy: actor.id },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: status === 'ACTIVE' ? 'BANK_ACTIVATED' : 'BANK_DEACTIVATED',
        entityType: 'Bank',
        entityId: updated.id,
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

export async function listVisibleBranches(
  tenantId: string,
  query: ListBankBranchesQueryInput
) {
  const prisma = getPrisma();
  const where: Prisma.BankBranchWhereInput = {
    OR: [{ isSystemShared: true }, { tenantId }],
    ...(query.bankId ? { bankId: query.bankId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.city ? { city: { contains: query.city } } : {}),
    ...(query.search
      ? {
          AND: [
            {
              OR: [
                { branchCode: { contains: query.search } },
                { branchName: { contains: query.search } },
                { city: { contains: query.search } },
              ],
            },
          ],
        }
      : {}),
  };

  const skip = (query.page - 1) * query.limit;
  const [items, totalItems] = await Promise.all([
    prisma.bankBranch.findMany({
      where,
      orderBy: { branchName: 'asc' },
      skip,
      take: query.limit,
      include: {
        bank: {
          select: { id: true, bankCode: true, bankName: true },
        },
      },
    }),
    prisma.bankBranch.count({ where }),
  ]);

  return { items, totalItems, page: query.page, limit: query.limit };
}

export async function createTenantBranch(
  actor: AuthenticatedTenantUser,
  input: CreateBankBranchInput,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const bank = await prisma.bank.findFirst({
    where: {
      id: input.bankId,
      OR: [{ isSystemShared: true }, { tenantId: actor.tenantId }],
    },
  });

  if (!bank) {
    throw new NotFoundError('Bank');
  }

  const existing = await prisma.bankBranch.findUnique({
    where: {
      bankId_ownerScope_branchCode: {
        bankId: input.bankId,
        ownerScope: actor.tenantId,
        branchCode: input.branchCode,
      },
    },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictError(`Branch code '${input.branchCode}' already exists for this bank.`);
  }

  return prisma.$transaction(async (tx) => {
    const branch = await tx.bankBranch.create({
      data: {
        ownerScope: actor.tenantId,
        tenantId: actor.tenantId,
        bankId: input.bankId,
        isSystemShared: false,
        branchCode: input.branchCode,
        branchName: input.branchName,
        address: input.address ?? null,
        city: input.city ?? null,
        contactNumber: input.contactNumber ?? null,
        status: 'ACTIVE',
        createdBy: actor.id,
      },
      include: {
        bank: { select: { id: true, bankCode: true, bankName: true } },
      },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'BANK_BRANCH_CREATED',
        entityType: 'BankBranch',
        entityId: branch.id,
        newValues: branch,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return branch;
  });
}

export async function updateTenantBranch(
  actor: AuthenticatedTenantUser,
  branchId: string,
  input: UpdateBankBranchInput,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.bankBranch.findFirst({
    where: {
      id: branchId,
      OR: [{ isSystemShared: true }, { tenantId: actor.tenantId }],
    },
  });

  if (!existing) {
    throw new NotFoundError('BankBranch');
  }

  if (existing.isSystemShared || existing.tenantId !== actor.tenantId) {
    throw new ForbiddenError('Central system-shared bank branches cannot be modified.');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.bankBranch.update({
      where: { id: existing.id },
      data: {
        ...(input.branchName !== undefined ? { branchName: input.branchName } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.contactNumber !== undefined ? { contactNumber: input.contactNumber } : {}),
        updatedBy: actor.id,
      },
      include: {
        bank: { select: { id: true, bankCode: true, bankName: true } },
      },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'BANK_BRANCH_UPDATED',
        entityType: 'BankBranch',
        entityId: updated.id,
        previousValues: existing,
        newValues: updated,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return updated;
  });
}

export async function updateTenantBranchStatus(
  actor: AuthenticatedTenantUser,
  branchId: string,
  status: 'ACTIVE' | 'INACTIVE',
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.bankBranch.findFirst({
    where: {
      id: branchId,
      OR: [{ isSystemShared: true }, { tenantId: actor.tenantId }],
    },
  });

  if (!existing) {
    throw new NotFoundError('BankBranch');
  }
  if (existing.isSystemShared || existing.tenantId !== actor.tenantId) {
    throw new ForbiddenError('Central system-shared bank branches cannot be deactivated.');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.bankBranch.update({
      where: { id: existing.id },
      data: { status, updatedBy: actor.id },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: status === 'ACTIVE' ? 'BANK_BRANCH_ACTIVATED' : 'BANK_BRANCH_DEACTIVATED',
        entityType: 'BankBranch',
        entityId: updated.id,
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
