import { z } from 'zod';
import {
  decimalAmountSchema,
  paginationQuerySchema,
  uuidSchema,
} from './pagination.js';

export const reportCategoryEnum = z.enum([
  'ISSUED_CHEQUE',
  'RECEIVED_CHEQUE',
  'BANK_ACCOUNT',
  'BANK_TRANSACTION',
  'DAILY_CHEQUE',
  'MONTHLY_CHEQUE',
  'PENDING_CHEQUE',
  'CLEARED_CHEQUE',
  'BOUNCED_CHEQUE',
  'CANCELLED_CHEQUE',
]);

export const reportFilterQuerySchema = paginationQuerySchema.extend({
  category: reportCategoryEnum.default('ISSUED_CHEQUE'),
  companyId: uuidSchema.optional(),
  bankId: uuidSchema.optional(),
  bankAccountId: uuidSchema.optional(),
  chequeNumber: z.string().trim().max(50).optional(),
  payeeName: z.string().trim().max(191).optional(),
  status: z.string().trim().max(40).optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  minAmount: decimalAmountSchema.optional(),
  maxAmount: decimalAmountSchema.optional(),
});

export const exportReportSchema = reportFilterQuerySchema.extend({
  format: z.enum(['PDF', 'EXCEL']),
});

export const backupFileSchema = z.object({
  schemaVersion: z.string().trim().min(1),
  exportedAt: z.string().trim().min(1),
  backupScope: z.literal('TENANT_EXPORT'),
  checksum: z.string().trim().optional(),
  tenant: z.object({
    id: uuidSchema,
    tenantCode: z.string().trim().min(1),
    organizationName: z.string().trim().min(1),
  }),
  data: z.object({
    companies: z.array(z.record(z.unknown())).default([]),
    banks: z.array(z.record(z.unknown())).default([]),
    bankBranches: z.array(z.record(z.unknown())).default([]),
    bankAccounts: z.array(z.record(z.unknown())).default([]),
    chequeBooks: z.array(z.record(z.unknown())).default([]),
    issuedCheques: z.array(z.record(z.unknown())).default([]),
    receivedCheques: z.array(z.record(z.unknown())).default([]),
    bankTransactions: z.array(z.record(z.unknown())).default([]),
    chequeTemplates: z.array(z.record(z.unknown())).default([]),
  }),
});

export const confirmRestoreSchema = z.object({
  confirmed: z.literal(true, {
    errorMap: () => ({ message: 'Explicit confirmation is required before executing restore.' }),
  }),
});

export type ReportCategory = z.infer<typeof reportCategoryEnum>;
export type ReportFilterQueryInput = z.infer<typeof reportFilterQuerySchema>;
export type ExportReportInput = z.infer<typeof exportReportSchema>;
export type BackupFilePayload = z.infer<typeof backupFileSchema>;
