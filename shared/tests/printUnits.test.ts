import { describe, expect, it } from 'vitest';
import {
  inchesToMm,
  mmToInches,
  mmToPdfPoints,
  splitAmountWordsTwoLines,
} from '../src/index.js';

describe('physical print unit conversions and word wrapping', () => {
  it('converts millimeters, inches, and PDF points accurately', () => {
    expect(inchesToMm(1)).toBe(25.4);
    expect(mmToInches(25.4)).toBe(1);
    expect(mmToInches(178)).toBeCloseTo(7.0079, 4);
    expect(mmToPdfPoints(25.4)).toBeCloseTo(72, 4);
  });

  it('splits long amount-in-words across two cheque lines on word boundaries', () => {
    const result = splitAmountWordsTwoLines(
      'One Hundred Twenty-Five Thousand Four Hundred Sixty-Seven Rupees and Fifty Cents Only',
      45
    );
    expect(result.line1.length).toBeLessThanOrEqual(45);
    expect(`${result.line1} ${result.line2}`).toBe(
      'One Hundred Twenty-Five Thousand Four Hundred Sixty-Seven Rupees and Fifty Cents Only'
    );
  });
});
