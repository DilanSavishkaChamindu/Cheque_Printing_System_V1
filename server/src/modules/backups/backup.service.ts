import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  backupFileSchema,
  calculateLedgerBalance,
  type AuthenticatedTenantUser,
  type BackupFilePayload,
} from '@cheque-saas/shared';
import { getPrisma } from '../../config/prisma.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../core/errors.js';
import { recordSecurityEvent, recordTenantAudit } from '../audit-logs/audit.service.js';
import type { TenantActorMeta } from '../companies/company.service.js';

export const SUPPORTED_BACKUP_SCHEMA_VERSION = '1.0.0';

export function validateBackupFinancialConsistency(payload: BackupFilePayload): string[] {
  const errors: string[] = [];
  const companyIds = new Set(payload.data.companies.map((c) => String(c.id ?? '')));
  const accountById = new Map<string, Record<string, unknown>>();

  for (const acc of payload.data.bankAccounts) {
    const id = String(acc.id ?? '');
    const companyId = String(acc.companyId ?? '');
    if (companyIds.size > 0 && !companyIds.has(companyId)) {
      errors.push(`Bank account ${id} references missing company ${companyId}.`);
    }
    accountById.set(id, acc);
  }

  for (const [accountId, acc] of accountById.entries()) {
    const opening = String(acc.openingBalance ?? '0.00');
    const expectedBalance = String(acc.currentBookBalance ?? '0.00');
    const txRows = payload.data.bankTransactions
      .filter(
        (tx) =>
          String(tx.bankAccountId ?? '') === accountId &&
          String(tx.transactionType ?? '') !== 'OPENING_BALANCE'
      )
      .map((tx) => ({
        debitAmount: String(tx.debitAmount ?? '0.00'),
        creditAmount: String(tx.creditAmount ?? '0.00'),
      }));

    try {
      const computed = calculateLedgerBalance(opening, txRows);
      if (computed !== expectedBalance) {
        errors.push(
          `Financial ledger mismatch on bank account ${accountId}: cached ${expectedBalance} != computed ${computed}.`
        );
      }
    } catch (err) {
      errors.push(
        `Invalid numeric values in ledger for bank account ${accountId}: ${
          err instanceof Error ? err.message : 'unknown error'
        }`
      );
    }
  }

  return errors;
}

export async function exportTenantBackup(
  actor: AuthenticatedTenantUser,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const job = await prisma.backupJob.create({
    data: {
      tenantId: actor.tenantId,
      userId: actor.id,
      backupScope: 'TENANT_EXPORT',
      format: 'JSON',
      schemaVersion: SUPPORTED_BACKUP_SCHEMA_VERSION,
      status: 'PROCESSING',
    },
  });

  try {
    const [
      tenant,
      companies,
      users,
      roles,
      banks,
      bankBranches,
      bankAccounts,
      chequeBooks,
      issuedCheques,
      receivedCheques,
      bankTransactions,
      chequeTemplates,
    ] = await Promise.all([
      prisma.tenant.findUniqueOrThrow({
        where: { id: actor.tenantId },
        include: { settings: true },
      }),
      prisma.company.findMany({ where: { tenantId: actor.tenantId } }),
      prisma.user.findMany({
        where: { tenantId: actor.tenantId },
        // Explicitly omit passwordHash, sessions, and reset tokens
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          username: true,
          mobileNumber: true,
          isClientAdmin: true,
          status: true,
          companyAccessScope: true,
          createdAt: true,
        },
      }),
      prisma.role.findMany({
        where: { tenantId: actor.tenantId },
        include: { rolePermissions: true },
      }),
      prisma.bank.findMany({ where: { tenantId: actor.tenantId } }),
      prisma.bankBranch.findMany({ where: { tenantId: actor.tenantId } }),
      prisma.bankAccount.findMany({ where: { tenantId: actor.tenantId } }),
      prisma.chequeBook.findMany({ where: { tenantId: actor.tenantId } }),
      prisma.issuedCheque.findMany({
        where: { tenantId: actor.tenantId },
        include: { statusHistory: true },
      }),
      prisma.receivedCheque.findMany({
        where: { tenantId: actor.tenantId },
        include: { statusHistory: true },
      }),
      prisma.bankAccountTransaction.findMany({
        where: { tenantId: actor.tenantId },
        orderBy: [{ bankAccountId: 'asc' }, { sequenceNumber: 'asc' }],
      }),
      prisma.chequeTemplate.findMany({
        where: { tenantId: actor.tenantId },
        include: { fields: true, calibrationProfiles: true },
      }),
    ]);

    const payloadBody = {
      schemaVersion: SUPPORTED_BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      backupScope: 'TENANT_EXPORT' as const,
      tenant: {
        id: tenant.id,
        tenantCode: tenant.tenantCode,
        organizationName: tenant.organizationName,
        country: tenant.country,
        settings: tenant.settings,
      },
      data: {
        companies,
        users,
        roles,
        banks,
        bankBranches,
        bankAccounts: bankAccounts.map((a) => ({
          ...a,
          openingBalance: a.openingBalance.toFixed(2),
          currentBookBalance: a.currentBookBalance.toFixed(2),
        })),
        chequeBooks,
        issuedCheques: issuedCheques.map((c) => ({
          ...c,
          amount: c.amount.toFixed(2),
        })),
        receivedCheques: receivedCheques.map((rc) => ({
          ...rc,
          amount: rc.amount.toFixed(2),
        })),
        bankTransactions: bankTransactions.map((tx) => ({
          ...tx,
          debitAmount: tx.debitAmount.toFixed(2),
          creditAmount: tx.creditAmount.toFixed(2),
          balanceAfterTransaction: tx.balanceAfterTransaction.toFixed(2),
          sequenceNumber: tx.sequenceNumber.toString(),
        })),
        chequeTemplates,
      },
    };

    const jsonString = JSON.stringify(payloadBody);
    const checksum = crypto.createHash('sha256').update(jsonString).digest('hex');
    const recordCount =
      companies.length +
      users.length +
      banks.length +
      bankAccounts.length +
      chequeBooks.length +
      issuedCheques.length +
      receivedCheques.length +
      bankTransactions.length +
      chequeTemplates.length;

    await prisma.backupJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        recordCount,
        checksum,
        fileSizeBytes: Buffer.byteLength(jsonString, 'utf8'),
        completedAt: new Date(),
      },
    });

    await recordTenantAudit({
      tenantId: actor.tenantId,
      userId: actor.id,
      deviceId: actor.deviceId,
      actorType: 'TENANT_USER',
      action: 'BACKUP_CREATED',
      entityType: 'BackupJob',
      entityId: job.id,
      newValues: { recordCount, checksum, schemaVersion: SUPPORTED_BACKUP_SCHEMA_VERSION },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return {
      jobId: job.id,
      backup: {
        ...payloadBody,
        checksum,
      },
    };
  } catch (error) {
    await prisma.backupJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Backup export failed',
      },
    });
    throw error;
  }
}

