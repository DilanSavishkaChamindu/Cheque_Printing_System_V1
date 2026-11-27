import { Prisma } from '@prisma/client';
import {
  createIssuedChequeSchema,
  FEATURE_KEYS,
  formatChequeNumber,
  PERMISSION_CODES,
  verifyAmountInWordsMatch,
  type AuthenticatedTenantUser,
  type ListSyncConflictsQueryInput,
  type RequestOfflineRangeInput,
  type ResolveSyncConflictInput,
  type SyncPushBatchInput,
  type SyncPushOperationInput,
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
import { recordSecurityEvent, recordTenantAudit } from '../audit-logs/audit.service.js';
import { allocateChequeRange, rangesOverlap } from '../cheque-books/chequeBook.service.js';
import type { TenantActorMeta } from '../companies/company.service.js';

export async function listRegisteredDevices(actor: AuthenticatedTenantUser) {
  const prisma = getPrisma();
  const canSeeAll =
    actor.isClientAdmin || actor.permissions.includes(PERMISSION_CODES.DEVICE_MANAGE);

  return prisma.registeredDevice.findMany({
    where: {
      tenantId: actor.tenantId,
      ...(canSeeAll ? {} : { userId: actor.id }),
    },
    orderBy: [{ createdAt: 'desc' }],
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, email: true, username: true },
      },
      _count: {
        select: { chequeAllocations: true, syncOperations: true },
      },
    },
  });
}

export async function approveRegisteredDevice(
  actor: AuthenticatedTenantUser,
  deviceId: string,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.registeredDevice.findFirst({
    where: { id: deviceId, tenantId: actor.tenantId },
  });

  if (!existing) {
    throw new NotFoundError('Registered Device');
  }
  if (existing.status === 'REVOKED') {
    throw new ConflictError('Revoked devices cannot be re-approved.');
  }

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const updated = await tx.registeredDevice.update({
      where: { id: existing.id },
      data: {
        status: 'ACTIVE',
        approvedBy: actor.id,
        approvedAt: now,
      },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'DEVICE_APPROVED',
        entityType: 'RegisteredDevice',
        entityId: updated.id,
        previousValues: { status: existing.status },
        newValues: { status: 'ACTIVE' },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return updated;
  });
}

