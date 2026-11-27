import { useSyncExternalStore } from 'react';
import type {
  ActorType,
  AuthenticatedPlatformAdmin,
  AuthenticatedTenantUser,
  AuthTokensDto,
} from '@cheque-saas/shared';
import { clearOfflineTenantData } from '../lib/offlineDb';

const STORAGE_KEY = 'cheque_saas_auth_state_v1';

export interface AuthState {
  actorType: ActorType | null;
  accessToken: string | null;
  refreshToken: string | null;
  tenantUser: AuthenticatedTenantUser | null;
  platformAdmin: AuthenticatedPlatformAdmin | null;
  activeCompanyId: string | null;
}

const EMPTY_STATE: AuthState = {
  actorType: null,
  accessToken: null,
  refreshToken: null,
  tenantUser: null,
  platformAdmin: null,
  activeCompanyId: null,
};

function loadInitialState(): AuthState {
  if (typeof window === 'undefined') {
    return EMPTY_STATE;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return EMPTY_STATE;
    }
    const parsed = JSON.parse(raw) as Partial<AuthState>;
    return {
      actorType: parsed.actorType ?? null,
      accessToken: parsed.accessToken ?? null,
      refreshToken: parsed.refreshToken ?? null,
      tenantUser: parsed.tenantUser ?? null,
      platformAdmin: parsed.platformAdmin ?? null,
      activeCompanyId: parsed.activeCompanyId ?? null,
    };
  } catch {
    return EMPTY_STATE;
  }
}

let state: AuthState = loadInitialState();
const listeners = new Set<() => void>();

function persistAndNotify(nextState: AuthState): void {
  state = nextState;
  if (typeof window !== 'undefined') {
    try {
      if (!nextState.actorType) {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
      }
    } catch {
      // Ignore storage quota issues
    }
  }
  for (const listener of listeners) {
    listener();
  }
}

export const authStore = {
  getState(): AuthState {
    return state;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  setTenantSession(tokens: AuthTokensDto, user: AuthenticatedTenantUser): void {
    const previousCompany = state.activeCompanyId;
    const validCompany =
      previousCompany && user.allowedCompanyIds.includes(previousCompany)
        ? previousCompany
        : user.tenant.defaultCompanyId ?? user.allowedCompanyIds[0] ?? null;

    persistAndNotify({
      actorType: 'TENANT_USER',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tenantUser: user,
      platformAdmin: null,
      activeCompanyId: validCompany,
    });
  },

  updateTenantUser(user: AuthenticatedTenantUser): void {
    if (state.actorType !== 'TENANT_USER') {
      return;
    }
    const validCompany =
      state.activeCompanyId && user.allowedCompanyIds.includes(state.activeCompanyId)
        ? state.activeCompanyId
        : user.tenant.defaultCompanyId ?? user.allowedCompanyIds[0] ?? null;

    persistAndNotify({
      ...state,
      tenantUser: user,
      activeCompanyId: validCompany,
    });
  },

  setActiveCompanyId(companyId: string): void {
    if (!state.tenantUser) {
      return;
    }
    if (!state.tenantUser.allowedCompanyIds.includes(companyId)) {
      return;
    }
    persistAndNotify({
      ...state,
      activeCompanyId: companyId,
    });
  },

  setPlatformSession(
    tokens: AuthTokensDto,
    admin: AuthenticatedPlatformAdmin
  ): void {
    persistAndNotify({
      actorType: 'PLATFORM_ADMIN',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tenantUser: null,
      platformAdmin: admin,
      activeCompanyId: null,
    });
  },

  updatePlatformAdmin(admin: AuthenticatedPlatformAdmin): void {
    if (state.actorType !== 'PLATFORM_ADMIN') {
      return;
    }
    persistAndNotify({
      ...state,
      platformAdmin: admin,
    });
  },

  async clearSession(): Promise<void> {
    const previousTenantId = state.tenantUser?.tenantId;
    persistAndNotify(EMPTY_STATE);
    if (previousTenantId) {
      await clearOfflineTenantData(previousTenantId).catch(() => undefined);
    }
  },
};

export function useAuthStore(): AuthState {
  return useSyncExternalStore(
    authStore.subscribe,
    authStore.getState,
    () => EMPTY_STATE
  );
}
