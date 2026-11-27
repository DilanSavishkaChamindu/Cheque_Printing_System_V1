import type {
  ApiSuccessResponse,
  CreateBankAccountInput,
  CreateBankBranchInput,
  CreateBankInput,
  CreateCompanyInput,
  CreateRoleInput,
  CreateTenantUserInput,
  PaginationMeta,
  UpdateBankAccountInput,
  UpdateBankBranchInput,
  UpdateBankInput,
  UpdateCompanyInput,
  UpdateRoleInput,
  UpdateTenantUserInput,
} from '@cheque-saas/shared';
import { apiClient } from '../lib/apiClient';

export interface CompanyDto {
  id: string;
  tenantId: string;
  companyCode: string;
  companyName: string;
  registeredBusinessName: string | null;
  registrationNumber: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  email: string | null;
  contactNumber: string | null;
  website: string | null;
  isDefault: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
}

export interface BankDto {
  id: string;
  tenantId: string | null;
  isSystemShared: boolean;
  bankCode: string;
  bankName: string;
  country: string;
  status: 'ACTIVE' | 'INACTIVE';
  _count?: { branches: number };
}

export interface BankBranchDto {
  id: string;
  tenantId: string | null;
  bankId: string;
  isSystemShared: boolean;
  branchCode: string;
  branchName: string;
  address: string | null;
  city: string | null;
  contactNumber: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  bank: { id: string; bankCode: string; bankName: string };
}

export interface TenantUserDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  mobileNumber: string | null;
  isClientAdmin: boolean;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  companyAccessScope: 'ALL_COMPANIES' | 'SELECTED_COMPANIES';
  lastLoginAt: string | null;
  lastActivityAt: string | null;
  roles: Array<{ id: string; code: string; name: string; isClientAdmin: boolean }>;
  permissionOverrides: Array<{
    permissionCode: string;
    permissionName: string;
    moduleKey: string;
    effect: 'ALLOW' | 'DENY';
  }>;
  companies: Array<{ id: string; companyCode: string; companyName: string; status: string }>;
}

export interface RoleDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isClientAdmin: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  usersCount: number;
  permissions: Array<{ id: string; code: string; name: string; moduleKey: string }>;
}

export interface PermissionCatalogItemDto {
  id: string;
  code: string;
  name: string;
  moduleKey: string;
  description: string | null;
}

export interface BankAccountDto {
  id: string;
  companyId: string;
  company: { id: string; companyCode: string; companyName: string };
  bankId: string;
  bank: { id: string; bankCode: string; bankName: string };
  branchId: string | null;
  branch: { id: string; branchCode: string; branchName: string } | null;
  accountName: string;
  accountNumber: string;
  accountNumberMasked: string;
  accountType: 'CURRENT' | 'SAVINGS' | 'OVERDRAFT' | 'OTHER';
  currency: string;
  openingBalance: string;
  openingBalanceDate: string;
  currentBookBalance: string;
  status: 'ACTIVE' | 'INACTIVE' | 'CLOSED' | 'FROZEN';
  notes: string | null;
}

export interface ReferenceBankOptionDto {
  id: string;
  bankCode: string;
  bankName: string;
  branches: Array<{ id: string; branchCode: string; branchName: string }>;
}

