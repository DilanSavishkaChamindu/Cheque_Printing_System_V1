import { describe, expect, it } from 'vitest';
import {
  INITIAL_FEATURE_CATALOG,
  INITIAL_PERMISSION_CATALOG,
  paginationQuerySchema,
  positiveDecimalAmountSchema,
} from '../src/index.js';

describe('shared constants and validation', () => {
  it('defines all 11 initial platform features with unique keys', () => {
    const keys = INITIAL_FEATURE_CATALOG.map((f) => f.key);
    expect(keys).toHaveLength(11);
    expect(new Set(keys).size).toBe(11);
  });

  it('defines unique permission codes', () => {
    const codes = INITIAL_PERMISSION_CATALOG.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('enforces bounded pagination defaults and max limit', () => {
    expect(paginationQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 20,
      sortOrder: 'desc',
    });
    expect(() => paginationQuerySchema.parse({ limit: 500 })).toThrow();
  });

  it('validates positive monetary amounts cleanly', () => {
    expect(positiveDecimalAmountSchema.parse('1250.50')).toBe('1250.50');
    expect(positiveDecimalAmountSchema.parse(42)).toBe('42.00');
    expect(() => positiveDecimalAmountSchema.parse('0')).toThrow();
    expect(() => positiveDecimalAmountSchema.parse('12.345')).toThrow();
  });
});
