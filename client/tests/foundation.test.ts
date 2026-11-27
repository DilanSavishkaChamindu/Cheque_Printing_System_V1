import { describe, expect, it } from 'vitest';
import {
  FEATURE_KEYS,
  PERMISSION_CODES,
  TENANT_STATUS,
} from '@cheque-saas/shared';
import {
  TENANT_NAVIGATION_ITEMS,
  filterNavigationItems,
} from '../src/config/navigation';

describe('dynamic navigation filtering', () => {
  it('hides tenant operational items when tenant is not active', () => {
    const visible = filterNavigationItems(TENANT_NAVIGATION_ITEMS, {
      tenantStatus: TENANT_STATUS.SUSPENDED,
      enabledFeatures: [FEATURE_KEYS.DASHBOARD, FEATURE_KEYS.NEW_CHEQUE],
      userPermissions: [PERMISSION_CODES.DASHBOARD_VIEW, PERMISSION_CODES.CHEQUE_CREATE],
      isClientAdmin: true,
    });

    expect(visible.map((item) => item.id)).toEqual(['system-status']);
  });

  it('filters menu items strictly by enabled tenant features and user permissions', () => {
    const visible = filterNavigationItems(TENANT_NAVIGATION_ITEMS, {
      tenantStatus: TENANT_STATUS.ACTIVE,
      enabledFeatures: [
        FEATURE_KEYS.DASHBOARD,
        FEATURE_KEYS.NEW_CHEQUE,
        FEATURE_KEYS.CHEQUE_HISTORY,
      ],
      userPermissions: [
        PERMISSION_CODES.DASHBOARD_VIEW,
        PERMISSION_CODES.CHEQUE_CREATE,
      ],
      isClientAdmin: false,
    });

    expect(visible.map((item) => item.id)).toEqual([
      'system-status',
      'dashboard',
      'new-cheque',
    ]);
  });

  it('hides Companies menu even for Client Admin when Companies feature is disabled', () => {
    const visible = filterNavigationItems(TENANT_NAVIGATION_ITEMS, {
      tenantStatus: TENANT_STATUS.ACTIVE,
      enabledFeatures: [FEATURE_KEYS.DASHBOARD, FEATURE_KEYS.USER_MANAGEMENT],
      userPermissions: [],
      isClientAdmin: true,
    });

    expect(visible.some((item) => item.id === 'companies')).toBe(false);
    expect(visible.some((item) => item.id === 'user-management')).toBe(true);
  });
});
