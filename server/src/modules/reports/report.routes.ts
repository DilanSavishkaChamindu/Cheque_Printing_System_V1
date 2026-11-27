import { Router } from 'express';
import { FEATURE_KEYS, PERMISSION_CODES } from '@cheque-saas/shared';
import { asyncHandler } from '../../core/asyncHandler.js';
import {
  authenticateTenantUser,
  requireFeature,
  requirePermission,
} from '../../middleware/auth.js';
import {
  exportReportController,
  listReportJobsController,
  runReportFullController,
} from './report.controller.js';

const router = Router();

router.use(authenticateTenantUser);
router.use(requireFeature(FEATURE_KEYS.REPORTS));

router.get(
  '/',
  requirePermission(PERMISSION_CODES.REPORTS_VIEW),
  asyncHandler(runReportFullController)
);
router.post(
  '/export',
  requirePermission(PERMISSION_CODES.REPORTS_EXPORT),
  asyncHandler(exportReportController)
);
router.get(
  '/jobs',
  requirePermission(PERMISSION_CODES.REPORTS_VIEW),
  asyncHandler(listReportJobsController)
);

export { router as reportRouter };