export async function previewTenantRestore(
  actor: AuthenticatedTenantUser,
  rawPayload: unknown,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const parsed = backupFileSchema.safeParse(rawPayload);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid backup JSON format.',
      parsed.error.issues.map((i) => ({
        field: i.path.join('.'),
        code: 'INVALID_BACKUP_FORMAT',
        message: i.message,
      }))
    );
  }

  const backup = parsed.data;

  // Enforce strict tenant ownership — prevent cross-tenant restore!
  if (
    backup.tenant.id !== actor.tenantId ||
    backup.tenant.tenantCode !== actor.tenant.tenantCode
  ) {
    await recordSecurityEvent({
      tenantId: actor.tenantId,
      userId: actor.id,
      actorType: 'TENANT_USER',
      eventType: 'CROSS_TENANT_RESTORE_ATTEMPT',
      severity: 'HIGH',
      description: `Attempted to restore backup belonging to tenant ${backup.tenant.tenantCode} (${backup.tenant.id}).`,
      ipAddress: meta.ipAddress,
      requestPath: '/api/v1/backups/restore/preview',
    });
    throw new ForbiddenError(
      'Backup belongs to a different tenant organization and cannot be restored here.'
    );
  }

  const validationErrors: string[] = [];
  if (backup.schemaVersion !== SUPPORTED_BACKUP_SCHEMA_VERSION) {
    validationErrors.push(
      `Unsupported schema version '${backup.schemaVersion}' (expected '${SUPPORTED_BACKUP_SCHEMA_VERSION}').`
    );
  }

  validationErrors.push(...validateBackupFinancialConsistency(backup));

  // Detect duplicate existing records in target tenant
  const companyIds = backup.data.companies.map((c) => String(c.id ?? '')).filter(Boolean);
  const bankAccountIds = backup.data.bankAccounts.map((a) => String(a.id ?? '')).filter(Boolean);

  const [existingCompanies, existingAccounts] = await Promise.all([
    companyIds.length
      ? prisma.company.findMany({
          where: { tenantId: actor.tenantId, id: { in: companyIds } },
          select: { id: true },
        })
      : [],
    bankAccountIds.length
      ? prisma.bankAccount.findMany({
          where: { tenantId: actor.tenantId, id: { in: bankAccountIds } },
          select: { id: true },
        })
      : [],
  ]);

  const previewSummary = {
    schemaVersion: backup.schemaVersion,
    exportedAt: backup.exportedAt,
    counts: {
      companies: backup.data.companies.length,
      banks: backup.data.banks.length,
      bankAccounts: backup.data.bankAccounts.length,
      chequeBooks: backup.data.chequeBooks.length,
      issuedCheques: backup.data.issuedCheques.length,
      receivedCheques: backup.data.receivedCheques.length,
      bankTransactions: backup.data.bankTransactions.length,
    },
    duplicatesDetected: {
      existingCompanies: existingCompanies.length,
      existingBankAccounts: existingAccounts.length,
    },
    payload: backup,
  };

  const restoreJob = await prisma.restoreJob.create({
    data: {
      tenantId: actor.tenantId,
      userId: actor.id,
      backupSchemaVersion: backup.schemaVersion,
      status: validationErrors.length > 0 ? 'REJECTED' : 'PREVIEWED',
      previewSummaryJson: previewSummary as unknown as Prisma.InputJsonValue,
      validationErrorsJson: validationErrors as unknown as Prisma.InputJsonValue,
      isConfirmed: false,
    },
  });

  return {
    restoreJobId: restoreJob.id,
    status: restoreJob.status,
    canConfirm: validationErrors.length === 0,
    validationErrors,
    counts: previewSummary.counts,
    duplicatesDetected: previewSummary.duplicatesDetected,
  };
}

