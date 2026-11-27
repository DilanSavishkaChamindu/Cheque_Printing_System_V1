import type {
  ApiSuccessResponse,
  BulkSetTenantFeaturesInput,
  CreateFeatureInput,
  CreateTenantInput,
  FeatureCatalogDto,
  PaginationMeta,
  PlatformDashboardSummaryDto,
  SetTenantFeatureInput,
  TenantFeatureEntitlementDto,
  TenantFeatureHistoryDto,
  TenantStatus,
  UpdateFeatureInput,
  UpdateTenantInput,
  UpdateTenantProfileSelfInput,
} from '@cheque-saas/shared';
import { apiClient } from '../lib/apiClient';

export interface PlatformTenantListItem {
  id: string;
  tenantCode: string;
  organizationName: string;
  registeredBusinessName: string | null;
  contactPerson: string;
  email: string;
  contactNumber: string | null;
  country: string;
  registrationNumber: string | null;
  status: TenantStatus;
  defaultCompanyId: string | null;
  createdAt: string;
  updatedAt: string;
  usage: {
    usersCount: number;
    companiesCount: number;
    issuedChequesCount: number;
    receivedChequesCount: number;
  };
}

export interface PlatformTenantDetails {
  id: string;
  tenantCode: string;
  organizationName: string;
  registeredBusinessName: string | null;
  contactPerson: string;
  email: string;
  contactNumber: string | null;
  address: string | null;
  country: string;
  registrationNumber: string | null;
  status: TenantStatus;
  statusReason: string | null;
  suspendedAt: string | null;
  defaultCompanyId: string | null;
  defaultCompany: {
    id: string;
    companyCode: string;
    companyName: string;
    status: string;
  } | null;
  companies: Array<{
    id: string;
    companyCode: string;
    companyName: string;
    isDefault: boolean;
    status: string;
  }>;
  settings: {
    defaultCurrency: string;
    dateFormat: string;
    timezone: string;
    offlineMaxSessionHours: number;
    requireDeviceApproval: boolean;
    fiscalYearStartMonth: number;
  } | null;
  usage: {
    usersCount: number;
    activeUsersCount: number;
    companiesCount: number;
    bankAccountsCount: number;
    issuedChequesCount: number;
    receivedChequesCount: number;
    registeredDevicesCount: number;
  };
  features: TenantFeatureEntitlementDto[];
  createdAt: string;
  updatedAt: string;
}

