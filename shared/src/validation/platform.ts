import { z } from 'zod';
import { passwordStrengthSchema } from './auth.js';
import { paginationQuerySchema, uuidSchema } from './pagination.js';

export const tenantStatusEnum = z.enum([
  'PENDING',
  'ACTIVE',
  'SUSPENDED',
  'INACTIVE',
  'EXPIRED',
]);

export const createTenantSchema = z.object({
  tenantCode: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, 'Tenant code may only contain letters, numbers, hyphens, and underscores')
    .transform((v) => v.toUpperCase()),
  organizationName: z.string().trim().min(2).max(191),
  registeredBusinessName: z.string().trim().max(191).nullable().optional(),
  contactPerson: z.string().trim().min(2).max(150),
  email: z.string().trim().email().max(191),
  contactNumber: z.string().trim().max(50).nullable().optional(),
  address: z.string().trim().max(1000).nullable().optional(),
  country: z.string().trim().min(2).max(100),
  registrationNumber: z.string().trim().max(100).nullable().optional(),
  status: z.enum(['PENDING', 'ACTIVE']).default('ACTIVE'),
  defaultCompanyName: z.string().trim().min(2).max(191).optional(),
  defaultCompanyCode: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
  defaultCurrency: z.string().trim().min(3).max(10).default('LKR'),
  clientAdmin: z.object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(191),
    username: z
      .string()
      .trim()
      .min(3)
      .max(100)
      .regex(/^[A-Za-z0-9_.-]+$/, 'Username may only contain letters, numbers, underscores, dots, and hyphens'),
    mobileNumber: z.string().trim().max(50).nullable().optional(),
    password: passwordStrengthSchema,
  }),
  enabledFeatureKeys: z.array(z.string().trim().min(1)).optional(),
});

export const updateTenantSchema = z.object({
  organizationName: z.string().trim().min(2).max(191).optional(),
  registeredBusinessName: z.string().trim().max(191).nullable().optional(),
  contactPerson: z.string().trim().min(2).max(150).optional(),
  email: z.string().trim().email().max(191).optional(),
  contactNumber: z.string().trim().max(50).nullable().optional(),
  address: z.string().trim().max(1000).nullable().optional(),
  country: z.string().trim().min(2).max(100).optional(),
  registrationNumber: z.string().trim().max(100).nullable().optional(),
  defaultCompanyId: uuidSchema.nullable().optional(),
  settings: z
    .object({
      defaultCurrency: z.string().trim().min(3).max(10).optional(),
      dateFormat: z.string().trim().min(4).max(32).optional(),
      timezone: z.string().trim().min(2).max(64).optional(),
      offlineMaxSessionHours: z.coerce.number().int().min(1).max(720).optional(),
      requireDeviceApproval: z.boolean().optional(),
      fiscalYearStartMonth: z.coerce.number().int().min(1).max(12).optional(),
    })
    .optional(),
});

export const updateTenantProfileSelfSchema = z.object({
  organizationName: z.string().trim().min(2).max(191).optional(),
  registeredBusinessName: z.string().trim().max(191).nullable().optional(),
  contactPerson: z.string().trim().min(2).max(150).optional(),
  email: z.string().trim().email().max(191).optional(),
  contactNumber: z.string().trim().max(50).nullable().optional(),
  address: z.string().trim().max(1000).nullable().optional(),
  country: z.string().trim().min(2).max(100).optional(),
  registrationNumber: z.string().trim().max(100).nullable().optional(),
  settings: z
    .object({
      defaultCurrency: z.string().trim().min(3).max(10).optional(),
      dateFormat: z.string().trim().min(4).max(32).optional(),
      timezone: z.string().trim().min(2).max(64).optional(),
      offlineMaxSessionHours: z.coerce.number().int().min(1).max(720).optional(),
      requireDeviceApproval: z.boolean().optional(),
      fiscalYearStartMonth: z.coerce.number().int().min(1).max(12).optional(),
    })
    .optional(),
});

export const updateTenantStatusSchema = z.object({
  status: tenantStatusEnum,
  reason: z.string().trim().max(255).optional(),
});

export const listTenantsQuerySchema = paginationQuerySchema.extend({
  status: tenantStatusEnum.optional(),
  country: z.string().trim().max(100).optional(),
});

export const createFeatureSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9_]+$/, 'Feature key must be lowercase snake_case'),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  category: z.string().trim().max(64).nullable().optional(),
  isGlobalActive: z.boolean().default(true),
  isDefaultEnabled: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(100),
});

export const updateFeatureSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  category: z.string().trim().max(64).nullable().optional(),
  isGlobalActive: z.boolean().optional(),
  isDefaultEnabled: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
});

export const setTenantFeatureSchema = z.object({
  isEnabled: z.boolean(),
  isOverride: z.boolean().default(true),
  overrideReason: z.string().trim().max(255).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const bulkSetTenantFeaturesSchema = z.object({
  features: z
    .array(
      z.object({
        featureKey: z.string().trim().min(1).max(64),
        isEnabled: z.boolean(),
        isOverride: z.boolean().default(true),
        overrideReason: z.string().trim().max(255).nullable().optional(),
        expiresAt: z.string().datetime().nullable().optional(),
      })
    )
    .min(1),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type UpdateTenantProfileSelfInput = z.infer<typeof updateTenantProfileSelfSchema>;
export type UpdateTenantStatusInput = z.infer<typeof updateTenantStatusSchema>;
export type ListTenantsQueryInput = z.infer<typeof listTenantsQuerySchema>;
export type CreateFeatureInput = z.infer<typeof createFeatureSchema>;
export type UpdateFeatureInput = z.infer<typeof updateFeatureSchema>;
export type SetTenantFeatureInput = z.infer<typeof setTenantFeatureSchema>;
export type BulkSetTenantFeaturesInput = z.infer<typeof bulkSetTenantFeaturesSchema>;
