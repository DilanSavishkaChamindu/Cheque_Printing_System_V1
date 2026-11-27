import { z } from 'zod';

export const uuidSchema = z.string().uuid('Invalid UUID format');

export const decimalAmountSchema = z
  .union([z.string(), z.number()])
  .transform((val) => (typeof val === 'number' ? val.toFixed(2) : val.trim()))
  .refine((val) => /^\d+(\.\d{1,2})?$/.test(val), {
    message: 'Amount must be a non-negative decimal with at most 2 decimal places',
  });

export const positiveDecimalAmountSchema = decimalAmountSchema.refine(
  (val) => Number(val) > 0,
  { message: 'Amount must be greater than zero' }
);

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().trim().min(1).max(64).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().trim().max(200).optional(),
});

export type PaginationQueryInput = z.infer<typeof paginationQuerySchema>;
