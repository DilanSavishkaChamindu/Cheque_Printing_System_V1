import type { FeatureKey } from '../constants/features.js';
import type { PermissionCode } from '../constants/permissions.js';
import type { TenantStatus, UserStatus } from '../constants/statuses.js';

export type ActorType = 'PLATFORM_ADMIN' | 'TENANT_USER';
export type CompanyAccessScope = 'ALL_COMPANIES' | 'SELECTED_COMPANIES';

export interface AuthenticatedPlatformAdmin {
  actorType: 'PLATFORM_ADMIN';
  id: string;
  sessionId: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
}

export interface AuthenticatedCompanyOption {
  id: string;
  companyCode: string;
  companyName: string;
  isDefault: boolean;
}

export interface AuthenticatedTenantSummary {
  id: string;
  tenantCode: string;
  organizationName: string;
  status: TenantStatus;
  defaultCompanyId: string | null;
  enabledFeatures: FeatureKey[];
  defaultCurrency: string;
  dateFormat: string;
  timezone: string;
}

export interface AuthenticatedTenantUser {
  actorType: 'TENANT_USER';
  id: string;
  tenantId: string;
  sessionId: string;
  deviceId: string | null;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  isClientAdmin: boolean;
  companyAccessScope: CompanyAccessScope;
  allowedCompanyIds: string[];
  companies: AuthenticatedCompanyOption[];
  permissions: PermissionCode[];
  roles: string[];
  tenant: AuthenticatedTenantSummary;
}

export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface PlatformLoginResponseDto {
  tokens: AuthTokensDto;
  admin: AuthenticatedPlatformAdmin;
}

export interface TenantLoginResponseDto {
  tokens: AuthTokensDto;
  user: AuthenticatedTenantUser;
}
