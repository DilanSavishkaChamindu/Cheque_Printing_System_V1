import { z } from 'zod';
import {
  decimalAmountSchema,
  paginationQuerySchema,
  positiveDecimalAmountSchema,
  uuidSchema,
} from './pagination.js';

export const paymentTypeEnum = z.enum(['ACCOUNT_PAYEE', 'CASH']);
export const chequeDateFormatEnum = z.enum(['DD/MM/YYYY', 'DDMMYYYY', 'DD MMM YYYY']);
export const chequeBusinessStatusEnum = z.enum(['DRAFT', 'ISSUED', 'CANCELLED']);
export const chequePrintingStatusEnum = z.enum(['NOT_PRINTED', 'PRINTED', 'PRINT_FAILED']);
export const chequeBankingStatusEnum = z.enum([
  'PENDING',
  'PRESENTED',
  'CLEARED',
  'BOUNCED',
  'STOPPED',
  'POSTPONED',
]);

// Cheque Books & Allocations
export const createChequeBookSchema = z
  .object({
    companyId: uuidSchema.optional(),
    bankAccountId: uuidSchema,
    bookName: z.string().trim().min(2).max(120),
    chequePrefix: z.string().trim().max(20).nullable().optional(),
    startingNumber: z.coerce.number().int().min(1).max(999999999),
    endingNumber: z.coerce.number().int().min(1).max(999999999),
    numberPaddingLength: z.coerce.number().int().min(1).max(12).default(6),
    issuedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .refine((data) => data.endingNumber >= data.startingNumber, {
    message: 'Ending cheque number must be greater than or equal to starting number',
    path: ['endingNumber'],
  })
  .refine((data) => data.endingNumber - data.startingNumber + 1 <= 5000, {
    message: 'A single cheque book cannot exceed 5,000 leaves',
    path: ['endingNumber'],
  });

export const updateChequeBookStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'CANCELLED']),
});

export const listChequeBooksQuerySchema = paginationQuerySchema.extend({
  companyId: uuidSchema.optional(),
  bankAccountId: uuidSchema.optional(),
  status: z.enum(['ACTIVE', 'EXHAUSTED', 'INACTIVE', 'CANCELLED']).optional(),
});

export const createChequeAllocationSchema = z
  .object({
    deviceId: uuidSchema.nullable().optional(),
    assignedUserId: uuidSchema.nullable().optional(),
    rangeStart: z.coerce.number().int().min(1),
    rangeEnd: z.coerce.number().int().min(1),
    allocationType: z.enum(['ONLINE_SINGLE', 'OFFLINE_RANGE']).default('OFFLINE_RANGE'),
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .refine((data) => data.rangeEnd >= data.rangeStart, {
    message: 'Range end must be greater than or equal to range start',
    path: ['rangeEnd'],
  });

// Issued Cheques
export const createIssuedChequeSchema = z
  .object({
    companyId: uuidSchema.optional(),
    bankAccountId: uuidSchema,
    chequeBookId: uuidSchema,
    templateId: uuidSchema.nullable().optional(),
    chequeNumber: z.string().trim().min(1).max(50).optional(),
    chequeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD date format'),
    dateFormat: chequeDateFormatEnum.default('DD/MM/YYYY'),
    payeeName: z.string().trim().min(1, 'Payee name is required').max(191),
    amount: positiveDecimalAmountSchema,
    currency: z.string().trim().min(3).max(10).default('LKR'),
    paymentType: paymentTypeEnum.default('ACCOUNT_PAYEE'),
    cashRecipient: z.string().trim().max(191).nullable().optional(),
    amountInWords: z.string().trim().min(3, 'Amount in words is required').max(500),
    description: z.string().trim().max(1000).nullable().optional(),
    issueImmediately: z.boolean().default(true),
    idempotencyKey: z.string().trim().min(8).max(128).optional(),
  })
  .refine(
    (data) =>
      data.paymentType !== 'CASH' ||
      !data.cashRecipient ||
      data.cashRecipient.trim().length > 0,
    { message: 'Invalid cash recipient' }
  );

export const updateIssuedChequeSchema = z.object({
  chequeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateFormat: chequeDateFormatEnum.optional(),
  payeeName: z.string().trim().min(1).max(191).optional(),
  amount: positiveDecimalAmountSchema.optional(),
  currency: z.string().trim().min(3).max(10).optional(),
  paymentType: paymentTypeEnum.optional(),
  cashRecipient: z.string().trim().max(191).nullable().optional(),
  amountInWords: z.string().trim().min(3).max(500).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  templateId: uuidSchema.nullable().optional(),
  expectedVersion: z.coerce.number().int().min(1),
});

export const updateChequeBankingStatusSchema = z.object({
  bankingStatus: chequeBankingStatusEnum,
  reason: z.string().trim().max(500).optional(),
  expectedVersion: z.coerce.number().int().min(1).optional(),
});

export const cancelChequeSchema = z.object({
  reason: z.string().trim().min(3, 'Cancellation reason is required').max(500),
});

export const recordChequePrintSchema = z.object({
  templateId: uuidSchema.nullable().optional(),
  calibrationProfileId: uuidSchema.nullable().optional(),
  jobType: z.enum(['INITIAL_PRINT', 'REPRINT', 'TEST_PRINT', 'PDF_EXPORT']).default('INITIAL_PRINT'),
  status: z.enum(['SUCCESS', 'FAILED']).default('SUCCESS'),
  printerName: z.string().trim().max(191).nullable().optional(),
  paperSize: z.string().trim().max(64).nullable().optional(),
  scalePercent: z.coerce.number().min(10).max(200).optional(),
  errorMessage: z.string().trim().max(500).nullable().optional(),
});

export const listChequesQuerySchema = paginationQuerySchema.extend({
  companyId: uuidSchema.optional(),
  bankId: uuidSchema.optional(),
  bankAccountId: uuidSchema.optional(),
  chequeNumber: z.string().trim().max(50).optional(),
  payeeName: z.string().trim().max(191).optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  businessStatus: chequeBusinessStatusEnum.optional(),
  printingStatus: chequePrintingStatusEnum.optional(),
  bankingStatus: chequeBankingStatusEnum.optional(),
  minAmount: decimalAmountSchema.optional(),
  maxAmount: decimalAmountSchema.optional(),
});

export type CreateChequeBookInput = z.infer<typeof createChequeBookSchema>;
export type ListChequeBooksQueryInput = z.infer<typeof listChequeBooksQuerySchema>;
export type CreateChequeAllocationInput = z.infer<typeof createChequeAllocationSchema>;
export type CreateIssuedChequeInput = z.infer<typeof createIssuedChequeSchema>;
export type UpdateIssuedChequeInput = z.infer<typeof updateIssuedChequeSchema>;
export type UpdateChequeBankingStatusInput = z.infer<typeof updateChequeBankingStatusSchema>;
export type CancelChequeInput = z.infer<typeof cancelChequeSchema>;
export type RecordChequePrintInput = z.infer<typeof recordChequePrintSchema>;
export type ListChequesQueryInput = z.infer<typeof listChequesQuerySchema>;
