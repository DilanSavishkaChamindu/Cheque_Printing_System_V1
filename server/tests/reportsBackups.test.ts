import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { backupFileSchema } from '@cheque-saas/shared';
import { createApp } from '../src/app.js';
import { validateBackupFinancialConsistency } from '../src/modules/backups/backup.service.js';

describe('Phase 8 dashboard, reports, and backup/restore', () => {
  it('validates financial consistency inside tenant JSON backup payloads', () => {
    const validBackup = backupFileSchema.parse({
      schemaVersion: '1.0.0',
      exportedAt: '2026-11-25T10:00:00.000Z',
      backupScope: 'TENANT_EXPORT',
      tenant: {
        id: '11111111-1111-4111-8111-111111111111',
        tenantCode: 'ABC',
        organizationName: 'ABC Trading',
      },
      data: {
        companies: [{ id: 'comp-1' }],
        bankAccounts: [
          {
            id: 'acc-1',
            companyId: 'comp-1',
            openingBalance: '1000.00',
            currentBookBalance: '1250.50',
          },
        ],
        bankTransactions: [
          {
            bankAccountId: 'acc-1',
            transactionType: 'OPENING_BALANCE',
            debitAmount: '0.00',
            creditAmount: '1000.00',
          },
          {
            bankAccountId: 'acc-1',
            transactionType: 'DEPOSIT',
            debitAmount: '0.00',
            creditAmount: '500.50',
          },
          {
            bankAccountId: 'acc-1',
            transactionType: 'WITHDRAWAL',
            debitAmount: '250.00',
            creditAmount: '0.00',
          },
        ],
      },
    });

    expect(validateBackupFinancialConsistency(validBackup)).toEqual([]);

    const tamperedBackup = structuredClone(validBackup);
    tamperedBackup.data.bankAccounts[0]!.currentBookBalance = '9999.00';
    expect(validateBackupFinancialConsistency(tamperedBackup).length).toBeGreaterThan(0);
  });

  it('rejects unauthenticated requests across dashboard, reports, and backups (401)', async () => {
    const app = createApp();
    const responses = await Promise.all([
      request(app).get('/api/v1/dashboard'),
      request(app).get('/api/v1/reports'),
      request(app).post('/api/v1/reports/export').send({}),
      request(app).get('/api/v1/backups'),
      request(app).post('/api/v1/backups/export'),
      request(app).post('/api/v1/backups/restore/preview').send({}),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(401);
    }
  });
});