export async function revokeRegisteredDevice(
  actor: AuthenticatedTenantUser,
  deviceId: string,
  reason: string,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.registeredDevice.findFirst({
    where: { id: deviceId, tenantId: actor.tenantId },
  });

  if (!existing) {
    throw new NotFoundError('Registered Device');
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const dev = await tx.registeredDevice.update({
      where: { id: existing.id },
      data: {
        status: 'REVOKED',
        revokedBy: actor.id,
        revokedAt: now,
        revocationReason: reason,
      },
    });

    // Revoke active sessions and unused offline cheque allocations tied to this device
    await tx.userSession.updateMany({
      where: { tenantId: actor.tenantId, deviceId: dev.id, revokedAt: null },
      data: { revokedAt: now, revokedReason: `DEVICE_REVOKED: ${reason}` },
    });

    await tx.chequeNumberAllocation.updateMany({
      where: { tenantId: actor.tenantId, deviceId: dev.id, status: 'ACTIVE' },
      data: { status: 'REVOKED' },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'DEVICE_REVOKED',
        entityType: 'RegisteredDevice',
        entityId: dev.id,
        previousValues: { status: existing.status },
        newValues: { status: 'REVOKED', reason },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return dev;
  });

  await recordSecurityEvent({
    tenantId: actor.tenantId,
    userId: actor.id,
    actorType: 'TENANT_USER',
    eventType: 'OFFLINE_DEVICE_REVOKED',
    severity: 'MEDIUM',
    description: `Device '${existing.deviceName}' revoked: ${reason}`,
    metadata: { revokedDeviceId: existing.id },
    ipAddress: meta.ipAddress,
  });

  return updated;
}

export async function requestOfflineAllocationForDevice(
  actor: AuthenticatedTenantUser,
  input: RequestOfflineRangeInput,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const [device, book, existingAllocations] = await Promise.all([
    prisma.registeredDevice.findFirst({
      where: { id: input.deviceId, tenantId: actor.tenantId },
    }),
    prisma.chequeBook.findFirst({
      where: { id: input.chequeBookId, tenantId: actor.tenantId, status: 'ACTIVE' },
    }),
    prisma.chequeNumberAllocation.findMany({
      where: {
        tenantId: actor.tenantId,
        chequeBookId: input.chequeBookId,
        status: { in: ['ACTIVE', 'EXHAUSTED'] },
      },
      orderBy: { rangeStart: 'asc' },
    }),
  ]);

  if (!device || device.status !== 'ACTIVE') {
    throw new ForbiddenError('An active approved device is required to allocate offline cheque numbers.');
  }
  if (!book) {
    throw new NotFoundError('Active Cheque Book');
  }

  let candidateStart = Math.max(book.startingNumber, book.nextAvailableNumber);
  // Skip any existing allocated intervals
  for (const alloc of existingAllocations) {
    if (rangesOverlap(candidateStart, candidateStart + input.leafCount - 1, alloc.rangeStart, alloc.rangeEnd)) {
      candidateStart = alloc.rangeEnd + 1;
    }
  }

  const candidateEnd = candidateStart + input.leafCount - 1;
  if (candidateEnd > book.endingNumber) {
    throw new ConflictError(
      `Cheque book '${book.bookName}' does not have ${input.leafCount} contiguous unallocated leaves remaining.`
    );
  }

  return allocateChequeRange(
    actor,
    book.id,
    {
      deviceId: device.id,
      assignedUserId: device.userId,
      rangeStart: candidateStart,
      rangeEnd: candidateEnd,
      allocationType: 'OFFLINE_RANGE',
      expiresAt: null,
    },
    meta
  );
}

export async function getOfflineSyncBootstrap(
  actor: AuthenticatedTenantUser,
  deviceIdInput?: string
) {
  const prisma = getPrisma();
  const resolvedDeviceId = deviceIdInput ?? actor.deviceId;
  if (!resolvedDeviceId) {
    throw new ValidationError('A registered device ID is required for offline bootstrap.');
  }

  const [session, device] = await Promise.all([
    prisma.userSession.findUnique({ where: { id: actor.sessionId } }),
    prisma.registeredDevice.findFirst({
      where: { id: resolvedDeviceId, tenantId: actor.tenantId },
    }),
  ]);

  if (!device) {
    throw new NotFoundError('Registered Device');
  }
  if (device.status !== 'ACTIVE') {
    throw new ForbiddenError(
      `Offline synchronization is unavailable while device status is ${device.status}.`,
      'DEVICE_NOT_ACTIVE'
    );
  }

  const companiesEnabled = actor.tenant.enabledFeatures.includes(FEATURE_KEYS.COMPANIES);
  const companyFilter = !companiesEnabled
    ? { companyId: resolveAuthorizedCompanyId(actor, null) }
    : actor.companyAccessScope === 'SELECTED_COMPANIES'
      ? { companyId: { in: actor.allowedCompanyIds } }
      : {};

  const [bankAccounts, templates, allocations] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { tenantId: actor.tenantId, status: 'ACTIVE', ...companyFilter },
      include: { bank: { select: { id: true, bankName: true } } },
    }),
    prisma.chequeTemplate.findMany({
      where: { tenantId: actor.tenantId, status: 'ACTIVE' },
      include: { fields: true },
    }),
    prisma.chequeNumberAllocation.findMany({
      where: {
        tenantId: actor.tenantId,
        deviceId: device.id,
        status: 'ACTIVE',
      },
      include: {
        chequeBook: {
          select: {
            id: true,
            chequePrefix: true,
            numberPaddingLength: true,
          },
        },
      },
    }),
  ]);

  return {
    device: {
      id: device.id,
      deviceName: device.deviceName,
      status: device.status,
    },
    offlineExpiresAt:
      session?.offlineExpiresAt?.toISOString() ??
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    companies: actor.companies,
    bankAccounts: bankAccounts.map((acc) => ({
      id: acc.id,
      tenantId: acc.tenantId,
      companyId: acc.companyId,
      bankId: acc.bankId,
      bankName: acc.bank.bankName,
      accountName: acc.accountName,
      accountNumberMasked: maskAccountNumber(acc.accountNumber),
      currency: acc.currency,
      status: acc.status,
    })),
    templates: templates.map((t) => ({
      id: t.id,
      tenantId: t.tenantId,
      bankId: t.bankId,
      bankAccountId: t.bankAccountId,
      templateName: t.templateName,
      paperWidthMm: Number(t.paperWidthMm.toString()),
      paperHeightMm: Number(t.paperHeightMm.toString()),
      orientation: t.orientation,
      dateFormat: t.dateFormat,
      fieldsJson: JSON.stringify(t.fields),
      updatedAt: t.updatedAt.toISOString(),
    })),
    allocations: allocations.map((a) => ({
      id: a.id,
      tenantId: a.tenantId,
      companyId: a.companyId,
      bankAccountId: a.bankAccountId,
      chequeBookId: a.chequeBookId,
      rangeStart: a.rangeStart,
      rangeEnd: a.rangeEnd,
      nextNumber: a.nextNumber,
      numberPaddingLength: a.chequeBook.numberPaddingLength,
      chequePrefix: a.chequeBook.chequePrefix,
      status: a.status,
    })),
  };
}