export async function confirmTenantRestore(
  actor: AuthenticatedTenantUser,
  restoreJobId: string,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const job = await prisma.restoreJob.findFirst({
    where: { id: restoreJobId, tenantId: actor.tenantId },
  });

  if (!job) {
    throw new NotFoundError('Restore Job');
  }
  if (job.status !== 'PREVIEWED') {
    throw new ConflictError(`Restore job cannot be confirmed in status ${job.status}.`);
  }

  const summary = job.previewSummaryJson as unknown as {
    payload?: BackupFilePayload;
  } | null;
  if (!summary?.payload) {
    throw new ValidationError('Restore preview payload is missing.');
  }

  const backup = summary.payload;
  if (backup.tenant.id !== actor.tenantId) {
    throw new ForbiddenError('Tenant ownership verification failed during restore confirmation.');
  }

  let restoredCounts = {
    companiesRestored: 0,
    banksRestored: 0,
  };

  await prisma.$transaction(async (tx) => {
    for (const comp of backup.data.companies) {
      const id = String(comp.id ?? '');
      const companyCode = String(comp.companyCode ?? '');
      const companyName = String(comp.companyName ?? '');
      if (!id || !companyCode || !companyName) {
        continue;
      }
      const exists = await tx.company.findFirst({
        where: { tenantId: actor.tenantId, OR: [{ id }, { companyCode }] },
        select: { id: true },
      });
      if (!exists) {
        await tx.company.create({
          data: {
            id,
            tenantId: actor.tenantId,
            companyCode,
            companyName,
            isDefault: false,
            status: 'ACTIVE',
            createdBy: actor.id,
          },
        });
        restoredCounts.companiesRestored += 1;
      }
    }

    for (const bank of backup.data.banks) {
      const id = String(bank.id ?? '');
      const bankCode = String(bank.bankCode ?? '');
      const bankName = String(bank.bankName ?? '');
      const country = String(bank.country ?? 'Sri Lanka');
      if (!id || !bankCode || !bankName) {
        continue;
      }
      const exists = await tx.bank.findFirst({
        where: { ownerScope: actor.tenantId, OR: [{ id }, { bankCode }] },
        select: { id: true },
      });
      if (!exists) {
        await tx.bank.create({
          data: {
            id,
            ownerScope: actor.tenantId,
            tenantId: actor.tenantId,
            isSystemShared: false,
            bankCode,
            bankName,
            country,
            status: 'ACTIVE',
            createdBy: actor.id,
          },
        });
        restoredCounts.banksRestored += 1;
      }
    }

    await tx.restoreJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        isConfirmed: true,
        confirmedBy: actor.id,
        confirmedAt: new Date(),
        completedAt: new Date(),
      },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'RESTORE_EXECUTED',
        entityType: 'RestoreJob',
        entityId: job.id,
        newValues: restoredCounts,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );
  });

  return {
    restoreJobId: job.id,
    status: 'COMPLETED',
    restoredCounts,
  };
}

export async function listTenantBackupHistory(actor: AuthenticatedTenantUser) {
  const prisma = getPrisma();
  const [backups, restores] = await Promise.all([
    prisma.backupJob.findMany({
      where: { tenantId: actor.tenantId, backupScope: 'TENANT_EXPORT' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.restoreJob.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        backupSchemaVersion: true,
        status: true,
        isConfirmed: true,
        confirmedAt: true,
        completedAt: true,
        createdAt: true,
      },
    }),
  ]);

  return { backups, restores };
}
