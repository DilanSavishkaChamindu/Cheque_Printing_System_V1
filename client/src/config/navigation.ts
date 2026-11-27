import {
  FEATURE_KEYS,
  PERMISSION_CODES,
  TENANT_STATUS,
  type FeatureKey,
  type PermissionCode,
  type TenantStatus,
} from '@cheque-saas/shared';

export interface NavigationItem {
  id: string;
  label: string;
  path: string;
  featureKey?: FeatureKey;
  requiredPermission?: PermissionCode;
  section: 'core' | 'cheques' | 'banking' | 'administration' | 'system';
  phaseReady: boolean;
}

export const TENANT_NAVIGATION_ITEMS: readonly NavigationItem[] = [
  {
    id: 'system-status',
    label: 'System Status',
    path: '/',
    section: 'system',
    phaseReady: true,
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    path: '/dashboard',
    featureKey: FEATURE_KEYS.DASHBOARD,
    requiredPermission: PERMISSION_CODES.DASHBOARD_VIEW,
    section: 'core',
    phaseReady: false,
  },
  {
    id: 'new-cheque',
    label: 'New Cheque',
    path: '/cheques/new',
    featureKey: FEATURE_KEYS.NEW_CHEQUE,
    requiredPermission: PERMISSION_CODES.CHEQUE_CREATE,
    section: 'cheques',
    phaseReady: false,
  },
  {
    id: 'cheque-history',
    label: 'Cheque History',
    path: '/cheques/history',
    featureKey: FEATURE_KEYS.CHEQUE_HISTORY,
    requiredPermission: PERMISSION_CODES.CHEQUE_HISTORY_VIEW,
    section: 'cheques',
    phaseReady: false,
  },
  {
    id: 'received-cheques',
    label: 'Received Cheques',
    path: '/received-cheques',
    featureKey: FEATURE_KEYS.RECEIVED_CHEQUES,
    requiredPermission: PERMISSION_CODES.RECEIVED_CHEQUE_VIEW,
    section: 'cheques',
    phaseReady: false,
  },
  {
    id: 'bank-management',
    label: 'Banks & Branches',
    path: '/banks',
    featureKey: FEATURE_KEYS.BANK_MANAGEMENT,
    requiredPermission: PERMISSION_CODES.BANK_VIEW,
    section: 'banking',
    phaseReady: false,
  },
  {
    id: 'bank-balance',
    label: 'Bank Balance & Ledger',
    path: '/bank-accounts',
    featureKey: FEATURE_KEYS.BANK_BALANCE,
    requiredPermission: PERMISSION_CODES.BANK_ACCOUNT_VIEW,
    section: 'banking',
    phaseReady: false,
  },
  {
    id: 'templates-calibration',
    label: 'Templates & Calibration',
    path: '/templates',
    featureKey: FEATURE_KEYS.TEMPLATES_CALIBRATION,
    requiredPermission: PERMISSION_CODES.TEMPLATE_VIEW,
    section: 'cheques',
    phaseReady: false,
  },
  {
    id: 'reports',
    label: 'Reports',
    path: '/reports',
    featureKey: FEATURE_KEYS.REPORTS,
    requiredPermission: PERMISSION_CODES.REPORTS_VIEW,
    section: 'core',
    phaseReady: false,
  },
  {
    id: 'companies',
    label: 'Companies',
    path: '/companies',
    featureKey: FEATURE_KEYS.COMPANIES,
    requiredPermission: PERMISSION_CODES.COMPANY_VIEW,
    section: 'administration',
    phaseReady: false,
  },
  {
    id: 'user-management',
    label: 'Users & Permissions',
    path: '/users',
    featureKey: FEATURE_KEYS.USER_MANAGEMENT,
    requiredPermission: PERMISSION_CODES.USER_VIEW,
    section: 'administration',
    phaseReady: false,
  },
  {
    id: 'backup-restore',
    label: 'Backup & Restore',
    path: '/backups',
    featureKey: FEATURE_KEYS.BACKUP_RESTORE,
    requiredPermission: PERMISSION_CODES.BACKUP_VIEW,
    section: 'administration',
    phaseReady: false,
  },
];

export interface NavigationFilterContext {
  tenantStatus: TenantStatus | null;
  enabledFeatures: readonly FeatureKey[];
  userPermissions: readonly PermissionCode[];
  isClientAdmin: boolean;
}

export function filterNavigationItems(
  items: readonly NavigationItem[],
  ctx: NavigationFilterContext
): NavigationItem[] {
  const featureSet = new Set(ctx.enabledFeatures);
  const permissionSet = new Set(ctx.userPermissions);
  const isTenantActive = ctx.tenantStatus === TENANT_STATUS.ACTIVE;

  return items.filter((item) => {
    if (item.section === 'system') {
      return true;
    }

    if (!isTenantActive) {
      return false;
    }

    if (item.featureKey && !featureSet.has(item.featureKey)) {
      return false;
    }

    if (item.requiredPermission && !ctx.isClientAdmin && !permissionSet.has(item.requiredPermission)) {
      return false;
    }

    return true;
  });
}
