import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './pagination.js';

export const syncOperationTypeEnum = z.enum([
  'CREATE',
  'UPDATE',
  'STATUS_CHANGE',
  'PRINT_RECORD',
]);

export const conflictResolutionStatusEnum = z.enum([
  'RESOLVED_KEEP_SERVER',
  'RESOLVED_APPLY_LOCAL',
  'RESOLVED_MERGED',
  'DISCARDED',
]);

export const syncPushOperationSchema = z.object({
  operationId: uuidSchema,
  idempotencyKey: z.string().trim().min(8).max(128),
  entityType: z.enum(['ISSUED_CHEQUE']),
  recordId: uuidSchema,
  operationType: syncOperationTypeEnum,
  payload: z.record(z.unknown()),
  clientVersion: z.coerce.number().int().min(1).nullable().optional(),
  clientCreatedAt: z.string().datetime(),
});

export const syncPushBatchSchema = z.object({
  deviceId: uuidSchema,
  operations: z.array(syncPushOperationSchema).min(1).max(50),
});

export const resolveSyncConflictSchema = z.object({
  resolutionStatus: conflictResolutionStatusEnum,
  resolutionNotes: z.string().trim().min(3, 'Resolution notes are required').max(1000),
  mergedPayload: z.record(z.unknown()).optional(),
});

export const requestOfflineRangeSchema = z.object({
  deviceId: uuidSchema,
  chequeBookId: uuidSchema,
  leafCount: z.coerce.number().int().min(1).max(200).default(20),
});

export const revokeDeviceSchema = z.object({
  reason: z.string().trim().min(3).max(255),
});

export const listSyncConflictsQuerySchema = paginationQuerySchema.extend({
  resolutionStatus: z
    .enum([
      'OPEN',
      'RESOLVED_KEEP_SERVER',
      'RESOLVED_APPLY_LOCAL',
      'RESOLVED_MERGED',
      'DISCARDED',
    ])
    .optional(),
});

export type SyncPushOperationInput = z.infer<typeof syncPushOperationSchema>;
export type SyncPushBatchInput = z.infer<typeof syncPushBatchSchema>;
export type ResolveSyncConflictInput = z.infer<typeof resolveSyncConflictSchema>;
export type RequestOfflineRangeInput = z.infer<typeof requestOfflineRangeSchema>;
export type ListSyncConflictsQueryInput = z.infer<typeof listSyncConflictsQuerySchema>;
