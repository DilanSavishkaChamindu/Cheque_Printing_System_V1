import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  FEATURE_KEYS,
  PERMISSION_CODES,
  TENANT_STATUS,
  type AuthenticatedTenantUser,
} from '@cheque-saas/shared';
import { createApp } from '../src/app.js';
import {
  computeEffectiveFeatures,
  computeEffectivePermissions,
  resolveAuthorizedCompanyId,
} from '../src/core/authorization.js';
import { ForbiddenError } from '../src/core/errors.js';
import {
  hashPassword,
  hashToken,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
} from '../src/utils/crypto.js';
import { sanitizeAuditValue } from '../src/utils/sanitize.js';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'mysql://test:test@localhost:3306/test_db';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-with-more-than-32-characters-123';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-with-more-than-32-characters-456';
});

describe('Phase 2 & 3 security, RBAC, and feature entitlements', () => {
  it('hashes and verifies passwords with Argon2id', async () => {
    const hash = await hashPassword('StrongPass!2026');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'StrongPass!2026')).toBe(true);
    expect(await verifyPassword(hash, 'WrongPassword')).toBe(false);
  });

  it('signs and verifies actor-scoped JWT access tokens and SHA-256 token digests', () => {
    const token = signAccessToken({
      sub: 'user-1',
      actorType: 'TENANT_USER',
      tenantId: 'tenant-1',
      sid: 'session-1',
    });

    const verified = verifyAccessToken(token);
    expect(verified).toMatchObject({
      sub: 'user-1',
      actorType: 'TENANT_USER',
      tenantId: 'tenant-1',
      sid: 'session-1',
    });

    expect(hashToken('opaque-reset-token')).toHaveLength(64);
  });

  it('redacts sensitive secrets from audit log snapshots', () => {
    const sanitized = sanitizeAuditValue({
      username: 'alice',
      password: 'plainPassword',
      passwordHash: '$argon2id$...',
      nested: {
        refreshToken: 'secret-refresh',
        organizationName: 'ABC Trading',
      },
    }) as Record<string, unknown>;

    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.passwordHash).toBe('[REDACTED]');
    expect((sanitized.nested as Record<string, unknown>).refreshToken).toBe('[REDACTED]');
    expect((sanitized.nested as Record<string, unknown>).organizationName).toBe('ABC Trading');
  });

  it('computes effective features respecting global kill-switch, tenant overrides, and expiry', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const catalog = [
      { id: 'f1', key: 'dashboard', isGlobalActive: true, isDefaultEnabled: true },
      { id: 'f2', key: 'companies', isGlobalActive: true, isDefaultEnabled: false },
      { id: 'f3', key: 'reports', isGlobalActive: false, isDefaultEnabled: true },
      { id: 'f4', key: 'templates_calibration', isGlobalActive: true, isDefaultEnabled: true },
    ];

    const overrides = [
      { featureId: 'f2', isEnabled: true, expiresAt: new Date('2026-12-01T00:00:00Z') },
      { featureId: 'f3', isEnabled: true, expiresAt: null }, // blocked by global inactive
      { featureId: 'f4', isEnabled: false, expiresAt: null }, // explicitly disabled for tenant
    ];

    expect(computeEffectiveFeatures(catalog, overrides, now)).toEqual([
      'dashboard',
      'companies',
    ]);

    // After override expires, f2 falls back to disabled
    expect(
      computeEffectiveFeatures(catalog, overrides, new Date('2027-01-01T00:00:00Z'))
    ).toEqual(['dashboard']);
  });

  it('computes effective permissions combining roles, ALLOW overrides, and DENY precedence', () => {
    const effective = computeEffectivePermissions({
      rolePermissions: [
        PERMISSION_CODES.DASHBOARD_VIEW,
        PERMISSION_CODES.CHEQUE_CREATE,
        PERMISSION_CODES.CHEQUE_PRINT,
      ],
      overrides: [
        { code: PERMISSION_CODES.REPORTS_VIEW, effect: 'ALLOW' },
        { code: PERMISSION_CODES.CHEQUE_PRINT, effect: 'DENY' },
      ],
    });

    expect(effective).toContain(PERMISSION_CODES.DASHBOARD_VIEW);
    expect(effective).toContain(PERMISSION_CODES.CHEQUE_CREATE);
    expect(effective).toContain(PERMISSION_CODES.REPORTS_VIEW);
    expect(effective).not.toContain(PERMISSION_CODES.CHEQUE_PRINT);
  });

  it('enforces default company context when Companies feature is disabled and scopes access when enabled', () => {
    const baseUser: AuthenticatedTenantUser = {
      actorType: 'TENANT_USER',
      id: 'u1',
      tenantId: 't1',
      sessionId: 's1',
      deviceId: null,
      email: 'u@abc.com',
      username: 'user1',
      firstName: 'Test',
      lastName: 'User',
      status: 'ACTIVE',
      isClientAdmin: false,
      companyAccessScope: 'SELECTED_COMPANIES',
      allowedCompanyIds: ['comp-1'],
      companies: [{ id: 'comp-1', companyCode: 'C1', companyName: 'Company 1', isDefault: true }],
      permissions: [PERMISSION_CODES.CHEQUE_CREATE],
      roles: ['CHEQUE_OPERATOR'],
      tenant: {
        id: 't1',
        tenantCode: 'ABC',
        organizationName: 'ABC Group',
        status: TENANT_STATUS.ACTIVE,
        defaultCompanyId: 'comp-default',
        enabledFeatures: [FEATURE_KEYS.NEW_CHEQUE],
        defaultCurrency: 'LKR',
        dateFormat: 'DD/MM/YYYY',
        timezone: 'Asia/Colombo',
      },
    };

    // Companies disabled -> always resolves defaultCompanyId, rejects other companyId
    expect(resolveAuthorizedCompanyId(baseUser, undefined)).toBe('comp-default');
    expect(() => resolveAuthorizedCompanyId(baseUser, 'comp-other')).toThrow(ForbiddenError);

    // Companies enabled -> allows authorized company, rejects unauthorized company
    const multiCompanyUser: AuthenticatedTenantUser = {
      ...baseUser,
      tenant: {
        ...baseUser.tenant,
        enabledFeatures: [FEATURE_KEYS.NEW_CHEQUE, FEATURE_KEYS.COMPANIES],
      },
    };
    expect(resolveAuthorizedCompanyId(multiCompanyUser, 'comp-1')).toBe('comp-1');
    expect(() => resolveAuthorizedCompanyId(multiCompanyUser, 'comp-2')).toThrow(ForbiddenError);
  });

  it('returns HTTP 401 for unauthenticated requests to protected endpoints', async () => {
    const app = createApp();

    const [meRes, platformRes, featuresRes, auditRes] = await Promise.all([
      request(app).get('/api/v1/auth/me'),
      request(app).get('/api/v1/platform/tenants'),
      request(app).get('/api/v1/features/my'),
      request(app).get('/api/v1/audit-logs'),
    ]);

    expect(meRes.status).toBe(401);
    expect(platformRes.status).toBe(401);
    expect(featuresRes.status).toBe(401);
    expect(auditRes.status).toBe(401);
  });

  it('rejects tenant-user token when accessing Platform Admin endpoints (403)', async () => {
    const app = createApp();
    const tenantToken = signAccessToken({
      sub: 'user-1',
      actorType: 'TENANT_USER',
      tenantId: 'tenant-1',
      sid: 'session-1',
    });

    const res = await request(app)
      .get('/api/v1/platform/tenants')
      .set('Authorization', `Bearer ${tenantToken}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PLATFORM_ACCESS_REQUIRED');
  });

  it('rejects platform-admin token when accessing Tenant endpoints (403)', async () => {
    const app = createApp();
    const platformToken = signAccessToken({
      sub: 'admin-1',
      actorType: 'PLATFORM_ADMIN',
      sid: 'psess-1',
    });

    const res = await request(app)
      .get('/api/v1/tenants/current')
      .set('Authorization', `Bearer ${platformToken}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_USER_REQUIRED');
  });
});
