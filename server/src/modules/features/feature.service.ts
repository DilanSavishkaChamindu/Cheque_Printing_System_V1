import type {
  BulkSetTenantFeaturesInput,
  CreateFeatureInput,
  FeatureCatalogDto,
  SetTenantFeatureInput,
  TenantFeatureEntitlementDto,
  TenantFeatureHistoryDto,
  UpdateFeatureInput,
} from '@cheque-saas/shared';
import { getPrisma } from '../../config/prisma.js';
import { ConflictError, NotFoundError } from '../../core/errors.js';
import { recordPlatformAudit } from '../audit-logs/audit.service.js';

export interface PlatformActorMeta {
  platformAdminId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

function mapFeatureDto(feature: {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string | null;
  isGlobalActive: boolean;
  isDefaultEnabled: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): FeatureCatalogDto {
  return {
    ...feature,
    createdAt: feature.createdAt.toISOString(),
    updatedAt: feature.updatedAt.toISOString(),
  };
}

export async function listGlobalFeatures(): Promise<FeatureCatalogDto[]> {
  const prisma = getPrisma();
  const features = await prisma.feature.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return features.map(mapFeatureDto);
}

export async function createGlobalFeature(
  input: CreateFeatureInput,
  actor: PlatformActorMeta
): Promise<FeatureCatalogDto> {
  const prisma = getPrisma();
  const existing = await prisma.feature.findUnique({ where: { key: input.key } });
  if (existing) {
    throw new ConflictError(`Feature key '${input.key}' already exists.`);
  }

  const created = await prisma.$transaction(async (tx) => {
    const feature = await tx.feature.create({
      data: {
        key: input.key,
        name: input.name,
        description: input.description ?? null,
        category: input.category ?? null,
        isGlobalActive: input.isGlobalActive,
        isDefaultEnabled: input.isDefaultEnabled,
        sortOrder: input.sortOrder,
      },
    });

    await recordPlatformAudit(
      {
        platformAdminId: actor.platformAdminId,
        action: 'FEATURE_CREATED',
        entityType: 'Feature',
        entityId: feature.id,
        newValues: feature,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      },
      tx
    );

    return feature;
  });

  return mapFeatureDto(created);
}

export async function updateGlobalFeature(
  featureId: string,
  input: UpdateFeatureInput,
  actor: PlatformActorMeta
): Promise<FeatureCatalogDto> {
  const prisma = getPrisma();
  const existing = await prisma.feature.findUnique({ where: { id: featureId } });
  if (!existing) {
    throw new NotFoundError('Feature');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const feature = await tx.feature.update({
      where: { id: featureId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.isGlobalActive !== undefined ? { isGlobalActive: input.isGlobalActive } : {}),
        ...(input.isDefaultEnabled !== undefined ? { isDefaultEnabled: input.isDefaultEnabled } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });

    await recordPlatformAudit(
      {
        platformAdminId: actor.platformAdminId,
        action: 'FEATURE_UPDATED',
        entityType: 'Feature',
        entityId: feature.id,
        previousValues: existing,
        newValues: feature,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      },
      tx
    );

    return feature;
  });

  return mapFeatureDto(updated);
}

export async function getTenantFeatureEntitlements(
  tenantId: string
): Promise<TenantFeatureEntitlementDto[]> {
  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });

  if (!tenant) {
    throw new NotFoundError('Tenant');
  }

  const [features, tenantFeatures] = await Promise.all([
    prisma.feature.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.tenantFeature.findMany({
      where: { tenantId },
    }),
  ]);

  const byFeatureId = new Map(tenantFeatures.map((tf) => [tf.featureId, tf]));
  const now = new Date();

  return features.map((feature) => {
    const tf = byFeatureId.get(feature.id);
    const isEnabledForTenant = tf ? tf.isEnabled : feature.isDefaultEnabled;
    const notExpired = !tf?.expiresAt || tf.expiresAt > now;
    const effectiveEnabled =
      feature.isGlobalActive && isEnabledForTenant && notExpired;

    return {
      featureId: feature.id,
      featureKey: feature.key,
      featureName: feature.name,
      description: feature.description,
      category: feature.category,
      isGlobalActive: feature.isGlobalActive,
      isDefaultEnabled: feature.isDefaultEnabled,
      isEnabledForTenant,
      effectiveEnabled,
      isOverride: tf?.isOverride ?? false,
      overrideReason: tf?.overrideReason ?? null,
      expiresAt: tf?.expiresAt ? tf.expiresAt.toISOString() : null,
      updatedAt: tf?.updatedAt ? tf.updatedAt.toISOString() : null,
    };
  });
}

