import { describe, expect, it } from 'vitest';
import {
  calculateLedgerBalance,
  calculateNextRunningBalance,
  centsToDecimalString,
  decimalStringToCents,
} from '../src/index.js';

describe('bank ledger decimal arithmetic', () => {
  it('avoids IEEE-754 floating-point drift on monetary sums', () => {
    const balance = calculateLedgerBalance('1000.00', [
      { creditAmount: '0.10', debitAmount: '0.00' },
      { creditAmount: '0.20', debitAmount: '0.00' },
      { creditAmount: '0.00', debitAmount: '0.30' },
    ]);
    expect(balance).toBe('1000.00');

    expect(centsToDecimalString(decimalStringToCents('0.10') + decimalStringToCents('0.20'))).toBe(
      '0.30'
    );
  });

  it('computes Opening Balance + Credits - Debits including reversals and overdrafts', () => {
    const finalBalance = calculateLedgerBalance('50000.00', [
      { creditAmount: '25000.50', debitAmount: '0.00' }, // Deposit
      { creditAmount: '0.00', debitAmount: '12500.25' }, // Cleared issued cheque
      { creditAmount: '12500.25', debitAmount: '0.00' }, // Reversal
      { creditAmount: '0.00', debitAmount: '80000.00' }, // Overdraft withdrawal
    ]);

    expect(finalBalance).toBe('-4999.50');
    expect(calculateNextRunningBalance('100.00', '25.55', '0.00')).toBe('74.45');
  });
});
