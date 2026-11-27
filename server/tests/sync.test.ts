import { describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  requestOfflineRangeSchema,
  resolveSyncConflictSchema,
  syncPushBatchSchema,
} from '@cheque-saas/shared';
import { createApp } from '../src/app.js';

describe('Phase 9 offline synchronization routes & schemas', () => {
  it('blocks unauthenticated access to all sync API endpoints (401)', async () => {
    const app = createApp();
    const responses = await Promise.all([
      request(app).get('/api/v1/sync/devices'),
      request(app).get('/api/v1/sync/bootstrap'),
      request(app).post('/api/v1/sync/push').send({}),
      request(app).get('/api/v1/sync/conflicts'),
      request(app).get('/api/v1/sync/logs'),
      request(app).post('/api/v1/sync/allocations/request').send({}),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(401);
    }
  });

  it('validates offline sync push batches, range allocations, and conflict resolutions', () => {
    const validBatch = syncPushBatchSchema.safeParse({
      deviceId: '11111111-1111-4111-8111-111111111111',
      operations: [
        {
          operationId: '22222222-2222-4222-8222-222222222222',
          idempotencyKey: 'offline-chq-22222222',
          entityType: 'ISSUED_CHEQUE',
          recordId: '33333333-3333-4333-8333-333333333333',
          operationType: 'CREATE',
          payload: { chequeNumber: '100001' },
          clientCreatedAt: '2026-11-25T10:00:00.000Z',
        },
      ],
    });
    expect(validBatch.success).toBe(true);

    const emptyBatch = syncPushBatchSchema.safeParse({
      deviceId: '11111111-1111-4111-8111-111111111111',
      operations: [],
    });
    expect(emptyBatch.success).toBe(false);

    const oversizedRange = requestOfflineRangeSchema.safeParse({
      deviceId: '11111111-1111-4111-8111-111111111111',
      chequeBookId: '44444444-4444-4444-8444-444444444444',
      leafCount: 500,
    });
    expect(oversizedRange.success).toBe(false);

    const validResolution = resolveSyncConflictSchema.safeParse({
      resolutionStatus: 'RESOLVED_KEEP_SERVER',
      resolutionNotes: 'Server authoritative state retained after dual-entry review.',
    });
    expect(validResolution.success).toBe(true);
  });
});
