import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type {
  ApiErrorResponse,
  ApiSuccessResponse,
  PlatformLoginResponseDto,
  TenantLoginResponseDto,
} from '@cheque-saas/shared';
import { clientEnv } from '../config/env';
import { authStore } from '../stores/authStore';

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

export const apiClient = axios.create({
  baseURL: clientEnv.apiBaseUrl,
  timeout: 15000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  if (!config.headers['X-Request-Id'] && typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    config.headers['X-Request-Id'] = crypto.randomUUID();
  }

  const { accessToken } = authStore.getState();
  if (accessToken && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function performTokenRefresh(): Promise<string | null> {
  const { actorType, refreshToken } = authStore.getState();
  if (!refreshToken || !actorType) {
    return null;
  }

  try {
    if (actorType === 'PLATFORM_ADMIN') {
      const response = await axios.post<ApiSuccessResponse<PlatformLoginResponseDto>>(
        `${clientEnv.apiBaseUrl}/auth/platform/refresh`,
        { refreshToken }
      );
      const data = response.data.data;
      authStore.setPlatformSession(data.tokens, data.admin);
      return data.tokens.accessToken;
    }

    const response = await axios.post<ApiSuccessResponse<TenantLoginResponseDto>>(
      `${clientEnv.apiBaseUrl}/auth/refresh`,
      { refreshToken }
    );
    const data = response.data.data;
    authStore.setTenantSession(data.tokens, data.user);
    return data.tokens.accessToken;
  } catch {
    await authStore.clearSession();
    return null;
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;
    const requestUrl = originalRequest?.url ?? '';

    const isAuthEndpoint =
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/refresh') ||
      requestUrl.includes('/auth/platform/login') ||
      requestUrl.includes('/auth/platform/refresh');

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthEndpoint &&
      authStore.getState().refreshToken
    ) {
      originalRequest._retry = true;

      if (!refreshPromise) {
        refreshPromise = performTokenRefresh().finally(() => {
          refreshPromise = null;
        });
      }

      const nextToken = await refreshPromise;
      if (nextToken) {
        originalRequest.headers.Authorization = `Bearer ${nextToken}`;
        return apiClient.request(originalRequest);
      }
    }

    return Promise.reject(error);
  }
);

export function extractApiErrorMessage(error: unknown, fallback = 'Request failed.'): string {
  if (error instanceof AxiosError) {
    const payload = error.response?.data as Partial<ApiErrorResponse> | undefined;
    if (payload?.errors && payload.errors.length > 0 && payload.errors[0]?.message) {
      return `${payload.message ?? fallback} (${payload.errors[0].message})`;
    }
    if (payload?.message) {
      return payload.message;
    }
    if (error.message) {
      return error.message;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
