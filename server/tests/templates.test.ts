import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { DEFAULT_TEMPLATE_FIELDS } from '../src/modules/templates/template.service.js';

describe('Phase 6 templates and calibration', () => {
  it('defines default template field layout covering date, payee, amount, words, and crossings', () => {
    const keys = DEFAULT_TEMPLATE_FIELDS.map((f) => f.fieldKey);
    expect(keys).toContain('CHEQUE_DATE');
    expect(keys).toContain('PAYEE_NAME');
    expect(keys).toContain('AMOUNT_NUMBER');
    expect(keys).toContain('AMOUNT_WORDS_LINE_1');
    expect(keys).toContain('PAYMENT_TYPE_MARK');
  });

  it('blocks unauthenticated access to templates, calibration, and cheque PDF routes (401)', async () => {
    const app = createApp();
    const responses = await Promise.all([
      request(app).get('/api/v1/cheque-templates'),
      request(app).get('/api/v1/calibration'),
      request(app).get('/api/v1/cheques/11111111-1111-4111-8111-111111111111/pdf'),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(401);
    }
  });
});
