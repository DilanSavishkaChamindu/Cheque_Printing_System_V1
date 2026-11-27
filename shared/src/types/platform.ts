import type { TenantStatus } from '../constants/statuses.js';

export interface TenantSettingsDto {
  defaultCurrency: string;
  dateFormat: string;
  timezone: string;
  offlineMaxSessionHours: number;
  requireDeviceApproval: boolean;
  fiscalYearStartMonth: number;
}

export interface TenantSummaryDto {
  id: string;
  tenantCode: string;
  organizationName: string;
  registeredBusinessName: string | null;
  contactPerson: string;
  email: string;
  contactNumber: string | null;
  country: string;
  status: TenantStatus;
  defaultCompanyId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenantUsageDto {
  usersCount: number;
  activeUsersCount: number;
  companiesCount: number;
  bankAccountsCount: number;
  issuedChequesCount: number;
  receivedChequesCount: number;
  registeredDevicesCount: number;
}

export interface FeatureCatalogDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string | null;
  isGlobalActive: boolean;
  isDefaultEnabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TenantFeatureEntitlementDto {
  featureId: string;
  featureKey: string;
  featureName: string;
  description: string | null;
  category: string | null;
  isGlobalActive: boolean;
  isDefaultEnabled: boolean;
  isEnabledForTenant: boolean;
  effectiveEnabled: boolean;
  isOverride: boolean;
  overrideReason: string | null;
  expiresAt: string | null;
  updatedAt: string | null;
}

export interface TenantFeatureHistoryDto {
  id: string;
  tenantId: string;
  featureId: string;
  featureKey: string;
  featureName: string;
  previousEnabled: boolean | null;
  newEnabled: boolean;
  isOverride: boolean;
  reason: string | null;
  changedByActorType: string;
  changedById: string;
  createdAt: string;
}

export interface PlatformDashboardSummaryDto {
  totals: {
    totalTenants: number;
    activeTenants: number;
    pendingTenants: number;
    suspendedTenants: number;
    inactiveTenants: number;
    expiredTenants: number;
    totalUsers: number;
    totalIssuedCheques: number;
    totalReceivedCheques: number;
  };
  recentTenants: TenantSummaryDto[];
  tenantUsage: Array<{
    tenantId: string;
    tenantCode: string;
    organizationName: string;
    status: TenantStatus;
    usersCount: number;
    companiesCount: number;
    issuedChequesCount: number;
    receivedChequesCount: number;
    enabledFeaturesCount: number;
  }>;
  recentActivities: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    tenantId: string | null;
    tenantName: string | null;
    actorEmail: string | null;
    createdAt: string;
  }>;
  systemHealth: {
    databaseConnected: boolean;
    uptimeSeconds: number;
  };
}
