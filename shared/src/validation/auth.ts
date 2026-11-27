import { z } from 'zod';
import { uuidSchema } from './pagination.js';

export const passwordStrengthSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one digit');

export const platformLoginSchema = z.object({
  identifier: z.string().trim().min(1, 'Email or username is required').max(191),
  password: z.string().min(1, 'Password is required').max(128),
});

export const tenantLoginSchema = z.object({
  tenantCode: z.string().trim().min(1).max(64).optional(),
  identifier: z.string().trim().min(1, 'Email or username is required').max(191),
  password: z.string().min(1, 'Password is required').max(128),
  deviceFingerprint: z.string().trim().min(4).max(191).optional(),
  deviceName: z.string().trim().min(1).max(120).optional(),
  platform: z.string().trim().max(64).optional(),
  browser: z.string().trim().max(64).optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().trim().min(10, 'Refresh token is required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordStrengthSchema,
});

export const forgotPasswordSchema = z.object({
  actorType: z.enum(['TENANT_USER', 'PLATFORM_ADMIN']).default('TENANT_USER'),
  tenantCode: z.string().trim().min(1).max(64).optional(),
  email: z.string().trim().email('Valid email address is required').max(191),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(20, 'Reset token is required'),
  newPassword: passwordStrengthSchema,
});

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().trim().max(120).optional(),
  entityType: z.string().trim().max(80).optional(),
  entityId: uuidSchema.optional(),
  userId: uuidSchema.optional(),
  tenantId: uuidSchema.optional(),
  fromDate: z.string().trim().optional(),
  toDate: z.string().trim().optional(),
});

export type PlatformLoginInput = z.infer<typeof platformLoginSchema>;
export type TenantLoginInput = z.infer<typeof tenantLoginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type AuditLogQueryInput = z.infer<typeof auditLogQuerySchema>;
