import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/offlineDb', () => ({
  offlineDb: {},
}));

import { computeSyncBackoffMs } from '../src/services/syncEngine';

describe('Phase 9 offline sync engine', () => {
  it('computes bounded exponential retry backoff from 2s up to 300s cap', () => {
    expect(computeSyncBackoffMs(-1)).toBe(2_000);
    expect(computeSyncBackoffMs(0)).toBe(2_000);
    expect(computeSyncBackoffMs(1)).toBe(4_000);
    expect(computeSyncBackoffMs(2)).toBe(8_000);
    expect(computeSyncBackoffMs(7)).toBe(256_000);
    expect(computeSyncBackoffMs(8)).toBe(300_000);
    expect(computeSyncBackoffMs(25)).toBe(300_000);
  });
});