export const platformService = {
  async getDashboard(): Promise<PlatformDashboardSummaryDto> {
    const res = await apiClient.get<ApiSuccessResponse<PlatformDashboardSummaryDto>>(
      '/platform/dashboard'
    );
    return res.data.data;
  },

  async listTenants(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: TenantStatus | '';
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const res = await apiClient.get<
      ApiSuccessResponse<PlatformTenantListItem[], { pagination: PaginationMeta }>
    >('/platform/tenants', {
      params: {
        ...params,
        status: params.status || undefined,
        search: params.search || undefined,
      },
    });
    return {
      items: res.data.data,
      pagination: res.data.meta.pagination,
    };
  },

  async createTenant(input: CreateTenantInput): Promise<PlatformTenantDetails> {
    const res = await apiClient.post<ApiSuccessResponse<PlatformTenantDetails>>(
      '/platform/tenants',
      input
    );
    return res.data.data;
  },

  async getTenantDetails(tenantId: string): Promise<PlatformTenantDetails> {
    const res = await apiClient.get<ApiSuccessResponse<PlatformTenantDetails>>(
      `/platform/tenants/${tenantId}`
    );
    return res.data.data;
  },

  async updateTenant(
    tenantId: string,
    input: UpdateTenantInput
  ): Promise<PlatformTenantDetails> {
    const res = await apiClient.patch<ApiSuccessResponse<PlatformTenantDetails>>(
      `/platform/tenants/${tenantId}`,
      input
    );
    return res.data.data;
  },

  async updateTenantStatus(
    tenantId: string,
    input: { status: TenantStatus; reason?: string }
  ): Promise<PlatformTenantDetails> {
    const res = await apiClient.patch<ApiSuccessResponse<PlatformTenantDetails>>(
      `/platform/tenants/${tenantId}/status`,
      input
    );
    return res.data.data;
  },

  async listTenantUsers(tenantId: string, page = 1, limit = 20) {
    const res = await apiClient.get<
      ApiSuccessResponse<
        Array<{
          id: string;
          firstName: string;
          lastName: string;
          email: string;
          username: string;
          isClientAdmin: boolean;
          status: string;
          lastLoginAt: string | null;
          roles: Array<{ id: string; code: string; name: string }>;
        }>,
        { pagination: PaginationMeta }
      >
    >(`/platform/tenants/${tenantId}/users`, { params: { page, limit } });
    return {
      items: res.data.data,
      pagination: res.data.meta.pagination,
    };
  },

  async getTenantFeatures(tenantId: string): Promise<TenantFeatureEntitlementDto[]> {
    const res = await apiClient.get<ApiSuccessResponse<TenantFeatureEntitlementDto[]>>(
      `/platform/tenants/${tenantId}/features`
    );
    return res.data.data;
  },

  async setTenantFeature(
    tenantId: string,
    featureKey: string,
    input: SetTenantFeatureInput
  ): Promise<TenantFeatureEntitlementDto[]> {
    const res = await apiClient.put<ApiSuccessResponse<TenantFeatureEntitlementDto[]>>(
      `/platform/tenants/${tenantId}/features/${featureKey}`,
      input
    );
    return res.data.data;
  },

  async bulkSetTenantFeatures(
    tenantId: string,
    input: BulkSetTenantFeaturesInput
  ): Promise<TenantFeatureEntitlementDto[]> {
    const res = await apiClient.put<ApiSuccessResponse<TenantFeatureEntitlementDto[]>>(
      `/platform/tenants/${tenantId}/features`,
      input
    );
    return res.data.data;
  },

  async getTenantFeatureHistory(tenantId: string, page = 1, limit = 20) {
    const res = await apiClient.get<
      ApiSuccessResponse<TenantFeatureHistoryDto[], { pagination: PaginationMeta }>
    >(`/platform/tenants/${tenantId}/features/history`, { params: { page, limit } });
    return {
      items: res.data.data,
      pagination: res.data.meta.pagination,
    };
  },

  async listGlobalFeatures(): Promise<FeatureCatalogDto[]> {
    const res = await apiClient.get<ApiSuccessResponse<FeatureCatalogDto[]>>(
      '/platform/features'
    );
    return res.data.data;
  },

  async createGlobalFeature(input: CreateFeatureInput): Promise<FeatureCatalogDto> {
    const res = await apiClient.post<ApiSuccessResponse<FeatureCatalogDto>>(
      '/platform/features',
      input
    );
    return res.data.data;
  },

  async updateGlobalFeature(
    featureId: string,
    input: UpdateFeatureInput
  ): Promise<FeatureCatalogDto> {
    const res = await apiClient.patch<ApiSuccessResponse<FeatureCatalogDto>>(
      `/platform/features/${featureId}`,
      input
    );
    return res.data.data;
  },

  async listAuditLogs(params: { page?: number; limit?: number; action?: string }) {
    const res = await apiClient.get<
      ApiSuccessResponse<
        Array<{
          id: string;
          action: string;
          entityType: string;
          entityId: string | null;
          createdAt: string;
          platformAdmin: { email: string; firstName: string; lastName: string } | null;
          tenant: { tenantCode: string; organizationName: string } | null;
        }>,
        { pagination: PaginationMeta }
      >
    >('/platform/audit-logs', {
      params: {
        ...params,
        action: params.action || undefined,
      },
    });
    return {
      items: res.data.data,
      pagination: res.data.meta.pagination,
    };
  },

  async getCurrentTenantProfile() {
    const res = await apiClient.get<
      ApiSuccessResponse<{
        id: string;
        tenantCode: string;
        organizationName: string;
        registeredBusinessName: string | null;
        contactPerson: string;
        email: string;
        contactNumber: string | null;
        address: string | null;
        country: string;
        registrationNumber: string | null;
        status: TenantStatus;
        defaultCompanyId: string | null;
        settings: {
          defaultCurrency: string;
          dateFormat: string;
          timezone: string;
          offlineMaxSessionHours: number;
          requireDeviceApproval: boolean;
          fiscalYearStartMonth: number;
        } | null;
      }>
    >('/tenants/current');
    return res.data.data;
  },

  async updateCurrentTenantProfile(input: UpdateTenantProfileSelfInput) {
    const res = await apiClient.patch('/tenants/current', input);
    return res.data.data;
  },
};
