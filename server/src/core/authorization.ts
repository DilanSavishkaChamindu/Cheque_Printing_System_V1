import {
  FEATURE_KEYS,
  type AuthenticatedTenantUser,
  type FeatureKey,
  type PermissionCode,
} from '@cheque-saas/shared';
import { ForbiddenError } from './errors.js';

export interface FeatureCatalogEntry {
  id: string;
  key: string;
  isGlobalActive: boolean;
  isDefaultEnabled: boolean;
}

export interface TenantFeatureEntry {
  featureId: string;
  isEnabled: boolean;
  expiresAt: Date | null;
}

export function computeEffectiveFeatures(
  catalog: readonly FeatureCatalogEntry[],
  tenantEntries: readonly TenantFeatureEntry[],
  now = new Date()
): FeatureKey[] {
  const byFeatureId = new Map(tenantEntries.map((entry) => [entry.featureId, entry]));
  const enabled: FeatureKey[] = [];

  for (const feature of catalog) {
    if (!feature.isGlobalActive) {
      continue;
    }

    const override = byFeatureId.get(feature.id);
    if (override) {
      const notExpired = !override.expiresAt || override.expiresAt > now;
      if (override.isEnabled && notExpired) {
        enabled.push(feature.key as FeatureKey);
      }
      continue;
    }

    if (feature.isDefaultEnabled) {
      enabled.push(feature.key as FeatureKey);
    }
  }

  return enabled;
}

export function computeEffectivePermissions(input: {
  rolePermissions: readonly PermissionCode[];
  overrides: ReadonlyArray<{ code: PermissionCode; effect: 'ALLOW' | 'DENY' }>;
}): PermissionCode[] {
  const effective = new Set<PermissionCode>(input.rolePermissions);

  for (const override of input.overrides) {
    if (override.effect === 'ALLOW') {
      effective.add(override.code);
    }
  }

  for (const override of input.overrides) {
    if (override.effect === 'DENY') {
      effective.delete(override.code);
    }
  }

  return Array.from(effective);
}

export function resolveAuthorizedCompanyId(
  user: AuthenticatedTenantUser,
  requestedCompanyId?: string | null
): string {
  const companiesEnabled = user.tenant.enabledFeatures.includes(FEATURE_KEYS.COMPANIES);
  const defaultCompanyId = user.tenant.defaultCompanyId;

  if (!companiesEnabled) {
    if (!defaultCompanyId) {
      throw new ForbiddenError(
        'Organization default company context is not configured.',
        'DEFAULT_COMPANY_MISSING'
      );
    }

    if (requestedCompanyId && requestedCompanyId !== defaultCompanyId) {
      throw new ForbiddenError(
        'Multi-company selection is not enabled for this organization.',
        'COMPANY_ACCESS_DENIED'
      );
    }

    return defaultCompanyId;
  }

  const targetCompanyId =
    requestedCompanyId ?? user.allowedCompanyIds[0] ?? defaultCompanyId;

  if (!targetCompanyId) {
    throw new ForbiddenError(
      'No authorized company is available for this user.',
      'COMPANY_ACCESS_DENIED'
    );
  }

  if (!user.allowedCompanyIds.includes(targetCompanyId)) {
    throw new ForbiddenError(
      'You do not have access to the specified company.',
      'COMPANY_ACCESS_DENIED'
    );
  }

  return targetCompanyId;
}
