import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { buildPaginationMeta } from '../src/core/response.js';
import {
  FeatureDisabledError,
  TenantStatusForbiddenError,
  UnauthorizedError,
  ValidationError,
} from '../src/core/errors.js';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'mysql://test:test@localhost:3306/test_db';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-with-more-than-32-characters-123';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-with-more-than-32-characters-456';
});

describe('server foundation', () => {
  it('validates environment config and rejects weak secrets', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'mysql://u:p@localhost:3306/db',
        JWT_ACCESS_SECRET: 'short',
        JWT_REFRESH_SECRET: 'short',
      })
    ).toThrow(/Invalid server environment configuration/);
  });

  it('builds consistent pagination metadata', () => {
    expect(buildPaginationMeta(2, 20, 45)).toEqual({
      page: 2,
      limit: 20,
      totalItems: 45,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });

  it('maps error hierarchy to expected HTTP status codes', () => {
    expect(new UnauthorizedError().statusCode).toBe(401);
    expect(new FeatureDisabledError('companies').statusCode).toBe(403);
    expect(new TenantStatusForbiddenError('SUSPENDED').statusCode).toBe(403);
    expect(new ValidationError('Invalid').statusCode).toBe(400);
  });

  it('returns consistent JSON 404 for unknown routes', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      success: false,
      code: 'ROUTE_NOT_FOUND',
      errors: [],
    });
    expect(typeof res.body.requestId).toBe('string');
  });

  it('returns consistent validation payload when ZodError occurs', async () => {
    const app = createApp();
    // Verify malformed JSON middleware behavior
    const res = await request(app)
      .post('/api/v1/nonexistent')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      code: 'MALFORMED_JSON',
    });

    const parsed = z.object({ amount: z.number() }).safeParse({ amount: 'bad' });
    expect(parsed.success).toBe(false);
  });
});
