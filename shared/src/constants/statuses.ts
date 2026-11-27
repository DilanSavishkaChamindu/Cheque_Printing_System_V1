export const TENANT_STATUS = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  INACTIVE: 'INACTIVE',
  EXPIRED: 'EXPIRED',
} as const;

export type TenantStatus = (typeof TENANT_STATUS)[keyof typeof TENANT_STATUS];

export const USER_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;

export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

export const PAYMENT_TYPE = {
  ACCOUNT_PAYEE: 'ACCOUNT_PAYEE',
  CASH: 'CASH',
} as const;

export type PaymentType = (typeof PAYMENT_TYPE)[keyof typeof PAYMENT_TYPE];

export const CHEQUE_BUSINESS_STATUS = {
  DRAFT: 'DRAFT',
  ISSUED: 'ISSUED',
  CANCELLED: 'CANCELLED',
} as const;

export type ChequeBusinessStatus =
  (typeof CHEQUE_BUSINESS_STATUS)[keyof typeof CHEQUE_BUSINESS_STATUS];

export const CHEQUE_PRINTING_STATUS = {
  NOT_PRINTED: 'NOT_PRINTED',
  PRINTED: 'PRINTED',
  PRINT_FAILED: 'PRINT_FAILED',
} as const;

export type ChequePrintingStatus =
  (typeof CHEQUE_PRINTING_STATUS)[keyof typeof CHEQUE_PRINTING_STATUS];

export const CHEQUE_BANKING_STATUS = {
  PENDING: 'PENDING',
  PRESENTED: 'PRESENTED',
  CLEARED: 'CLEARED',
  BOUNCED: 'BOUNCED',
  STOPPED: 'STOPPED',
  POSTPONED: 'POSTPONED',
} as const;

export type ChequeBankingStatus =
  (typeof CHEQUE_BANKING_STATUS)[keyof typeof CHEQUE_BANKING_STATUS];

export const RECEIVED_CHEQUE_STATUS = {
  RECEIVED: 'RECEIVED',
  PENDING_DEPOSIT: 'PENDING_DEPOSIT',
  DEPOSITED: 'DEPOSITED',
  CLEARED: 'CLEARED',
  BOUNCED: 'BOUNCED',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
} as const;

export type ReceivedChequeStatus =
  (typeof RECEIVED_CHEQUE_STATUS)[keyof typeof RECEIVED_CHEQUE_STATUS];

export const BANK_TRANSACTION_TYPE = {
  OPENING_BALANCE: 'OPENING_BALANCE',
  DEPOSIT: 'DEPOSIT',
  WITHDRAWAL: 'WITHDRAWAL',
  CHEQUE_PAYMENT: 'CHEQUE_PAYMENT',
  RECEIVED_CHEQUE_DEPOSIT: 'RECEIVED_CHEQUE_DEPOSIT',
  ADJUSTMENT: 'ADJUSTMENT',
  REVERSAL: 'REVERSAL',
} as const;

export type BankTransactionType =
  (typeof BANK_TRANSACTION_TYPE)[keyof typeof BANK_TRANSACTION_TYPE];

export const SYNC_OPERATION_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SYNCHRONIZED: 'SYNCHRONIZED',
  CONFLICT: 'CONFLICT',
  FAILED: 'FAILED',
  REJECTED: 'REJECTED',
} as const;

export type SyncOperationStatus =
  (typeof SYNC_OPERATION_STATUS)[keyof typeof SYNC_OPERATION_STATUS];

export const DEVICE_STATUS = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  REVOKED: 'REVOKED',
} as const;

export type DeviceStatus = (typeof DEVICE_STATUS)[keyof typeof DEVICE_STATUS];

export const BANK_ACCOUNT_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  CLOSED: 'CLOSED',
  FROZEN: 'FROZEN',
} as const;

export type BankAccountStatus =
  (typeof BANK_ACCOUNT_STATUS)[keyof typeof BANK_ACCOUNT_STATUS];