export async function setTenantFeatureEntitlement(
  tenantId: string,
  featureKey: string,
  input: SetTenantFeatureInput,
  actor: PlatformActorMeta
): Promise<TenantFeatureEntitlementDto[]> {
  const prisma = getPrisma();

  const [tenant, feature] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } }),
    prisma.feature.findUnique({ where: { key: featureKey } }),
  ]);

  if (!tenant) {
    throw new NotFoundError('Tenant');
  }
  if (!feature) {
    throw new NotFoundError('Feature');
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.tenantFeature.findUnique({
      where: {
        tenantId_featureId: {
          tenantId,
          featureId: feature.id,
        },
      },
    });

    const previousEnabled = existing ? existing.isEnabled : feature.isDefaultEnabled;
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;

    await tx.tenantFeature.upsert({
      where: {
        tenantId_featureId: {
          tenantId,
          featureId: feature.id,
        },
      },
      update: {
        isEnabled: input.isEnabled,
        isOverride: input.isOverride,
        overrideReason: input.overrideReason ?? null,
        expiresAt,
        updatedBy: actor.platformAdminId,
      },
      create: {
        tenantId,
        featureId: feature.id,
        isEnabled: input.isEnabled,
        isOverride: input.isOverride,
        overrideReason: input.overrideReason ?? null,
        expiresAt,
        updatedBy: actor.platformAdminId,
      },
    });

    await tx.tenantFeatureHistory.create({
      data: {
        tenantId,
        featureId: feature.id,
        previousEnabled,
        newEnabled: input.isEnabled,
        isOverride: input.isOverride,
        reason: input.overrideReason ?? null,
        changedByActorType: 'PLATFORM_ADMIN',
        changedById: actor.platformAdminId,
      },
    });

    await recordPlatformAudit(
      {
        platformAdminId: actor.platformAdminId,
        tenantId,
        action: input.isEnabled ? 'TENANT_FEATURE_ENABLED' : 'TENANT_FEATURE_DISABLED',
        entityType: 'TenantFeature',
        entityId: feature.id,
        previousValues: { featureKey: feature.key, isEnabled: previousEnabled },
        newValues: {
          featureKey: feature.key,
          isEnabled: input.isEnabled,
          isOverride: input.isOverride,
          overrideReason: input.overrideReason ?? null,
          expiresAt: expiresAt?.toISOString() ?? null,
        },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      },
      tx
    );
  });

  return getTenantFeatureEntitlements(tenantId);
}

export async function bulkSetTenantFeatureEntitlements(
  tenantId: string,
  input: BulkSetTenantFeaturesInput,
  actor: PlatformActorMeta
): Promise<TenantFeatureEntitlementDto[]> {
  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });
  if (!tenant) {
    throw new NotFoundError('Tenant');
  }

  const featureKeys = input.features.map((f) => f.featureKey);
  const features = await prisma.feature.findMany({
    where: { key: { in: featureKeys } },
  });
  const byKey = new Map(features.map((f) => [f.key, f]));

  for (const key of featureKeys) {
    if (!byKey.has(key)) {
      throw new NotFoundError(`Feature '${key}'`);
    }
  }

  await prisma.$transaction(async (tx) => {
    const existingRows = await tx.tenantFeature.findMany({
      where: {
        tenantId,
        featureId: { in: features.map((f) => f.id) },
      },
    });
    const existingByFeatureId = new Map(existingRows.map((r) => [r.featureId, r]));

    for (const item of input.features) {
      const feature = byKey.get(item.featureKey)!;
      const existing = existingByFeatureId.get(feature.id);
      const previousEnabled = existing ? existing.isEnabled : feature.isDefaultEnabled;
      const expiresAt = item.expiresAt ? new Date(item.expiresAt) : null;

      await tx.tenantFeature.upsert({
        where: {
          tenantId_featureId: {
            tenantId,
            featureId: feature.id,
          },
        },
        update: {
          isEnabled: item.isEnabled,
          isOverride: item.isOverride,
          overrideReason: item.overrideReason ?? null,
          expiresAt,
          updatedBy: actor.platformAdminId,
        },
        create: {
          tenantId,
          featureId: feature.id,
          isEnabled: item.isEnabled,
          isOverride: item.isOverride,
          overrideReason: item.overrideReason ?? null,
          expiresAt,
          updatedBy: actor.platformAdminId,
        },
      });

      if (previousEnabled !== item.isEnabled || existing?.isOverride !== item.isOverride) {
        await tx.tenantFeatureHistory.create({
          data: {
            tenantId,
            featureId: feature.id,
            previousEnabled,
            newEnabled: item.isEnabled,
            isOverride: item.isOverride,
            reason: item.overrideReason ?? null,
            changedByActorType: 'PLATFORM_ADMIN',
            changedById: actor.platformAdminId,
          },
        });
      }
    }

    await recordPlatformAudit(
      {
        platformAdminId: actor.platformAdminId,
        tenantId,
        action: 'TENANT_FEATURES_BULK_UPDATED',
        entityType: 'TenantFeature',
        entityId: tenantId,
        newValues: { updatedCount: input.features.length, features: input.features },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      },
      tx
    );
  });

  return getTenantFeatureEntitlements(tenantId);
}

export async function getTenantFeatureHistory(
  tenantId: string,
  page = 1,
  limit = 20
): Promise<{
  items: TenantFeatureHistoryDto[];
  totalItems: number;
  page: number;
  limit: number;
}> {
  const prisma = getPrisma();
  const skip = (page - 1) * limit;

  const [rows, totalItems] = await Promise.all([
    prisma.tenantFeatureHistory.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        feature: {
          select: { key: true, name: true },
        },
      },
    }),
    prisma.tenantFeatureHistory.count({ where: { tenantId } }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      featureId: row.featureId,
      featureKey: row.feature.key,
      featureName: row.feature.name,
      previousEnabled: row.previousEnabled,
      newEnabled: row.newEnabled,
      isOverride: row.isOverride,
      reason: row.reason,
      changedByActorType: row.changedByActorType,
      changedById: row.changedById,
      createdAt: row.createdAt.toISOString(),
    })),
    totalItems,
    page,
    limit,
  };
}