export const organizationService = {
  // Companies
  async listCompanies(params: { page?: number; limit?: number; search?: string; status?: string }) {
    const res = await apiClient.get<
      ApiSuccessResponse<CompanyDto[], { pagination: PaginationMeta }>
    >('/companies', {
      params: {
        ...params,
        search: params.search || undefined,
        status: params.status || undefined,
      },
    });
    return { items: res.data.data, pagination: res.data.meta.pagination };
  },
  async createCompany(input: CreateCompanyInput) {
    const res = await apiClient.post<ApiSuccessResponse<CompanyDto>>('/companies', input);
    return res.data.data;
  },
  async updateCompany(companyId: string, input: UpdateCompanyInput) {
    const res = await apiClient.patch<ApiSuccessResponse<CompanyDto>>(
      `/companies/${companyId}`,
      input
    );
    return res.data.data;
  },
  async updateCompanyStatus(companyId: string, status: 'ACTIVE' | 'INACTIVE') {
    const res = await apiClient.patch<ApiSuccessResponse<CompanyDto>>(
      `/companies/${companyId}/status`,
      { status }
    );
    return res.data.data;
  },

  // Banks & Branches
  async listBanks(params: { page?: number; limit?: number; search?: string; status?: string }) {
    const res = await apiClient.get<
      ApiSuccessResponse<BankDto[], { pagination: PaginationMeta }>
    >('/banks', {
      params: {
        ...params,
        search: params.search || undefined,
        status: params.status || undefined,
      },
    });
    return { items: res.data.data, pagination: res.data.meta.pagination };
  },
  async createBank(input: CreateBankInput) {
    const res = await apiClient.post<ApiSuccessResponse<BankDto>>('/banks', input);
    return res.data.data;
  },
  async updateBank(bankId: string, input: UpdateBankInput) {
    const res = await apiClient.patch<ApiSuccessResponse<BankDto>>(`/banks/${bankId}`, input);
    return res.data.data;
  },
  async updateBankStatus(bankId: string, status: 'ACTIVE' | 'INACTIVE') {
    const res = await apiClient.patch<ApiSuccessResponse<BankDto>>(
      `/banks/${bankId}/status`,
      { status }
    );
    return res.data.data;
  },
  async listBranches(params: {
    page?: number;
    limit?: number;
    bankId?: string;
    search?: string;
  }) {
    const res = await apiClient.get<
      ApiSuccessResponse<BankBranchDto[], { pagination: PaginationMeta }>
    >('/bank-branches', {
      params: {
        ...params,
        bankId: params.bankId || undefined,
        search: params.search || undefined,
      },
    });
    return { items: res.data.data, pagination: res.data.meta.pagination };
  },
  async createBranch(input: CreateBankBranchInput) {
    const res = await apiClient.post<ApiSuccessResponse<BankBranchDto>>('/bank-branches', input);
    return res.data.data;
  },
  async updateBranch(branchId: string, input: UpdateBankBranchInput) {
    const res = await apiClient.patch<ApiSuccessResponse<BankBranchDto>>(
      `/bank-branches/${branchId}`,
      input
    );
    return res.data.data;
  },

  // Users, Roles, Permissions
  async listUsers(params: { page?: number; limit?: number; search?: string; status?: string }) {
    const res = await apiClient.get<
      ApiSuccessResponse<TenantUserDto[], { pagination: PaginationMeta }>
    >('/users', {
      params: {
        ...params,
        search: params.search || undefined,
        status: params.status || undefined,
      },
    });
    return { items: res.data.data, pagination: res.data.meta.pagination };
  },
  async createUser(input: CreateTenantUserInput) {
    const res = await apiClient.post<ApiSuccessResponse<TenantUserDto>>('/users', input);
    return res.data.data;
  },
  async updateUser(userId: string, input: UpdateTenantUserInput) {
    const res = await apiClient.patch<ApiSuccessResponse<TenantUserDto>>(
      `/users/${userId}`,
      input
    );
    return res.data.data;
  },
  async updateUserStatus(userId: string, status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED') {
    const res = await apiClient.patch<ApiSuccessResponse<TenantUserDto>>(
      `/users/${userId}/status`,
      { status }
    );
    return res.data.data;
  },
  async resetUserPassword(userId: string, newPassword: string) {
    await apiClient.post(`/users/${userId}/reset-password`, { newPassword });
  },
  async getUserActivity(userId: string, page = 1) {
    const res = await apiClient.get<
      ApiSuccessResponse<{
        auditItems: Array<{ id: string; action: string; entityType: string; createdAt: string }>;
        recentAuthLogs: Array<{
          id: string;
          eventType: string;
          success: boolean;
          ipAddress: string | null;
          createdAt: string;
        }>;
      }>
    >(`/users/${userId}/activity`, { params: { page, limit: 15 } });
    return res.data.data;
  },
  async listRoles() {
    const res = await apiClient.get<ApiSuccessResponse<RoleDto[]>>('/roles');
    return res.data.data;
  },
  async createRole(input: CreateRoleInput) {
    const res = await apiClient.post<ApiSuccessResponse<RoleDto>>('/roles', input);
    return res.data.data;
  },
  async updateRole(roleId: string, input: UpdateRoleInput) {
    const res = await apiClient.patch<ApiSuccessResponse<RoleDto>>(`/roles/${roleId}`, input);
    return res.data.data;
  },
  async listPermissions() {
    const res = await apiClient.get<ApiSuccessResponse<PermissionCatalogItemDto[]>>(
      '/permissions'
    );
    return res.data.data;
  },

  // Bank Accounts
  async listBankAccounts(params: {
    page?: number;
    limit?: number;
    companyId?: string;
    search?: string;
    status?: string;
  }) {
    const res = await apiClient.get<
      ApiSuccessResponse<BankAccountDto[], { pagination: PaginationMeta }>
    >('/bank-accounts', {
      params: {
        ...params,
        companyId: params.companyId || undefined,
        search: params.search || undefined,
        status: params.status || undefined,
      },
    });
    return { items: res.data.data, pagination: res.data.meta.pagination };
  },
  async listReferenceBanks() {
    const res = await apiClient.get<ApiSuccessResponse<ReferenceBankOptionDto[]>>(
      '/bank-accounts/reference-banks'
    );
    return res.data.data;
  },
  async createBankAccount(input: CreateBankAccountInput) {
    const res = await apiClient.post<ApiSuccessResponse<BankAccountDto>>(
      '/bank-accounts',
      input
    );
    return res.data.data;
  },
  async updateBankAccount(bankAccountId: string, input: UpdateBankAccountInput) {
    const res = await apiClient.patch<ApiSuccessResponse<BankAccountDto>>(
      `/bank-accounts/${bankAccountId}`,
      input
    );
    return res.data.data;
  },
  async updateBankAccountStatus(
    bankAccountId: string,
    status: 'ACTIVE' | 'INACTIVE' | 'CLOSED' | 'FROZEN'
  ) {
    const res = await apiClient.patch<ApiSuccessResponse<BankAccountDto>>(
      `/bank-accounts/${bankAccountId}/status`,
      { status }
    );
    return res.data.data;
  },
};
