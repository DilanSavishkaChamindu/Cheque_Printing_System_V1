import {
  convertAmountToWords,
  verifyAmountInWordsMatch,
  type ApiSuccessResponse,
  type PaginationMeta,
  type PaymentType,
  type ResolveSyncConflictInput,
  type SyncPushBatchInput,
} from '@cheque-saas/shared';
import { apiClient, extractApiErrorMessage } from '../lib/apiClient';
import {
  offlineDb,
  type LocalChequeDraftRecord,
  type LocalSyncOperationRecord,
} from '../lib/offlineDb';
import { authStore } from '../stores/authStore';

export function computeSyncBackoffMs(retryCount: number): number {
  const clamped = Math.max(0, Math.min(8, retryCount));
  return Math.min(300_000, 2_000 * 2 ** clamped);
}

export interface RegisteredDeviceDto {
  id: string;
  userId: string;
  deviceFingerprint: string;
  deviceName: string;
  platform: string | null;
  browser: string | null;
  status: 'PENDING' | 'ACTIVE' | 'REVOKED';
  lastSeenAt: string | null;
  approvedAt: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  user: { firstName: string; lastName: string; email: string; username: string };
  _count: { chequeAllocations: number; syncOperations: number };
}

export interface SyncConflictDto {
  id: string;
  entityType: string;
  recordId: string;
  conflictType: string;
  localPayloadJson: Record<string, unknown>;
  serverSnapshotJson: Record<string, unknown>;
  resolutionStatus: string;
  resolutionNotes: string | null;
  createdAt: string;
}

export interface SyncBootstrapDto {
  device: { id: string; deviceName: string; status: string };
  offlineExpiresAt: string;
  companies: Array<{
    id: string;
    companyCode: string;
    companyName: string;
    isDefault: boolean;
  }>;
  bankAccounts: Array<{
    id: string;
    tenantId: string;
    companyId: string;
    bankId: string;
    bankName: string;
    accountName: string;
    accountNumberMasked: string;
    currency: string;
    status: string;
  }>;
  templates: Array<{
    id: string;
    tenantId: string;
    bankId: string;
    bankAccountId: string | null;
    templateName: string;
    paperWidthMm: number;
    paperHeightMm: number;
    orientation: 'PORTRAIT' | 'LANDSCAPE';
    dateFormat: string;
    fieldsJson: string;
    updatedAt: string;
  }>;
  allocations: Array<{
    id: string;
    tenantId: string;
    companyId: string;
    bankAccountId: string;
    chequeBookId: string;
    rangeStart: number;
    rangeEnd: number;
    nextNumber: number;
    numberPaddingLength: number;
    chequePrefix: string | null;
    status: string;
  }>;
}

export const syncService = {
  async listDevices(): Promise<RegisteredDeviceDto[]> {
    const res = await apiClient.get<ApiSuccessResponse<RegisteredDeviceDto[]>>('/sync/devices');
    return res.data.data;
  },

  async approveDevice(deviceId: string) {
    const res = await apiClient.post(`/sync/devices/${deviceId}/approve`);
    return res.data.data;
  },

  async revokeDevice(deviceId: string, reason: string) {
    const res = await apiClient.post(`/sync/devices/${deviceId}/revoke`, { reason });
    return res.data.data;
  },

  async requestOfflineRange(input: {
    deviceId: string;
    chequeBookId: string;
    leafCount: number;
  }) {
    const res = await apiClient.post('/sync/allocations/request', input);
    return res.data.data;
  },

  async getBootstrap(deviceId: string): Promise<SyncBootstrapDto> {
    const res = await apiClient.get<ApiSuccessResponse<SyncBootstrapDto>>('/sync/bootstrap', {
      headers: { 'X-Device-Id': deviceId },
    });
    return res.data.data;
  },

  async pushBatch(input: SyncPushBatchInput) {
    const res = await apiClient.post<
      ApiSuccessResponse<
        Array<{
          operationId: string;
          idempotencyKey: string;
          status: 'SYNCHRONIZED' | 'CONFLICT' | 'FAILED' | 'REJECTED';
          deduplicated?: boolean;
          conflictId?: string;
          message: string;
        }>
      >
    >('/sync/push', input);
    return res.data.data;
  },

  async listConflicts(page = 1, resolutionStatus?: string) {
    const res = await apiClient.get<
      ApiSuccessResponse<SyncConflictDto[], { pagination: PaginationMeta }>
    >('/sync/conflicts', {
      params: {
        page,
        limit: 15,
        resolutionStatus: resolutionStatus || undefined,
      },
    });
    return { items: res.data.data, pagination: res.data.meta.pagination };
  },

  async resolveConflict(conflictId: string, input: ResolveSyncConflictInput) {
    const res = await apiClient.post(`/sync/conflicts/${conflictId}/resolve`, input);
    return res.data.data;
  },
};

