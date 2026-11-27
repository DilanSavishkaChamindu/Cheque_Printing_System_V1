import {
  CHEQUE_BANKING_STATUS,
  CHEQUE_BUSINESS_STATUS,
  RECEIVED_CHEQUE_STATUS,
  type ChequeBankingStatus,
  type ChequeBusinessStatus,
  type ChequePrintingStatus,
  type ReceivedChequeStatus,
} from '../constants/statuses.js';

const BANKING_TRANSITIONS: Record<ChequeBankingStatus, readonly ChequeBankingStatus[]> = {
  [CHEQUE_BANKING_STATUS.PENDING]: [
    CHEQUE_BANKING_STATUS.PRESENTED,
    CHEQUE_BANKING_STATUS.POSTPONED,
    CHEQUE_BANKING_STATUS.CLEARED,
    CHEQUE_BANKING_STATUS.STOPPED,
  ],
  [CHEQUE_BANKING_STATUS.POSTPONED]: [
    CHEQUE_BANKING_STATUS.PENDING,
    CHEQUE_BANKING_STATUS.PRESENTED,
    CHEQUE_BANKING_STATUS.STOPPED,
  ],
  [CHEQUE_BANKING_STATUS.PRESENTED]: [
    CHEQUE_BANKING_STATUS.CLEARED,
    CHEQUE_BANKING_STATUS.BOUNCED,
    CHEQUE_BANKING_STATUS.POSTPONED,
    CHEQUE_BANKING_STATUS.STOPPED,
  ],
  [CHEQUE_BANKING_STATUS.BOUNCED]: [
    CHEQUE_BANKING_STATUS.PRESENTED,
    CHEQUE_BANKING_STATUS.STOPPED,
  ],
  [CHEQUE_BANKING_STATUS.CLEARED]: [],
  [CHEQUE_BANKING_STATUS.STOPPED]: [],
};

const RECEIVED_TRANSITIONS: Record<ReceivedChequeStatus, readonly ReceivedChequeStatus[]> = {
  [RECEIVED_CHEQUE_STATUS.RECEIVED]: [
    RECEIVED_CHEQUE_STATUS.PENDING_DEPOSIT,
    RECEIVED_CHEQUE_STATUS.DEPOSITED,
    RECEIVED_CHEQUE_STATUS.RETURNED,
    RECEIVED_CHEQUE_STATUS.CANCELLED,
  ],
  [RECEIVED_CHEQUE_STATUS.PENDING_DEPOSIT]: [
    RECEIVED_CHEQUE_STATUS.DEPOSITED,
    RECEIVED_CHEQUE_STATUS.RETURNED,
    RECEIVED_CHEQUE_STATUS.CANCELLED,
  ],
  [RECEIVED_CHEQUE_STATUS.DEPOSITED]: [
    RECEIVED_CHEQUE_STATUS.CLEARED,
    RECEIVED_CHEQUE_STATUS.BOUNCED,
    RECEIVED_CHEQUE_STATUS.RETURNED,
  ],
  [RECEIVED_CHEQUE_STATUS.BOUNCED]: [
    RECEIVED_CHEQUE_STATUS.PENDING_DEPOSIT,
    RECEIVED_CHEQUE_STATUS.DEPOSITED,
    RECEIVED_CHEQUE_STATUS.RETURNED,
  ],
  [RECEIVED_CHEQUE_STATUS.CLEARED]: [],
  [RECEIVED_CHEQUE_STATUS.RETURNED]: [],
  [RECEIVED_CHEQUE_STATUS.CANCELLED]: [],
};

export function isValidBankingStatusTransition(
  current: ChequeBankingStatus,
  next: ChequeBankingStatus
): boolean {
  if (current === next) {
    return false;
  }
  return BANKING_TRANSITIONS[current].includes(next);
}

export function isValidReceivedChequeTransition(
  current: ReceivedChequeStatus,
  next: ReceivedChequeStatus
): boolean {
  if (current === next) {
    return false;
  }
  return RECEIVED_TRANSITIONS[current].includes(next);
}

export function canEditChequeRecord(cheque: {
  businessStatus: ChequeBusinessStatus;
  printingStatus: ChequePrintingStatus;
  bankingStatus: ChequeBankingStatus;
}): { allowed: boolean; reason?: string } {
  if (cheque.businessStatus === CHEQUE_BUSINESS_STATUS.CANCELLED) {
    return { allowed: false, reason: 'Cancelled cheques cannot be modified.' };
  }
  if (cheque.bankingStatus === CHEQUE_BANKING_STATUS.CLEARED) {
    return { allowed: false, reason: 'Cleared cheques are finalized and locked.' };
  }
  if (cheque.bankingStatus === CHEQUE_BANKING_STATUS.STOPPED) {
    return { allowed: false, reason: 'Stopped cheques cannot be modified.' };
  }
  if (cheque.printingStatus === 'PRINTED') {
    return {
      allowed: false,
      reason: 'Printed cheques cannot have core financial fields modified.',
    };
  }
  return { allowed: true };
}

export function formatChequeNumber(
  prefix: string | null | undefined,
  numericNumber: number,
  paddingLength = 6
): string {
  const padded = String(numericNumber).padStart(paddingLength, '0');
  return prefix ? `${prefix}${padded}` : padded;
}
