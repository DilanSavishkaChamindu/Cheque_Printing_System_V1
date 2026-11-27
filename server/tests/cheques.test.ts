import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { rangesOverlap } from '../src/modules/cheque-books/chequeBook.service.js';

describe('Phase 5 cheque books and issued cheques', () => {
  it('detects overlapping cheque number ranges accurately', () => {
    expect(rangesOverlap(100, 150, 150, 200)).toBe(true);
    expect(rangesOverlap(100, 150, 120, 130)).toBe(true);
    expect(rangesOverlap(100, 150, 151, 200)).toBe(false);
    expect(rangesOverlap(201, 250, 100, 200)).toBe(false);
  });

  it('blocks unauthenticated access to cheque books and issued cheques (401)', async () => {
    const app = createApp();
    const responses = await Promise.all([
      request(app).get('/api/v1/cheque-books'),
      request(app).get('/api/v1/cheques/creation-context'),
      request(app).get('/api/v1/cheques'),
      request(app).post('/api/v1/cheques').send({}),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(401);
    }
  });
});
