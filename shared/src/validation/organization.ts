import { z } from 'zod';
import { passwordStrengthSchema } from './auth.js';
import {
  decimalAmountSchema,
  paginationQuerySchema,
  uuidSchema,
} from './pagination.js';

export const recordStatusEnum = z.enum(['ACTIVE', 'INACTIVE']);
export const userStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']);
export const companyAccessScopeEnum = z.enum(['ALL_COMPANIES', 'SELECTED_COMPANIES']);
export const bankAccountTypeEnum = z.enum(['CURRENT', 'SAVINGS', 'OVERDRAFT', 'OTHER']);
export const bankAccountStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'CLOSED', 'FROZEN']);

// Companies
export const createCompanySchema = z.object({
  companyCode: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, 'Company code may only contain letters, numbers, hyphens, and underscores')
    .transform((v) => v.toUpperCase()),
  companyName: z.string().trim().min(2).max(191),
  registeredBusinessName: z.string().trim().max(191).nullable().optional(),
  registrationNumber: z.string().trim().max(100).nullable().optional(),
  address: z.string().trim().max(1000).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  country: z.string().trim().max(100).nullable().optional(),
  email: z.string().trim().email().max(191).nullable().optional(),
  contactNumber: z.string().trim().max(50).nullable().optional(),
  website: z.string().trim().max(191).nullable().optional(),
  logoUrl: z.string().trim().max(500).nullable().optional(),
});

export const updateCompanySchema = createCompanySchema.partial().omit({ companyCode: true });

export const updateRecordStatusSchema = z.object({
  status: recordStatusEnum,
});

export const listCompaniesQuerySchema = paginationQuerySchema.extend({
  status: recordStatusEnum.optional(),
});

// Banks & Branches
export const createBankSchema = z.object({
  bankCode: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/)
    .transform((v) => v.toUpperCase()),
  bankName: z.string().trim().min(2).max(191),
  country: z.string().trim().min(2).max(100),
});

export const updateBankSchema = z.object({
  bankName: z.string().trim().min(2).max(191).optional(),
  country: z.string().trim().min(2).max(100).optional(),
});

export const listBanksQuerySchema = paginationQuerySchema.extend({
  status: recordStatusEnum.optional(),
  country: z.string().trim().max(100).optional(),
});

export const createBankBranchSchema = z.object({
  bankId: uuidSchema,
  branchCode: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .transform((v) => v.toUpperCase()),
  branchName: z.string().trim().min(2).max(191),
  address: z.string().trim().max(1000).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  contactNumber: z.string().trim().max(50).nullable().optional(),
});

export const updateBankBranchSchema = createBankBranchSchema
  .partial()
  .omit({ bankId: true, branchCode: true });

export const listBankBranchesQuerySchema = paginationQuerySchema.extend({
  bankId: uuidSchema.optional(),
  status: recordStatusEnum.optional(),
  city: z.string().trim().max(100).optional(),
});

// Users & Roles
export const permissionOverrideInputSchema = z.object({
  permissionCode: z.string().trim().min(1).max(100),
  effect: z.enum(['ALLOW', 'DENY']),
});

export const createTenantUserSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(191),
  username: z
    .string()
    .trim()
    .min(3)
    .max(100)
    .regex(/^[A-Za-z0-9_.-]+$/),
  mobileNumber: z.string().trim().max(50).nullable().optional(),
  password: passwordStrengthSchema,
  isClientAdmin: z.boolean().default(false),
  companyAccessScope: companyAccessScopeEnum.default('ALL_COMPANIES'),
  companyIds: z.array(uuidSchema).default([]),
  roleIds: z.array(uuidSchema).default([]),
  permissionOverrides: z.array(permissionOverrideInputSchema).default([]),
});

export const updateTenantUserSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email().max(191).optional(),
  mobileNumber: z.string().trim().max(50).nullable().optional(),
  isClientAdmin: z.boolean().optional(),
  companyAccessScope: companyAccessScopeEnum.optional(),
  companyIds: z.array(uuidSchema).optional(),
  roleIds: z.array(uuidSchema).optional(),
  permissionOverrides: z.array(permissionOverrideInputSchema).optional(),
});

export const updateTenantUserStatusSchema = z.object({
  status: userStatusEnum,
  reason: z.string().trim().max(255).optional(),
});

export const adminResetUserPasswordSchema = z.object({
  newPassword: passwordStrengthSchema,
});

export const listTenantUsersQuerySchema = paginationQuerySchema.extend({
  status: userStatusEnum.optional(),
});

export const createRoleSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/)
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  permissionCodes: z.array(z.string().trim().min(1)).default([]),
});

export const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  status: recordStatusEnum.optional(),
  permissionCodes: z.array(z.string().trim().min(1)).optional(),
});

// Bank Accounts
export const createBankAccountSchema = z.object({
  companyId: uuidSchema.optional(),
  bankId: uuidSchema,
  branchId: uuidSchema.nullable().optional(),
  accountName: z.string().trim().min(2).max(191),
  accountNumber: z.string().trim().min(3).max(64),
  accountType: bankAccountTypeEnum.default('CURRENT'),
  currency: z.string().trim().min(3).max(10).default('LKR'),
  openingBalance: decimalAmountSchema.default('0.00'),
  openingBalanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD date format'),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const updateBankAccountSchema = z.object({
  branchId: uuidSchema.nullable().optional(),
  accountName: z.string().trim().min(2).max(191).optional(),
  accountType: bankAccountTypeEnum.optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const updateBankAccountStatusSchema = z.object({
  status: bankAccountStatusEnum,
});

export const listBankAccountsQuerySchema = paginationQuerySchema.extend({
  companyId: uuidSchema.optional(),
  bankId: uuidSchema.optional(),
  status: bankAccountStatusEnum.optional(),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type ListCompaniesQueryInput = z.infer<typeof listCompaniesQuerySchema>;
export type CreateBankInput = z.infer<typeof createBankSchema>;
export type UpdateBankInput = z.infer<typeof updateBankSchema>;
export type ListBanksQueryInput = z.infer<typeof listBanksQuerySchema>;
export type CreateBankBranchInput = z.infer<typeof createBankBranchSchema>;
export type UpdateBankBranchInput = z.infer<typeof updateBankBranchSchema>;
export type ListBankBranchesQueryInput = z.infer<typeof listBankBranchesQuerySchema>;
export type CreateTenantUserInput = z.infer<typeof createTenantUserSchema>;
export type UpdateTenantUserInput = z.infer<typeof updateTenantUserSchema>;
export type UpdateTenantUserStatusInput = z.infer<typeof updateTenantUserStatusSchema>;
export type AdminResetUserPasswordInput = z.infer<typeof adminResetUserPasswordSchema>;
export type ListTenantUsersQueryInput = z.infer<typeof listTenantUsersQuerySchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>;
export type UpdateBankAccountInput = z.infer<typeof updateBankAccountSchema>;
export type UpdateBankAccountStatusInput = z.infer<typeof updateBankAccountStatusSchema>;
export type ListBankAccountsQueryInput = z.infer<typeof listBankAccountsQuerySchema>;
