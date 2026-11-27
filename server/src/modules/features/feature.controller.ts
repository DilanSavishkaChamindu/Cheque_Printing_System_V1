import type { Request, Response } from 'express';
import {
  bulkSetTenantFeaturesSchema,
  createFeatureSchema,
  paginationQuerySchema,
  setTenantFeatureSchema,
  updateFeatureSchema,
  uuidSchema,
} from '@cheque-saas/shared';
import { sendCreated, sendPaginated, sendSuccess } from '../../core/response.js';
import { getClientIp, getUserAgent } from '../../utils/sanitize.js';
import {
  bulkSetTenantFeatureEntitlements,
  createGlobalFeature,
  getTenantFeatureEntitlements,
  getTenantFeatureHistory,
  listGlobalFeatures,
  setTenantFeatureEntitlement,
  updateGlobalFeature,
} from './feature.service.js';

function getPlatformActor(req: Request) {
  return {
    platformAdminId: req.platformAdmin!.id,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  };
}

export async function getMyFeaturesController(req: Request, res: Response): Promise<void> {
  const tenantUser = req.tenantUser!;
  const entitlements = await getTenantFeatureEntitlements(tenantUser.tenantId);

  sendSuccess(
    res,
    {
      enabledFeatureKeys: tenantUser.tenant.enabledFeatures,
      features: entitlements.filter((item) => item.effectiveEnabled),
    },
    'Organization feature entitlements retrieved.'
  );
}

export async function listGlobalFeaturesController(
  _req: Request,
  res: Response
): Promise<void> {
  const features = await listGlobalFeatures();
  sendSuccess(res, features, 'Global feature catalog retrieved.');
}

export async function createGlobalFeatureController(
  req: Request,
  res: Response
): Promise<void> {
  const input = createFeatureSchema.parse(req.body);
  const feature = await createGlobalFeature(input, getPlatformActor(req));
  sendCreated(res, feature, 'Feature created successfully.');
}

export async function updateGlobalFeatureController(
  req: Request,
  res: Response
): Promise<void> {
  const featureId = uuidSchema.parse(req.params.featureId);
  const input = updateFeatureSchema.parse(req.body);
  const feature = await updateGlobalFeature(featureId, input, getPlatformActor(req));
  sendSuccess(res, feature, 'Feature updated successfully.');
}

export async function getTenantFeaturesController(
  req: Request,
  res: Response
): Promise<void> {
  const tenantId = uuidSchema.parse(req.params.tenantId);
  const features = await getTenantFeatureEntitlements(tenantId);
  sendSuccess(res, features, 'Tenant feature entitlements retrieved.');
}

export async function setTenantFeatureController(
  req: Request,
  res: Response
): Promise<void> {
  const tenantId = uuidSchema.parse(req.params.tenantId);
  const featureKey = String(req.params.featureKey);
  const input = setTenantFeatureSchema.parse(req.body);
  const features = await setTenantFeatureEntitlement(
    tenantId,
    featureKey,
    input,
    getPlatformActor(req)
  );
  sendSuccess(res, features, 'Tenant feature entitlement updated.');
}

export async function bulkSetTenantFeaturesController(
  req: Request,
  res: Response
): Promise<void> {
  const tenantId = uuidSchema.parse(req.params.tenantId);
  const input = bulkSetTenantFeaturesSchema.parse(req.body);
  const features = await bulkSetTenantFeatureEntitlements(
    tenantId,
    input,
    getPlatformActor(req)
  );
  sendSuccess(res, features, 'Tenant features updated successfully.');
}

export async function getTenantFeatureHistoryController(
  req: Request,
  res: Response
): Promise<void> {
  const tenantId = uuidSchema.parse(req.params.tenantId);
  const query = paginationQuerySchema.parse(req.query);
  const result = await getTenantFeatureHistory(tenantId, query.page, query.limit);

  sendPaginated(
    res,
    result.items,
    {
      page: result.page,
      limit: result.limit,
      totalItems: result.totalItems,
    },
    'Feature change history retrieved.'
  );
}
