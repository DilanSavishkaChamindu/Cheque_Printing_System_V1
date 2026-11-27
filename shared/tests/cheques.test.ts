import { describe, expect, it } from 'vitest';
import {
  canEditChequeRecord,
  CHEQUE_BANKING_STATUS,
  CHEQUE_BUSINESS_STATUS,
  CHEQUE_PRINTING_STATUS,
  convertAmountToWords,
  formatChequeNumber,
  isValidBankingStatusTransition,
  isValidReceivedChequeTransition,
  RECEIVED_CHEQUE_STATUS,
  verifyAmountInWordsMatch,
} from '../src/index.js';

describe('amount-in-words conversion and verification', () => {
  it('converts integer and decimal LKR/USD amounts accurately without float drift', () => {
    expect(convertAmountToWords('1.00', { currencyCode: 'LKR' })).toBe('One Rupee Only');
    expect(convertAmountToWords('12500.50', { currencyCode: 'LKR' })).toBe(
      'Twelve Thousand Five Hundred Rupees and Fifty Cents Only'
    );
    expect(convertAmountToWords('1000000.01', { currencyCode: 'USD' })).toBe(
      'One Million Dollars and One Cent Only'
    );
    expect(convertAmountToWords('9876543210.99', { currencyCode: 'LKR' })).toBe(
      'Nine Billion Eight Hundred Seventy-Six Million Five Hundred Forty-Three Thousand Two Hundred Ten Rupees and Ninety-Nine Cents Only'
    );
  });

  it('validates that amount in words matches numeric amount regardless of case or hyphens', () => {
    expect(
      verifyAmountInWordsMatch(
        '2500.75',
        'LKR',
        'two thousand five hundred rupees and seventy five cents only'
      )
    ).toBe(true);

    expect(
      verifyAmountInWordsMatch(
        '2500.75',
        'LKR',
        'Two Thousand Five Hundred Rupees Only'
      )
    ).toBe(false);
  });
});

describe('cheque lifecycle and formatting', () => {
  it('enforces valid banking status transitions and terminal locks', () => {
    expect(
      isValidBankingStatusTransition(
        CHEQUE_BANKING_STATUS.PENDING,
        CHEQUE_BANKING_STATUS.PRESENTED
      )
    ).toBe(true);

    expect(
      isValidBankingStatusTransition(
        CHEQUE_BANKING_STATUS.CLEARED,
        CHEQUE_BANKING_STATUS.BOUNCED
      )
    ).toBe(false);

    expect(
      isValidBankingStatusTransition(
        CHEQUE_BANKING_STATUS.STOPPED,
        CHEQUE_BANKING_STATUS.PENDING
      )
    ).toBe(false);

    expect(
      isValidReceivedChequeTransition(
        RECEIVED_CHEQUE_STATUS.DEPOSITED,
        RECEIVED_CHEQUE_STATUS.CLEARED
      )
    ).toBe(true);

    expect(
      isValidReceivedChequeTransition(
        RECEIVED_CHEQUE_STATUS.CLEARED,
        RECEIVED_CHEQUE_STATUS.RETURNED
      )
    ).toBe(false);
  });

  it('prevents editing finalized, printed, cleared, or cancelled cheques', () => {
    expect(
      canEditChequeRecord({
        businessStatus: CHEQUE_BUSINESS_STATUS.DRAFT,
        printingStatus: CHEQUE_PRINTING_STATUS.NOT_PRINTED,
        bankingStatus: CHEQUE_BANKING_STATUS.PENDING,
      }).allowed
    ).toBe(true);

    expect(
      canEditChequeRecord({
        businessStatus: CHEQUE_BUSINESS_STATUS.ISSUED,
        printingStatus: CHEQUE_PRINTING_STATUS.PRINTED,
        bankingStatus: CHEQUE_BANKING_STATUS.PENDING,
      }).allowed
    ).toBe(false);

    expect(
      canEditChequeRecord({
        businessStatus: CHEQUE_BUSINESS_STATUS.CANCELLED,
        printingStatus: CHEQUE_PRINTING_STATUS.NOT_PRINTED,
        bankingStatus: CHEQUE_BANKING_STATUS.PENDING,
      }).allowed
    ).toBe(false);
  });

  it('formats cheque numbers with padding and optional prefix', () => {
    expect(formatChequeNumber(null, 42, 6)).toBe('000042');
    expect(formatChequeNumber('BOC-', 105, 6)).toBe('BOC-000105');
  });
});
