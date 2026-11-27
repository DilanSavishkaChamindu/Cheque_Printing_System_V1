import { z } from 'zod';
import {
  decimalAmountSchema,
  paginationQuerySchema,
  positiveDecimalAmountSchema,
  uuidSchema,
} from './pagination.js';

export const receivedChequeStatusEnum = z.enum([
  'RECEIVED',
  'PENDING_DEPOSIT',
  'DEPOSITED',
  'CLEARED',
  'BOUNCED',
  'RETURNED',
  'CANCELLED',
]);

export const bankTransactionTypeEnum = z.enum([
  'OPENING_BALANCE',
  'DEPOSIT',
  'WITHDRAWAL',
  'CHEQUE_PAYMENT',
  'RECEIVED_CHEQUE_DEPOSIT',
  'ADJUSTMENT',
  'REVERSAL',
]);

// Received Cheques
export const createReceivedChequeSchema = z.object({
  companyId: uuidSchema.optional(),
  chequeNumber: z.string().trim().min(1).max(50),
  chequeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD date format'),
  receivedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD date format'),
  bankId: uuidSchema.nullable().optional(),
  bankName: z.string().trim().min(2).max(191),
  branchName: z.string().trim().max(191).nullable().optional(),
  receivedFrom: z.string().trim().min(2).max(191),
  amount: positiveDecimalAmountSchema,
  currency: z.string().trim().min(3).max(10).default('LKR'),
  depositBankAccountId: uuidSchema.nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(['RECEIVED', 'PENDING_DEPOSIT']).default('RECEIVED'),
});

export const updateReceivedChequeSchema = z.object({
  chequeNumber: z.string().trim().min(1).max(50).optional(),
  chequeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  receivedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  bankId: uuidSchema.nullable().optional(),
  bankName: z.string().trim().min(2).max(191).optional(),
  branchName: z.string().trim().max(191).nullable().optional(),
  receivedFrom: z.string().trim().min(2).max(191).optional(),
  amount: positiveDecimalAmountSchema.optional(),
  currency: z.string().trim().min(3).max(10).optional(),
  depositBankAccountId: uuidSchema.nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  expectedVersion: z.coerce.number().int().min(1),
});

export const updateReceivedChequeStatusSchema = z.object({
  status: receivedChequeStatusEnum,
  depositBankAccountId: uuidSchema.nullable().optional(),
  reason: z.string().trim().max(500).optional(),
  expectedVersion: z.coerce.number().int().min(1).optional(),
});

export const listReceivedChequesQuerySchema = paginationQuerySchema.extend({
  companyId: uuidSchema.optional(),
  status: receivedChequeStatusEnum.optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  minAmount: decimalAmountSchema.optional(),
  maxAmount: decimalAmountSchema.optional(),
});

// Bank Ledger Transactions
export const createBankTransactionSchema = z
  .object({
    bankAccountId: uuidSchema,
    transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    transactionType: z.enum(['DEPOSIT', 'WITHDRAWAL', 'ADJUSTMENT']),
    adjustmentDirection: z.enum(['CREDIT', 'DEBIT']).optional(),
    amount: positiveDecimalAmountSchema,
    referenceNumber: z.string().trim().max(100).nullable().optional(),
    description: z.string().trim().min(2, 'Description is required').max(1000),
    idempotencyKey: z.string().trim().min(8).max(128).optional(),
  })
  .refine(
    (data) =>
      data.transactionType !== 'ADJUSTMENT' ||
      data.adjustmentDirection === 'CREDIT' ||
      data.adjustmentDirection === 'DEBIT',
    {
      message: 'Adjustment direction (CREDIT or DEBIT) is required for adjustments',
      path: ['adjustmentDirection'],
    }
  );

export const reverseBankTransactionSchema = z.object({
  reason: z.string().trim().min(3, 'Reversal reason is required').max(500),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

export const listBankTransactionsQuerySchema = paginationQuerySchema.extend({
  companyId: uuidSchema.optional(),
  bankAccountId: uuidSchema.optional(),
  transactionType: bankTransactionTypeEnum.optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type CreateReceivedChequeInput = z.infer<typeof createReceivedChequeSchema>;
export type UpdateReceivedChequeInput = z.infer<typeof updateReceivedChequeSchema>;
export type UpdateReceivedChequeStatusInput = z.infer<typeof updateReceivedChequeStatusSchema>;
export type ListReceivedChequesQueryInput = z.infer<typeof listReceivedChequesQuerySchema>;
export type CreateBankTransactionInput = z.infer<typeof createBankTransactionSchema>;
export type ReverseBankTransactionInput = z.infer<typeof reverseBankTransactionSchema>;
export type ListBankTransactionsQueryInput = z.infer<typeof listBankTransactionsQuerySchema>;