export async function refreshOfflineCache(): Promise<SyncBootstrapDto> {
  const user = authStore.getState().tenantUser;
  if (!user || !user.deviceId) {
    throw new Error('An authenticated session with a registered device is required.');
  }

  const bootstrap = await syncService.getBootstrap(user.deviceId);
  const nowIso = new Date().toISOString();

  await offlineDb.transaction(
    'rw',
    [
      offlineDb.cachedSessions,
      offlineDb.cachedCompanies,
      offlineDb.cachedBankAccounts,
      offlineDb.cachedTemplates,
      offlineDb.allocatedChequeRanges,
    ],
    async () => {
      await offlineDb.cachedSessions.put({
        id: user.sessionId,
        tenantId: user.tenantId,
        userId: user.id,
        deviceId: user.deviceId,
        offlineExpiresAt: bootstrap.offlineExpiresAt,
        cachedAt: nowIso,
      });

      await offlineDb.cachedCompanies.where('tenantId').equals(user.tenantId).delete();
      if (bootstrap.companies.length > 0) {
        await offlineDb.cachedCompanies.bulkPut(
          bootstrap.companies.map((c) => ({
            id: c.id,
            tenantId: user.tenantId,
            companyCode: c.companyCode,
            companyName: c.companyName,
            isDefault: c.isDefault,
            status: 'ACTIVE',
          }))
        );
      }

      await offlineDb.cachedBankAccounts.where('tenantId').equals(user.tenantId).delete();
      if (bootstrap.bankAccounts.length > 0) {
        await offlineDb.cachedBankAccounts.bulkPut(bootstrap.bankAccounts);
      }

      await offlineDb.cachedTemplates.where('tenantId').equals(user.tenantId).delete();
      if (bootstrap.templates.length > 0) {
        await offlineDb.cachedTemplates.bulkPut(bootstrap.templates);
      }

      await offlineDb.allocatedChequeRanges.where('tenantId').equals(user.tenantId).delete();
      if (bootstrap.allocations.length > 0) {
        await offlineDb.allocatedChequeRanges.bulkPut(bootstrap.allocations);
      }
    }
  );

  return bootstrap;
}

