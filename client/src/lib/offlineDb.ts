import Dexie, { type Table } from 'dexie';
import type {
  ChequeBusinessStatus,
  ChequePrintingStatus,
  PaymentType,
  SyncOperationStatus,
} from '@cheque-saas/shared';

export interface LocalSessionCache {
  id: string;
  tenantId: string;
  userId: string;
  deviceId: string | null;
  offlineExpiresAt: string;
  cachedAt: string;
}

export interface LocalCompanyCache {
  id: string;
  tenantId: string;
  companyCode: string;
  companyName: string;
  isDefault: boolean;
  status: string;
}

export interface LocalBankAccountCache {
  id: string;
  tenantId: string;
  companyId: string;
  bankId: string;
  bankName: string;
  accountName: string;
  accountNumberMasked: string;
  currency: string;
  status: string;
}

export interface LocalTemplateCache {
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
}

export interface LocalChequeAllocationCache {
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
}

export interface LocalChequeDraftRecord {
  id: string;
  tenantId: string;
  companyId: string;
  bankId: string;
  bankAccountId: string;
  chequeBookId: string | null;
  allocationId: string | null;
  chequeNumber: string;
  chequeDate: string;
  payeeName: string;
  amount: string;
  currency: string;
  paymentType: PaymentType;
  cashRecipient: string | null;
  amountInWords: string;
  description: string | null;
  businessStatus: ChequeBusinessStatus;
  printingStatus: ChequePrintingStatus;
  syncStatus: SyncOperationStatus;
  serverSynced: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface LocalSyncOperationRecord {
  operationId: string;
  idempotencyKey: string;
  tenantId: string;
  userId: string;
  deviceId: string;
  entityType: string;
  recordId: string;
  operationType: 'CREATE' | 'UPDATE' | 'STATUS_CHANGE' | 'PRINT_RECORD';
  payloadJson: string;
  status: SyncOperationStatus;
  retryCount: number;
  lastError: string | null;
  createdAt: string;
  nextRetryAt: string | null;
}

export class ChequeSaaSOfflineDb extends Dexie {
  cachedSessions!: Table<LocalSessionCache, string>;
  cachedCompanies!: Table<LocalCompanyCache, string>;
  cachedBankAccounts!: Table<LocalBankAccountCache, string>;
  cachedTemplates!: Table<LocalTemplateCache, string>;
  allocatedChequeRanges!: Table<LocalChequeAllocationCache, string>;
  localChequeDrafts!: Table<LocalChequeDraftRecord, string>;
  syncOperations!: Table<LocalSyncOperationRecord, string>;

  constructor() {
    super('cheque_printing_saas_offline');

    this.version(1).stores({
      cachedSessions: 'id, tenantId, userId',
      cachedCompanies: 'id, tenantId, status',
      cachedBankAccounts: 'id, tenantId, companyId, status',
      cachedTemplates: 'id, tenantId, bankId, bankAccountId',
      allocatedChequeRanges: 'id, tenantId, bankAccountId, status',
      localChequeDrafts: 'id, tenantId, companyId, bankAccountId, syncStatus, createdAt',
      syncOperations: 'operationId, idempotencyKey, tenantId, status, createdAt',
    });
  }
}

export const offlineDb = new ChequeSaaSOfflineDb();

export async function clearOfflineTenantData(tenantId?: string): Promise<void> {
  if (!tenantId) {
    await offlineDb.transaction(
      'rw',
      [
        offlineDb.cachedSessions,
        offlineDb.cachedCompanies,
        offlineDb.cachedBankAccounts,
        offlineDb.cachedTemplates,
        offlineDb.allocatedChequeRanges,
        offlineDb.localChequeDrafts,
        offlineDb.syncOperations,
      ],
      async () => {
        await offlineDb.cachedSessions.clear();
        await offlineDb.cachedCompanies.clear();
        await offlineDb.cachedBankAccounts.clear();
        await offlineDb.cachedTemplates.clear();
        await offlineDb.allocatedChequeRanges.clear();
        await offlineDb.localChequeDrafts.clear();
        await offlineDb.syncOperations.clear();
      }
    );
    return;
  }

  await offlineDb.transaction(
    'rw',
    [
      offlineDb.cachedSessions,
      offlineDb.cachedCompanies,
      offlineDb.cachedBankAccounts,
      offlineDb.cachedTemplates,
      offlineDb.allocatedChequeRanges,
      offlineDb.localChequeDrafts,
      offlineDb.syncOperations,
    ],
    async () => {
      await offlineDb.cachedSessions.where('tenantId').equals(tenantId).delete();
      await offlineDb.cachedCompanies.where('tenantId').equals(tenantId).delete();
      await offlineDb.cachedBankAccounts.where('tenantId').equals(tenantId).delete();
      await offlineDb.cachedTemplates.where('tenantId').equals(tenantId).delete();
      await offlineDb.allocatedChequeRanges.where('tenantId').equals(tenantId).delete();
      await offlineDb.localChequeDrafts.where('tenantId').equals(tenantId).delete();
      await offlineDb.syncOperations.where('tenantId').equals(tenantId).delete();
    }
  );
}
