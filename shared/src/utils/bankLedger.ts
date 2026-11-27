/**
 * Exact integer-cent monetary arithmetic utilities to prevent floating-point drift
 * in bank ledger balance calculations and reconciliation.
 */

export function decimalStringToCents(amount: string | number): bigint {
  const raw = typeof amount === 'number' ? amount.toFixed(2) : amount.trim();
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) {
    throw new Error(`Invalid monetary amount '${raw}'`);
  }

  const sign = match[1] === '-' ? -1n : 1n;
  const whole = BigInt(match[2] ?? '0');
  const fracStr = (match[3] ?? '').padEnd(2, '0');
  const cents = BigInt(fracStr || '0');

  return sign * (whole * 100n + cents);
}

export function centsToDecimalString(cents: bigint): string {
  const isNegative = cents < 0n;
  const abs = isNegative ? -cents : cents;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${isNegative ? '-' : ''}${whole.toString()}.${frac}`;
}

export interface LedgerEntryAmounts {
  debitAmount: string | number;
  creditAmount: string | number;
}

export function calculateLedgerBalance(
  openingBalance: string | number,
  entriesExcludingOpening: readonly LedgerEntryAmounts[]
): string {
  let balanceCents = decimalStringToCents(openingBalance);

  for (const entry of entriesExcludingOpening) {
    const creditCents = decimalStringToCents(entry.creditAmount);
    const debitCents = decimalStringToCents(entry.debitAmount);
    balanceCents += creditCents - debitCents;
  }

  return centsToDecimalString(balanceCents);
}

export function calculateNextRunningBalance(
  currentBalance: string | number,
  debitAmount: string | number,
  creditAmount: string | number
): string {
  const currentCents = decimalStringToCents(currentBalance);
  const creditCents = decimalStringToCents(creditAmount);
  const debitCents = decimalStringToCents(debitAmount);
  return centsToDecimalString(currentCents + creditCents - debitCents);
}