export async function createOfflineChequeDraft(input: {
  companyId?: string;
  bankAccountId: string;
  chequeDate: string;
  dateFormat?: 'DD/MM/YYYY' | 'DDMMYYYY' | 'DD MMM YYYY';
  payeeName: string;
  amount: string;
  currency: string;
  paymentType: PaymentType;
  cashRecipient?: string | null;
  amountInWords?: string;
  description?: string | null;
}): Promise<{ draft: LocalChequeDraftRecord; operation: LocalSyncOperationRecord }> {
  const user = authStore.getState().tenantUser;
  if (!user || !user.deviceId) {
    throw new Error('Offline cheque creation requires a previously authenticated device session.');
  }

  const cachedSession = await offlineDb.cachedSessions.get(user.sessionId);
  if (!cachedSession || new Date(cachedSession.offlineExpiresAt) <= new Date()) {
    throw new Error(
      'Offline session has expired or was not bootstrapped. Connect to the internet and sign in again.'
    );
  }

  const words =
    input.amountInWords?.trim() ||
    convertAmountToWords(input.amount, { currencyCode: input.currency, locale: 'en' });

  if (!verifyAmountInWordsMatch(input.amount, input.currency, words, 'en')) {
    throw new Error('Amount in words does not match the numeric amount.');
  }

  const nowIso = new Date().toISOString();
  const recordId = crypto.randomUUID();
  const operationId = crypto.randomUUID();
  const idempotencyKey = `offline-chq-${recordId}`;

  return offlineDb.transaction(
    'rw',
    [
      offlineDb.cachedBankAccounts,
      offlineDb.allocatedChequeRanges,
      offlineDb.localChequeDrafts,
      offlineDb.syncOperations,
    ],
    async () => {
      const account = await offlineDb.cachedBankAccounts.get(input.bankAccountId);
      if (!account || account.tenantId !== user.tenantId) {
        throw new Error('Selected bank account is not cached or authorized for offline use.');
      }

      const ranges = await offlineDb.allocatedChequeRanges
        .where('bankAccountId')
        .equals(account.id)
        .filter((r) => r.tenantId === user.tenantId && r.status === 'ACTIVE' && r.nextNumber <= r.rangeEnd)
        .toArray();

      const allocation = ranges[0];
      if (!allocation) {
        throw new Error(
          'No allocated offline cheque numbers remain for this bank account. Request a range while online.'
        );
      }

      const numericNum = allocation.nextNumber;
      const padded = String(numericNum).padStart(allocation.numberPaddingLength, '0');
      const chequeNumber = allocation.chequePrefix
        ? `${allocation.chequePrefix}${padded}`
        : padded;

      await offlineDb.allocatedChequeRanges.update(allocation.id, {
        nextNumber: numericNum + 1,
        status: numericNum + 1 > allocation.rangeEnd ? 'EXHAUSTED' : 'ACTIVE',
      });

      const companyId = input.companyId ?? account.companyId;
      const draft: LocalChequeDraftRecord = {
        id: recordId,
        tenantId: user.tenantId,
        companyId,
        bankId: account.bankId,
        bankAccountId: account.id,
        chequeBookId: allocation.chequeBookId,
        allocationId: allocation.id,
        chequeNumber,
        chequeDate: input.chequeDate,
        payeeName: input.payeeName,
        amount: input.amount,
        currency: input.currency,
        paymentType: input.paymentType,
        cashRecipient: input.cashRecipient ?? null,
        amountInWords: words,
        description: input.description ?? null,
        businessStatus: 'ISSUED',
        printingStatus: 'NOT_PRINTED',
        syncStatus: 'PENDING',
        serverSynced: false,
        version: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const payload = {
        companyId,
        bankAccountId: account.id,
        chequeBookId: allocation.chequeBookId,
        chequeNumber,
        chequeDate: input.chequeDate,
        dateFormat: input.dateFormat ?? 'DD/MM/YYYY',
        payeeName: input.payeeName,
        amount: input.amount,
        currency: input.currency,
        paymentType: input.paymentType,
        cashRecipient: input.cashRecipient ?? null,
        amountInWords: words,
        description: input.description ?? null,
        issueImmediately: true,
        idempotencyKey,
      };

      const operation: LocalSyncOperationRecord = {
        operationId,
        idempotencyKey,
        tenantId: user.tenantId,
        userId: user.id,
        deviceId: user.deviceId!,
        entityType: 'ISSUED_CHEQUE',
        recordId,
        operationType: 'CREATE',
        payloadJson: JSON.stringify(payload),
        status: 'PENDING',
        retryCount: 0,
        lastError: null,
        createdAt: nowIso,
        nextRetryAt: null,
      };

      await offlineDb.localChequeDrafts.put(draft);
      await offlineDb.syncOperations.put(operation);

      return { draft, operation };
    }
  );
}

export async function processPendingSyncQueue(): Promise<{
  processed: number;
  synchronized: number;
  conflicts: number;
  failed: number;
}> {
  const user = authStore.getState().tenantUser;
  if (!user || !user.deviceId || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return { processed: 0, synchronized: 0, conflicts: 0, failed: 0 };
  }

  const now = Date.now();
  const candidates = await offlineDb.syncOperations
    .where('tenantId')
    .equals(user.tenantId)
    .filter(
      (op) =>
        op.status === 'PENDING' ||
        (op.status === 'FAILED' &&
          (!op.nextRetryAt || new Date(op.nextRetryAt).getTime() <= now))
    )
    .toArray();

  if (candidates.length === 0) {
    return { processed: 0, synchronized: 0, conflicts: 0, failed: 0 };
  }

  let synchronized = 0;
  let conflicts = 0;
  let failed = 0;

  try {
    const batchResults = await syncService.pushBatch({
      deviceId: user.deviceId,
      operations: candidates.map((op) => ({
        operationId: op.operationId,
        idempotencyKey: op.idempotencyKey,
        entityType: 'ISSUED_CHEQUE',
        recordId: op.recordId,
        operationType: op.operationType,
        payload: JSON.parse(op.payloadJson) as Record<string, unknown>,
        clientCreatedAt: op.createdAt,
      })),
    });

    const resultByOpId = new Map(batchResults.map((r) => [r.operationId, r]));

    for (const op of candidates) {
      const outcome = resultByOpId.get(op.operationId);
      if (!outcome) {
        continue;
      }

      if (outcome.status === 'SYNCHRONIZED') {
        synchronized += 1;
        await offlineDb.syncOperations.update(op.operationId, {
          status: 'SYNCHRONIZED',
          lastError: null,
        });
        await offlineDb.localChequeDrafts.update(op.recordId, {
          syncStatus: 'SYNCHRONIZED',
          serverSynced: true,
        });
      } else if (outcome.status === 'CONFLICT') {
        conflicts += 1;
        await offlineDb.syncOperations.update(op.operationId, {
          status: 'CONFLICT',
          lastError: outcome.message,
        });
        await offlineDb.localChequeDrafts.update(op.recordId, {
          syncStatus: 'CONFLICT',
        });
      } else {
        failed += 1;
        const nextRetry = new Date(
          Date.now() + computeSyncBackoffMs(op.retryCount + 1)
        ).toISOString();
        await offlineDb.syncOperations.update(op.operationId, {
          status: outcome.status,
          retryCount: op.retryCount + 1,
          lastError: outcome.message,
          nextRetryAt: nextRetry,
        });
      }
    }
  } catch (err) {
    const message = extractApiErrorMessage(err, 'Synchronization failed.');
    for (const op of candidates) {
      failed += 1;
      const nextRetry = new Date(
        Date.now() + computeSyncBackoffMs(op.retryCount + 1)
      ).toISOString();
      await offlineDb.syncOperations.update(op.operationId, {
        status: 'FAILED',
        retryCount: op.retryCount + 1,
        lastError: message,
        nextRetryAt: nextRetry,
      });
    }
  }

  return {
    processed: candidates.length,
    synchronized,
    conflicts,
    failed,
  };
}
