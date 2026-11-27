import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('Phase 7 bank ledger and received cheques security', () => {
  it('blocks unauthenticated requests to bank-transactions and received-cheques (401)', async () => {
    const app = createApp();
    const responses = await Promise.all([
      request(app).get('/api/v1/bank-transactions'),
      request(app).get('/api/v1/bank-transactions/summary'),
      request(app).post('/api/v1/bank-transactions').send({}),
      request(app).get('/api/v1/received-cheques'),
      request(app).post('/api/v1/received-cheques').send({}),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(401);
    }
  });
});
