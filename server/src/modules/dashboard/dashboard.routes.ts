import { Router } from 'express';
import { FEATURE_KEYS, PERMISSION_CODES } from '@cheque-saas/shared';
import { asyncHandler } from '../../core/asyncHandler.js';
import {
  authenticateTenantUser,
  requireFeature,
  requirePermission,
} from '../../middleware/auth.js';
import { getDashboardController } from './dashboard.controller.js';

const router = Router();

router.use(authenticateTenantUser);
router.use(requireFeature(FEATURE_KEYS.DASHBOARD));

router.get(
  '/',
  requirePermission(PERMISSION_CODES.DASHBOARD_VIEW),
  asyncHandler(getDashboardController)
);

export { router as dashboardRouter };
