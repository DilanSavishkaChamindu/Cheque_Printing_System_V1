import { describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  createBankAccountSchema,
  createCompanySchema,
  createTenantUserSchema,
} from '@cheque-saas/shared';
import { createApp } from '../src/app.js';
import { maskAccountNumber } from '../src/utils/masking.js';

describe('Phase 4 organization, banking, and user management', () => {
  it('masks sensitive bank account numbers while keeping short identifiers safe', () => {
    expect(maskAccountNumber('001234567890')).toBe('********7890');
    expect(maskAccountNumber('123456')).toBe('**3456');
    expect(maskAccountNumber('1234')).toBe('1234');
  });

  it('validates company, user, and bank account inputs strictly', () => {
    expect(
      createCompanySchema.parse({
        companyCode: 'abc_trade',
        companyName: 'ABC Trading (Pvt) Ltd',
      }).companyCode
    ).toBe('ABC_TRADE');

    expect(() =>
      createTenantUserSchema.parse({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@abc.com',
        username: 'john',
        password: 'weak',
      })
    ).toThrow();

    expect(() =>
      createBankAccountSchema.parse({
        bankId: '11111111-1111-4111-8111-111111111111',
        accountName: 'Main Current',
        accountNumber: '12345678',
        openingBalance: '100.123',
        openingBalanceDate: '2026-01-01',
      })
    ).toThrow();
  });

  it('rejects unauthenticated requests across all Phase 4 endpoints (401)', async () => {
    const app = createApp();
    const responses = await Promise.all([
      request(app).get('/api/v1/companies'),
      request(app).get('/api/v1/banks'),
      request(app).get('/api/v1/bank-branches'),
      request(app).get('/api/v1/users'),
      request(app).get('/api/v1/roles'),
      request(app).get('/api/v1/permissions'),
      request(app).get('/api/v1/bank-accounts'),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(401);
    }
  });
});