export interface SyncOperationResultDto {
  operationId: string;
  idempotencyKey: string;
  status: 'SYNCHRONIZED' | 'CONFLICT' | 'FAILED' | 'REJECTED';
  deduplicated?: boolean;
  conflictId?: string;
  message: string;
  serverRecord?: unknown;
}

async function processSingleSyncOperation(
  actor: AuthenticatedTenantUser,
  deviceId: string,
  op: SyncPushOperationInput,
  meta: TenantActorMeta
): Promise<SyncOperationResultDto> {
  const prisma = getPrisma();

  // Step 1: Idempotency check
  const existingOp = await prisma.syncOperation.findUnique({
    where: {
      tenantId_idempotencyKey: {
        tenantId: actor.tenantId,
        idempotencyKey: op.idempotencyKey,
      },
    },
  });

  if (existingOp && existingOp.status === 'SYNCHRONIZED') {
    return {
      operationId: op.operationId,
      idempotencyKey: op.idempotencyKey,
      status: 'SYNCHRONIZED',
      deduplicated: true,
      message: 'Operation already synchronized previously.',
    };
  }

  // Record SyncOperation row (or reuse existing non-synchronized row)
  const syncOpRecord =
    existingOp ??
    (await prisma.syncOperation.create({
      data: {
        tenantId: actor.tenantId,
        userId: actor.id,
        deviceId,
        operationId: op.operationId,
        idempotencyKey: op.idempotencyKey,
        entityType: op.entityType,
        recordId: op.recordId,
        operationType: op.operationType,
        payloadJson: op.payload as Prisma.InputJsonValue,
        clientVersion: op.clientVersion ?? null,
        status: 'PROCESSING',
        clientCreatedAt: new Date(op.clientCreatedAt),
      },
    }));

  // Step 2: Re-verify feature entitlement & permission (may have changed while offline!)
  const requiredFeature =
    op.operationType === 'CREATE'
      ? FEATURE_KEYS.NEW_CHEQUE
      : FEATURE_KEYS.CHEQUE_HISTORY;
  const requiredPermission =
    op.operationType === 'CREATE'
      ? PERMISSION_CODES.CHEQUE_CREATE
      : PERMISSION_CODES.CHEQUE_EDIT;

  if (!actor.tenant.enabledFeatures.includes(requiredFeature)) {
    const conflict = await prisma.$transaction(async (tx) => {
      await tx.syncOperation.update({
        where: { id: syncOpRecord.id },
        data: {
          status: 'CONFLICT',
          retryCount: { increment: 1 },
          lastError: `Feature '${requiredFeature}' is disabled for this organization.`,
        },
      });
      const c = await tx.syncConflict.create({
        data: {
          tenantId: actor.tenantId,
          syncOperationId: syncOpRecord.id,
          entityType: op.entityType,
          recordId: op.recordId,
          conflictType: 'FEATURE_DISABLED',
          localPayloadJson: op.payload as Prisma.InputJsonValue,
          serverSnapshotJson: {
            enabledFeatures: actor.tenant.enabledFeatures,
            requiredFeature,
          },
          resolutionStatus: 'OPEN',
        },
      });
      await tx.syncLog.create({
        data: {
          tenantId: actor.tenantId,
          userId: actor.id,
          deviceId,
          syncOperationId: syncOpRecord.id,
          eventType: 'SYNC_CONFLICT_FEATURE_DISABLED',
          status: 'CONFLICT',
          message: `Blocked sync because feature '${requiredFeature}' was disabled.`,
        },
      });
      return c;
    });

    return {
      operationId: op.operationId,
      idempotencyKey: op.idempotencyKey,
      status: 'CONFLICT',
      conflictId: conflict.id,
      message: `Feature '${requiredFeature}' is disabled; operation saved for conflict review.`,
    };
  }

  if (!actor.isClientAdmin && !actor.permissions.includes(requiredPermission)) {
    const conflict = await prisma.$transaction(async (tx) => {
      await tx.syncOperation.update({
        where: { id: syncOpRecord.id },
        data: {
          status: 'CONFLICT',
          retryCount: { increment: 1 },
          lastError: `Missing permission '${requiredPermission}'.`,
        },
      });
      return tx.syncConflict.create({
        data: {
          tenantId: actor.tenantId,
          syncOperationId: syncOpRecord.id,
          entityType: op.entityType,
          recordId: op.recordId,
          conflictType: 'PERMISSION_REVOKED',
          localPayloadJson: op.payload as Prisma.InputJsonValue,
          serverSnapshotJson: {
            userPermissions: actor.permissions,
            requiredPermission,
          },
          resolutionStatus: 'OPEN',
        },
      });
    });

    return {
      operationId: op.operationId,
      idempotencyKey: op.idempotencyKey,
      status: 'CONFLICT',
      conflictId: conflict.id,
      message: `User permission '${requiredPermission}' was revoked while offline.`,
    };
  }

  // Step 3: Process CREATE ISSUED_CHEQUE transactionally
  if (op.operationType === 'CREATE') {
    const parsed = createIssuedChequeSchema.safeParse(op.payload);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join('; ');
      await prisma.syncOperation.update({
        where: { id: syncOpRecord.id },
        data: { status: 'REJECTED', retryCount: { increment: 1 }, lastError: msg },
      });
      return {
        operationId: op.operationId,
        idempotencyKey: op.idempotencyKey,
        status: 'REJECTED',
        message: `Payload validation failed: ${msg}`,
      };
    }

    const data = parsed.data;
    if (!verifyAmountInWordsMatch(data.amount, data.currency, data.amountInWords, 'en')) {
      const msg = 'Amount in words does not match numeric amount.';
      await prisma.syncOperation.update({
        where: { id: syncOpRecord.id },
        data: { status: 'REJECTED', retryCount: { increment: 1 }, lastError: msg },
      });
      return {
        operationId: op.operationId,
        idempotencyKey: op.idempotencyKey,
        status: 'REJECTED',
        message: msg,
      };
    }

    const companyId = resolveAuthorizedCompanyId(actor, data.companyId);

    const outcome = await prisma.$transaction(async (tx) => {
      const bankAccount = await tx.bankAccount.findFirst({
        where: { id: data.bankAccountId, tenantId: actor.tenantId, companyId },
      });
      if (!bankAccount) {
        throw new NotFoundError('Bank Account');
      }

      const chequeBook = await tx.chequeBook.findFirst({
        where: {
          id: data.chequeBookId,
          tenantId: actor.tenantId,
          bankAccountId: bankAccount.id,
        },
      });
      if (!chequeBook) {
        throw new NotFoundError('Cheque Book');
      }

      const chequeNumber = data.chequeNumber ?? formatChequeNumber(chequeBook.chequePrefix, chequeBook.nextAvailableNumber, chequeBook.numberPaddingLength);

      // Check collision on server -> preserve both records in SyncConflict!
      const collision = await tx.issuedCheque.findUnique({
        where: {
          tenantId_bankAccountId_chequeNumber: {
            tenantId: actor.tenantId,
            bankAccountId: bankAccount.id,
            chequeNumber,
          },
        },
      });

      if (collision) {
        await tx.syncOperation.update({
          where: { id: syncOpRecord.id },
          data: {
            status: 'CONFLICT',
            retryCount: { increment: 1 },
            lastError: `Cheque number ${chequeNumber} already exists on server.`,
          },
        });
        const conflict = await tx.syncConflict.create({
          data: {
            tenantId: actor.tenantId,
            syncOperationId: syncOpRecord.id,
            entityType: op.entityType,
            recordId: op.recordId,
            conflictType: 'CHEQUE_NUMBER_COLLISION',
            localPayloadJson: op.payload as Prisma.InputJsonValue,
            serverSnapshotJson: {
              id: collision.id,
              chequeNumber: collision.chequeNumber,
              payeeName: collision.payeeName,
              amount: collision.amount.toFixed(2),
              chequeDate: collision.chequeDate.toISOString().slice(0, 10),
              version: collision.version,
            },
            resolutionStatus: 'OPEN',
          },
        });
        return { kind: 'CONFLICT' as const, conflictId: conflict.id, chequeNumber };
      }

      const createdCheque = await tx.issuedCheque.create({
        data: {
          id: op.recordId,
          tenantId: actor.tenantId,
          companyId,
          bankId: bankAccount.bankId,
          bankAccountId: bankAccount.id,
          chequeBookId: chequeBook.id,
          templateId: data.templateId ?? null,
          chequeNumber,
          chequeDate: new Date(`${data.chequeDate}T00:00:00.000Z`),
          dateFormat: data.dateFormat,
          payeeName: data.payeeName,
          amount: new Prisma.Decimal(data.amount),
          currency: data.currency,
          paymentType: data.paymentType,
          cashRecipient: data.paymentType === 'CASH' ? (data.cashRecipient ?? null) : null,
          amountInWords: data.amountInWords,
          description: data.description ?? null,
          businessStatus: data.issueImmediately ? 'ISSUED' : 'DRAFT',
          printingStatus: 'NOT_PRINTED',
          bankingStatus: 'PENDING',
          isOfflineCreated: true,
          originDeviceId: deviceId,
          idempotencyKey: op.idempotencyKey,
          createdBy: actor.id,
        },
      });

      await tx.issuedChequeStatusHistory.create({
        data: {
          tenantId: actor.tenantId,
          issuedChequeId: createdCheque.id,
          statusCategory: 'BUSINESS',
          previousStatus: null,
          newStatus: createdCheque.businessStatus,
          reason: 'Synchronized from offline device queue',
          changedBy: actor.id,
          deviceId,
        },
      });

      await tx.syncOperation.update({
        where: { id: syncOpRecord.id },
        data: {
          status: 'SYNCHRONIZED',
          processedAt: new Date(),
          lastError: null,
        },
      });

      await tx.syncLog.create({
        data: {
          tenantId: actor.tenantId,
          userId: actor.id,
          deviceId,
          syncOperationId: syncOpRecord.id,
          eventType: 'OFFLINE_CHEQUE_SYNCHRONIZED',
          status: 'SYNCHRONIZED',
          message: `Synchronized offline cheque #${createdCheque.chequeNumber}`,
        },
      });

      await recordTenantAudit(
        {
          tenantId: actor.tenantId,
          companyId,
          userId: actor.id,
          deviceId,
          actorType: 'TENANT_USER',
          action: 'OFFLINE_CHEQUE_SYNCHRONIZED',
          entityType: 'IssuedCheque',
          entityId: createdCheque.id,
          newValues: {
            chequeNumber: createdCheque.chequeNumber,
            amount: createdCheque.amount.toFixed(2),
            payeeName: createdCheque.payeeName,
          },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          requestId: meta.requestId,
        },
        tx
      );

      return { kind: 'OK' as const, cheque: createdCheque };
    });

    if (outcome.kind === 'CONFLICT') {
      return {
        operationId: op.operationId,
        idempotencyKey: op.idempotencyKey,
        status: 'CONFLICT',
        conflictId: outcome.conflictId,
        message: `Cheque number collision for '${outcome.chequeNumber}'. Both local and server versions preserved for review.`,
      };
    }

    return {
      operationId: op.operationId,
      idempotencyKey: op.idempotencyKey,
      status: 'SYNCHRONIZED',
      message: `Cheque #${outcome.cheque.chequeNumber} synchronized successfully.`,
      serverRecord: {
        id: outcome.cheque.id,
        chequeNumber: outcome.cheque.chequeNumber,
        version: outcome.cheque.version,
      },
    };
  }

  // Optimistic concurrency check for UPDATE operations
  const existingCheque = await prisma.issuedCheque.findFirst({
    where: { id: op.recordId, tenantId: actor.tenantId },
  });

  if (!existingCheque) {
    await prisma.syncOperation.update({
      where: { id: syncOpRecord.id },
      data: {
        status: 'FAILED',
        retryCount: { increment: 1 },
        lastError: 'Target cheque not found on server.',
      },
    });
    return {
      operationId: op.operationId,
      idempotencyKey: op.idempotencyKey,
      status: 'FAILED',
      message: 'Target record not found on server.',
    };
  }

  if (op.clientVersion && existingCheque.version !== op.clientVersion) {
    const conflict = await prisma.$transaction(async (tx) => {
      await tx.syncOperation.update({
        where: { id: syncOpRecord.id },
        data: {
          status: 'CONFLICT',
          retryCount: { increment: 1 },
          lastError: `Version mismatch: client=${op.clientVersion}, server=${existingCheque.version}`,
        },
      });
      return tx.syncConflict.create({
        data: {
          tenantId: actor.tenantId,
          syncOperationId: syncOpRecord.id,
          entityType: op.entityType,
          recordId: op.recordId,
          conflictType: 'VERSION_MISMATCH',
          localPayloadJson: op.payload as Prisma.InputJsonValue,
          serverSnapshotJson: {
            id: existingCheque.id,
            chequeNumber: existingCheque.chequeNumber,
            payeeName: existingCheque.payeeName,
            amount: existingCheque.amount.toFixed(2),
            version: existingCheque.version,
            businessStatus: existingCheque.businessStatus,
            bankingStatus: existingCheque.bankingStatus,
          },
          resolutionStatus: 'OPEN',
        },
      });
    });

    return {
      operationId: op.operationId,
      idempotencyKey: op.idempotencyKey,
      status: 'CONFLICT',
      conflictId: conflict.id,
      message: 'Concurrent modification detected; conflict preserved for review.',
    };
  }

  await prisma.syncOperation.update({
    where: { id: syncOpRecord.id },
    data: { status: 'SYNCHRONIZED', processedAt: new Date() },
  });

  return {
    operationId: op.operationId,
    idempotencyKey: op.idempotencyKey,
    status: 'SYNCHRONIZED',
    message: 'Operation synchronized.',
  };
}

