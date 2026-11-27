import type {
  ApiSuccessResponse,
  AuthenticatedPlatformAdmin,
  AuthenticatedTenantUser,
  ChangePasswordInput,
  ForgotPasswordInput,
  PlatformLoginInput,
  PlatformLoginResponseDto,
  ResetPasswordInput,
  TenantLoginInput,
  TenantLoginResponseDto,
} from '@cheque-saas/shared';
import { apiClient } from '../lib/apiClient';

const DEVICE_FINGERPRINT_KEY = 'cheque_saas_device_fingerprint_v1';

export function getOrCreateDeviceFingerprint(): string {
  if (typeof window === 'undefined') {
    return 'ssr-device';
  }
  let fp = window.localStorage.getItem(DEVICE_FINGERPRINT_KEY);
  if (!fp) {
    fp =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(DEVICE_FINGERPRINT_KEY, fp);
  }
  return fp;
}

export const authService = {
  async loginTenant(input: TenantLoginInput): Promise<TenantLoginResponseDto> {
    const response = await apiClient.post<ApiSuccessResponse<TenantLoginResponseDto>>(
      '/auth/login',
      {
        ...input,
        deviceFingerprint: input.deviceFingerprint ?? getOrCreateDeviceFingerprint(),
        deviceName:
          input.deviceName ??
          (typeof navigator !== 'undefined' ? navigator.platform || 'Web Client' : 'Web Client'),
      }
    );
    return response.data.data;
  },

  async fetchTenantMe(): Promise<AuthenticatedTenantUser> {
    const response = await apiClient.get<ApiSuccessResponse<AuthenticatedTenantUser>>('/auth/me');
    return response.data.data;
  },

  async logoutTenant(): Promise<void> {
    await apiClient.post('/auth/logout');
  },

  async logoutAllTenant(): Promise<void> {
    await apiClient.post('/auth/logout-all');
  },

  async changePassword(input: ChangePasswordInput): Promise<void> {
    await apiClient.post('/auth/change-password', input);
  },

  async forgotPassword(input: ForgotPasswordInput): Promise<void> {
    await apiClient.post('/auth/forgot-password', input);
  },

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    await apiClient.post('/auth/reset-password', input);
  },

  async loginPlatform(input: PlatformLoginInput): Promise<PlatformLoginResponseDto> {
    const response = await apiClient.post<ApiSuccessResponse<PlatformLoginResponseDto>>(
      '/auth/platform/login',
      input
    );
    return response.data.data;
  },

  async fetchPlatformMe(): Promise<AuthenticatedPlatformAdmin> {
    const response = await apiClient.get<ApiSuccessResponse<AuthenticatedPlatformAdmin>>(
      '/auth/platform/me'
    );
    return response.data.data;
  },

  async logoutPlatform(): Promise<void> {
    await apiClient.post('/auth/platform/logout');
  },
};
