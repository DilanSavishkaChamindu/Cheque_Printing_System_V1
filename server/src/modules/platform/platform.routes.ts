import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler.js';
import { authenticatePlatformAdmin } from '../../middleware/auth.js';
import {
  bulkSetTenantFeaturesController,
  createGlobalFeatureController,
  getTenantFeatureHistoryController,
  getTenantFeaturesController,
  listGlobalFeaturesController,
  setTenantFeatureController,
  updateGlobalFeatureController,
} from '../features/feature.controller.js';
import {
  createPlatformTenantController,
  getPlatformDashboardController,
  getPlatformTenantDetailsController,
  listPlatformAuditLogsController,
  listPlatformTenantsController,
  listPlatformTenantUsersController,
  updatePlatformTenantController,
  updatePlatformTenantStatusController,
} from './platform.controller.js';

const router = Router();

router.use(authenticatePlatformAdmin);

// Platform Overview & Audit
router.get('/dashboard', asyncHandler(getPlatformDashboardController));
router.get('/audit-logs', asyncHandler(listPlatformAuditLogsController));

// Tenant Management
router.get('/tenants', asyncHandler(listPlatformTenantsController));
router.post('/tenants', asyncHandler(createPlatformTenantController));
router.get('/tenants/:tenantId', asyncHandler(getPlatformTenantDetailsController));
router.patch('/tenants/:tenantId', asyncHandler(updatePlatformTenantController));
router.patch('/tenants/:tenantId/status', asyncHandler(updatePlatformTenantStatusController));
router.get('/tenants/:tenantId/users', asyncHandler(listPlatformTenantUsersController));

// Tenant Feature Allocation & History
router.get('/tenants/:tenantId/features', asyncHandler(getTenantFeaturesController));
router.put('/tenants/:tenantId/features', asyncHandler(bulkSetTenantFeaturesController));
router.put('/tenants/:tenantId/features/:featureKey', asyncHandler(setTenantFeatureController));
router.get('/tenants/:tenantId/features/history', asyncHandler(getTenantFeatureHistoryController));

// Global Feature Catalog
router.get('/features', asyncHandler(listGlobalFeaturesController));
router.post('/features', asyncHandler(createGlobalFeatureController));
router.patch('/features/:featureId', asyncHandler(updateGlobalFeatureController));

export { router as platformRouter };