export async function processSyncPushBatch(
  actor: AuthenticatedTenantUser,
  input: SyncPushBatchInput,
  meta: TenantActorMeta
): Promise<SyncOperationResultDto[]> {
  const prisma = getPrisma();
  const device = await prisma.registeredDevice.findFirst({
    where: { id: input.deviceId, tenantId: actor.tenantId },
  });

  if (!device) {
    throw new NotFoundError('Registered Device');
  }
  if (device.status !== 'ACTIVE') {
    throw new ForbiddenError(
      `Device '${device.deviceName}' is ${device.status} and cannot synchronize offline operations.`,
      'DEVICE_NOT_ACTIVE'
    );
  }

  await prisma.registeredDevice.update({
    where: { id: device.id },
    data: { lastSeenAt: new Date() },
  });

  const results: SyncOperationResultDto[] = [];
  for (const op of input.operations) {
    const result = await processSingleSyncOperation(actor, device.id, op, meta);
    results.push(result);
  }

  return results;
}

export async function listSyncConflicts(
  actor: AuthenticatedTenantUser,
  query: ListSyncConflictsQueryInput
) {
  const prisma = getPrisma();
  const where: Prisma.SyncConflictWhereInput = {
    tenantId: actor.tenantId,
    ...(query.resolutionStatus ? { resolutionStatus: query.resolutionStatus } : {}),
  };

  const skip = (query.page - 1) * query.limit;
  const [items, totalItems] = await Promise.all([
    prisma.syncConflict.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.limit,
      include: {
        syncOperation: {
          select: {
            id: true,
            operationType: true,
            deviceId: true,
            clientCreatedAt: true,
            user: { select: { email: true, firstName: true, lastName: true } },
          },
        },
      },
    }),
    prisma.syncConflict.count({ where }),
  ]);

  return { items, totalItems, page: query.page, limit: query.limit };
}

