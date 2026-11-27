import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { convertAmountToWords, FEATURE_KEYS, PERMISSION_CODES } from '@cheque-saas/shared';

const TENANT_A_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_B_ID = '22222222-2222-4222-8222-222222222222';
const COMPANY_A1_ID = '33333333-3333-4333-8333-333333333331';
const COMPANY_A2_ID = '33333333-3333-4333-8333-333333333332';
const COMPANY_B1_ID = '44444444-4444-4444-8444-444444444441';
const BANK_A_ID = '55555555-5555-4555-8555-555555555551';
const BANK_ACCOUNT_A_ID = '66666666-6666-4666-8666-666666666661';
const CHEQUE_BOOK_A_ID = '77777777-7777-4777-8777-777777777771';
const USER_A_ID = '88888888-8888-4888-8888-888888888881';
const SESSION_A_ID = '99999999-9999-4999-8999-999999999991';
const PLATFORM_ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PLATFORM_SESSION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const FEATURE_CATALOG = Object.values(FEATURE_KEYS).map((key, idx) => ({
  id: `feat-${idx + 1}`,
  key,
  isGlobalActive: true,
  isDefaultEnabled: false,
}));

const prismaMock = vi.hoisted(() => ({
  platformSession: {
    findUnique: vi.fn(),
  },
  userSession: {
    findUnique: vi.fn(),
  },
  feature: {
    findMany: vi.fn(),
  },
  user: {
    update: vi.fn(),
  },
  company: {
    findFirst: vi.fn(),
  },
  issuedCheque: {
    findUnique: vi.fn(),
  },
  syncConflict: {
    findFirst: vi.fn(),
  },
  securityEvent: {
    create: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock('../src/config/prisma.js', () => ({
  getPrisma: () => prismaMock,
  checkDatabaseHealth: vi.fn().mockResolvedValue({ connected: true, latencyMs: 1 }),
}));

import { createApp } from '../src/app.js';
import { LOG_REDACTION_PATHS } from '../src/config/logger.js';
import { postLedgerEntryInTx } from '../src/modules/bank-transactions/ledger.service.js';
import { signAccessToken } from '../src/utils/crypto.js';

function configureTenantSessionMock(options?: {
  tenantStatus?: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  userStatus?: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  isClientAdmin?: boolean;
  companyAccessScope?: 'ALL_COMPANIES' | 'SELECTED_COMPANIES';
  allowedCompanyIds?: string[];
  enabledFeatures?: string[];
  rolePermissions?: string[];
  overrides?: Array<{ code: string; effect: 'ALLOW' | 'DENY' }>;
}) {
  const {
    tenantStatus = 'ACTIVE',
    userStatus = 'ACTIVE',
    isClientAdmin = false,
    companyAccessScope = 'ALL_COMPANIES',
    allowedCompanyIds = [COMPANY_A1_ID],
    enabledFeatures = Object.values(FEATURE_KEYS),
    rolePermissions = [],
    overrides = [],
  } = options ?? {};

  const enabledKeySet = new Set(enabledFeatures);
  const tenantFeatures = FEATURE_CATALOG.map((f) => ({
    featureId: f.id,
    isEnabled: enabledKeySet.has(f.key),
    expiresAt: null,
  }));

  prismaMock.feature.findMany.mockResolvedValue(FEATURE_CATALOG);
  prismaMock.userSession.findUnique.mockResolvedValue({
    id: SESSION_A_ID,
    userId: USER_A_ID,
    tenantId: TENANT_A_ID,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 3600_000),
    deviceId: null,
    device: null,
    user: {
      id: USER_A_ID,
      tenantId: TENANT_A_ID,
      email: 'alice@tenanta.example',
      username: 'alice',
      firstName: 'Alice',
      lastName: 'Finance',
      status: userStatus,
      isClientAdmin,
      companyAccessScope,
      tenant: {
        id: TENANT_A_ID,
        tenantCode: 'TENANT-A',
        organizationName: 'Tenant A Ltd',
        status: tenantStatus,
        defaultCompanyId: COMPANY_A1_ID,
        defaultCurrency: 'LKR',
        settings: {
          defaultCurrency: 'LKR',
          dateFormat: 'DD/MM/YYYY',
          timezone: 'Asia/Colombo',
        },
        tenantFeatures,
        companies: [
          {
            id: COMPANY_A1_ID,
            companyCode: 'CMP-A1',
            companyName: 'Tenant A Primary',
            isDefault: true,
          },
          {
            id: COMPANY_A2_ID,
            companyCode: 'CMP-A2',
            companyName: 'Tenant A Subsidiary',
            isDefault: false,
          },
        ],
      },
      userRoles: [
        {
          role: {
            code: 'ROLE_USER',
            name: 'Standard User',
            status: 'ACTIVE',
            isClientAdmin: false,
            rolePermissions: rolePermissions.map((code) => ({
              permission: { code },
            })),
          },
        },
      ],
      permissionOverrides: overrides.map((ov) => ({
        effect: ov.effect,
        permission: { code: ov.code },
      })),
      userCompanies: allowedCompanyIds.map((companyId) => ({ companyId })),
    },
  });
}

function issueTenantAToken() {
  return signAccessToken({
    sub: USER_A_ID,
    actorType: 'TENANT_USER',
    tenantId: TENANT_A_ID,
    sid: SESSION_A_ID,
  });
}

function issuePlatformToken() {
  return signAccessToken({
    sub: PLATFORM_ADMIN_ID,
    actorType: 'PLATFORM_ADMIN',
    sid: PLATFORM_SESSION_ID,
  });
}

describe('Phase 10 security headers, tenant isolation, RBAC & idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.update.mockResolvedValue({ id: USER_A_ID });
    prismaMock.securityEvent.create.mockResolvedValue({ id: 'sec-1' });
    prismaMock.auditLog.create.mockResolvedValue({ id: 'aud-1' });
  });

  it('sets Helmet hardening headers and redacts sensitive fields in Pino logs', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(LOG_REDACTION_PATHS).toContain('req.headers.authorization');
    expect(LOG_REDACTION_PATHS).toContain('*.passwordHash');
    expect(LOG_REDACTION_PATHS).toContain('*.refreshToken');
  });

  it('strictly separates Platform Admin and Tenant User planes with HTTP 403', async () => {
    const app = createApp();
    const tenantToken = issueTenantAToken();
    const platformToken = issuePlatformToken();

    const tenantCallsPlatform = await request(app)
      .get('/api/v1/platform/tenants')
      .set('Authorization', `Bearer ${tenantToken}`);
    expect(tenantCallsPlatform.status).toBe(403);
    expect(tenantCallsPlatform.body.code).toBe('PLATFORM_ACCESS_REQUIRED');

    const platformCallsTenant = await request(app)
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${platformToken}`);
    expect(platformCallsTenant.status).toBe(403);
    expect(platformCallsTenant.body.code).toBe('TENANT_USER_REQUIRED');
  });

  it('blocks suspended tenants and suspended users at authentication boundary (403)', async () => {
    const app = createApp();
    const token = issueTenantAToken();

    configureTenantSessionMock({
      tenantStatus: 'SUSPENDED',
      isClientAdmin: true,
    });
    const suspendedTenantRes = await request(app)
      .get('/api/v1/cheques')
      .set('Authorization', `Bearer ${token}`);
    expect(suspendedTenantRes.status).toBe(403);

    configureTenantSessionMock({
      tenantStatus: 'ACTIVE',
      userStatus: 'SUSPENDED',
      isClientAdmin: true,
    });
    const suspendedUserRes = await request(app)
      .get('/api/v1/cheques')
      .set('Authorization', `Bearer ${token}`);
    expect(suspendedUserRes.status).toBe(403);
    expect(suspendedUserRes.body.code).toBe('USER_INACTIVE');
  });

  it('blocks disabled tenant features even for a Client Admin (403)', async () => {
    const app = createApp();
    const token = issueTenantAToken();

    configureTenantSessionMock({
      isClientAdmin: true,
      enabledFeatures: [FEATURE_KEYS.DASHBOARD, FEATURE_KEYS.NEW_CHEQUE],
    });

    const [companiesRes, templatesRes] = await Promise.all([
      request(app).get('/api/v1/companies').set('Authorization', `Bearer ${token}`),
      request(app).get('/api/v1/cheque-templates').set('Authorization', `Bearer ${token}`),
    ]);

    expect(companiesRes.status).toBe(403);
    expect(templatesRes.status).toBe(403);
  });

  it('enforces RBAC permissions and explicit DENY overrides (403)', async () => {
    const app = createApp();
    const token = issueTenantAToken();

    configureTenantSessionMock({
      isClientAdmin: false,
      rolePermissions: [PERMISSION_CODES.CHEQUE_VIEW, PERMISSION_CODES.BANK_TRANSACTION_MANAGE],
      overrides: [{ code: PERMISSION_CODES.BANK_TRANSACTION_MANAGE, effect: 'DENY' }],
    });

    const missingCreatePerm = await request(app)
      .post('/api/v1/cheques')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(missingCreatePerm.status).toBe(403);

    const deniedLedgerPerm = await request(app)
      .post('/api/v1/bank-transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(deniedLedgerPerm.status).toBe(403);
  });

  it('prevents cross-tenant or out-of-scope company access', async () => {
    const app = createApp();
    const token = issueTenantAToken();

    // Case 1: Companies feature disabled -> passing Tenant B companyId fails with 403
    configureTenantSessionMock({
      isClientAdmin: true,
      enabledFeatures: [FEATURE_KEYS.NEW_CHEQUE],
    });

    const crossCompanyCheque = await request(app)
      .post('/api/v1/cheques')
      .set('Authorization', `Bearer ${token}`)
      .send({
        companyId: COMPANY_B1_ID,
        bankAccountId: BANK_ACCOUNT_A_ID,
        chequeBookId: CHEQUE_BOOK_A_ID,
        chequeDate: '2026-11-25',
        payeeName: 'Cross Tenant Payee',
        amount: '1500.00',
        currency: 'LKR',
        amountInWords: convertAmountToWords('1500.00', { currencyCode: 'LKR', locale: 'en' }),
      });
    expect(crossCompanyCheque.status).toBe(403);

    // Case 2: Companies enabled with SELECTED_COMPANIES scope -> unauthorized company returns 403
    configureTenantSessionMock({
      isClientAdmin: false,
      companyAccessScope: 'SELECTED_COMPANIES',
      allowedCompanyIds: [COMPANY_A1_ID],
      rolePermissions: [PERMISSION_CODES.COMPANY_VIEW],
    });
    prismaMock.company.findFirst.mockResolvedValue({
      id: COMPANY_A2_ID,
      tenantId: TENANT_A_ID,
      companyCode: 'CMP-A2',
      companyName: 'Tenant A Subsidiary',
      settings: null,
    });

    const disallowedCompany = await request(app)
      .get(`/api/v1/companies/${COMPANY_A2_ID}`)
      .set('Authorization', `Bearer ${token}`);
    expect(disallowedCompany.status).toBe(403);

    // Case 3: Tenant B company lookup scoped by tenantId yields null -> 404
    prismaMock.company.findFirst.mockResolvedValue(null);
    const foreignCompany = await request(app)
      .get(`/api/v1/companies/${COMPANY_B1_ID}`)
      .set('Authorization', `Bearer ${token}`);
    expect(foreignCompany.status).toBe(404);
  });

  it('blocks cross-tenant backup restore attempts and records high-severity security event', async () => {
    const app = createApp();
    const token = issueTenantAToken();

    configureTenantSessionMock({
      isClientAdmin: true,
      enabledFeatures: [FEATURE_KEYS.BACKUP_RESTORE],
    });

    const crossTenantBackupRes = await request(app)
      .post('/api/v1/backups/restore/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({
        schemaVersion: '1.0.0',
        exportedAt: '2026-11-25T10:00:00.000Z',
        backupScope: 'TENANT_EXPORT',
        tenant: {
          id: TENANT_B_ID,
          tenantCode: 'TENANT-B',
          organizationName: 'Other Org Ltd',
        },
        data: {},
      });

    expect(crossTenantBackupRes.status).toBe(403);
    expect(prismaMock.securityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_A_ID,
          eventType: 'CROSS_TENANT_RESTORE_ATTEMPT',
          severity: 'HIGH',
        }),
      })
    );
  });

  it('isolates SyncConflict resolution strictly by tenantId', async () => {
    const app = createApp();
    const token = issueTenantAToken();

    configureTenantSessionMock({
      isClientAdmin: false,
      rolePermissions: [PERMISSION_CODES.CHEQUE_EDIT],
    });
    prismaMock.syncConflict.findFirst.mockResolvedValue(null);

    const foreignConflictId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const res = await request(app)
      .post(`/api/v1/sync/conflicts/${foreignConflictId}/resolve`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        resolutionStatus: 'RESOLVED_KEEP_SERVER',
        resolutionNotes: 'Cross tenant resolution check',
      });

    expect(res.status).toBe(404);
    expect(prismaMock.syncConflict.findFirst).toHaveBeenCalledWith({
      where: { id: foreignConflictId, tenantId: TENANT_A_ID },
    });
  });

  it('returns existing issued cheque on duplicate idempotency key without re-running transaction', async () => {
    const app = createApp();
    const token = issueTenantAToken();
    const now = new Date('2026-11-25T10:00:00.000Z');

    configureTenantSessionMock({
      isClientAdmin: true,
      enabledFeatures: [FEATURE_KEYS.NEW_CHEQUE],
    });

    prismaMock.issuedCheque.findUnique.mockResolvedValue({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      tenantId: TENANT_A_ID,
      companyId: COMPANY_A1_ID,
      company: { id: COMPANY_A1_ID, companyCode: 'CMP-A1', companyName: 'Tenant A Primary' },
      bankId: BANK_A_ID,
      bank: { id: BANK_A_ID, bankCode: 'BOC', bankName: 'Bank of Ceylon' },
      bankAccountId: BANK_ACCOUNT_A_ID,
      bankAccount: {
        id: BANK_ACCOUNT_A_ID,
        accountName: 'Operating LKR',
        accountNumber: '1234567890',
        currency: 'LKR',
      },
      chequeBookId: CHEQUE_BOOK_A_ID,
      chequeBook: {
        id: CHEQUE_BOOK_A_ID,
        bookName: 'Main Book',
        chequePrefix: null,
        numberPaddingLength: 6,
      },
      templateId: null,
      template: null,
      chequeNumber: '100001',
      chequeNumberNumeric: 100001,
      chequeDate: now,
      dateFormat: 'DD/MM/YYYY',
      payeeName: 'Ceylon Electricity Board',
      amount: new Prisma.Decimal('1500.00'),
      currency: 'LKR',
      paymentType: 'ACCOUNT_PAYEE',
      cashRecipient: null,
      amountInWords: 'Sri Lankan Rupees One Thousand Five Hundred Only',
      description: null,
      businessStatus: 'ISSUED',
      printingStatus: 'NOT_PRINTED',
      bankingStatus: 'PENDING',
      printCount: 0,
      lastPrintedAt: null,
      clearedAt: null,
      bouncedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      isOfflineCreated: false,
      version: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: USER_A_ID,
    });

    const res = await request(app)
      .post('/api/v1/cheques')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'idem-cheque-0001')
      .send({
        bankAccountId: BANK_ACCOUNT_A_ID,
        chequeBookId: CHEQUE_BOOK_A_ID,
        chequeDate: '2026-11-25',
        payeeName: 'Ceylon Electricity Board',
        amount: '1500.00',
        currency: 'LKR',
        amountInWords: 'Sri Lankan Rupees One Thousand Five Hundred Only',
        idempotencyKey: 'idem-cheque-0001',
      });

    expect(res.status).toBe(200);
    expect(res.body.meta?.deduplicated).toBe(true);
    expect(res.body.data.chequeNumber).toBe('100001');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('deduplicates bank ledger entries by tenantId + idempotencyKey', async () => {
    const existingLedgerRow = {
      id: 'tx-1',
      tenantId: TENANT_A_ID,
      bankAccountId: BANK_ACCOUNT_A_ID,
      debitAmount: new Prisma.Decimal('1500.00'),
      creditAmount: new Prisma.Decimal('0.00'),
      balanceAfterTransaction: new Prisma.Decimal('8500.00'),
    };
    const fakeTx = {
      bankAccountTransaction: {
        findUnique: vi.fn().mockResolvedValue(existingLedgerRow),
        create: vi.fn(),
      },
      bankAccount: {
        findFirst: vi.fn(),
      },
    } as unknown as Prisma.TransactionClient;

    const result = await postLedgerEntryInTx(fakeTx, {
      tenantId: TENANT_A_ID,
      companyId: COMPANY_A1_ID,
      bankAccountId: BANK_ACCOUNT_A_ID,
      transactionDate: new Date('2026-11-25T00:00:00.000Z'),
      transactionType: 'CHEQUE_PAYMENT',
      debitAmount: '1500.00',
      creditAmount: '0.00',
      idempotencyKey: 'ledger-idem-0001',
      createdBy: USER_A_ID,
    });

    expect(result.deduplicated).toBe(true);
    expect(result.transaction).toBe(existingLedgerRow);
    expect(fakeTx.bankAccountTransaction.create).not.toHaveBeenCalled();
  });
});