export async function resolveSyncConflict(
  actor: AuthenticatedTenantUser,
  conflictId: string,
  input: ResolveSyncConflictInput,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const conflict = await prisma.syncConflict.findFirst({
    where: { id: conflictId, tenantId: actor.tenantId },
  });

  if (!conflict) {
    throw new NotFoundError('Sync Conflict');
  }
  if (conflict.resolutionStatus !== 'OPEN') {
    throw new ConflictError(`Conflict has already been resolved (${conflict.resolutionStatus}).`);
  }

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const updated = await tx.syncConflict.update({
      where: { id: conflict.id },
      data: {
        resolutionStatus: input.resolutionStatus,
        resolutionNotes: input.resolutionNotes,
        resolvedBy: actor.id,
        resolvedAt: now,
      },
    });

    await tx.syncOperation.update({
      where: { id: conflict.syncOperationId },
      data: {
        status:
          input.resolutionStatus === 'DISCARDED' ? 'REJECTED' : 'SYNCHRONIZED',
        processedAt: now,
      },
    });

    await tx.syncLog.create({
      data: {
        tenantId: actor.tenantId,
        userId: actor.id,
        syncOperationId: conflict.syncOperationId,
        eventType: 'SYNC_CONFLICT_RESOLVED',
        status: input.resolutionStatus,
        message: input.resolutionNotes,
      },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'SYNCHRONIZATION_CONFLICT_RESOLVED',
        entityType: 'SyncConflict',
        entityId: conflict.id,
        previousValues: { resolutionStatus: 'OPEN', conflictType: conflict.conflictType },
        newValues: {
          resolutionStatus: input.resolutionStatus,
          resolutionNotes: input.resolutionNotes,
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return updated;
  });
}

export async function listSyncLogs(
  actor: AuthenticatedTenantUser,
  page = 1,
  limit = 20
) {
  const prisma = getPrisma();
  const skip = (page - 1) * limit;
  const [items, totalItems] = await Promise.all([
    prisma.syncLog.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        device: { select: { deviceName: true } },
      },
    }),
    prisma.syncLog.count({ where: { tenantId: actor.tenantId } }),
  ]);

  return { items, totalItems, page, limit };
}
