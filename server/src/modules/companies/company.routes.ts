import { Router } from 'express';
import { FEATURE_KEYS, PERMISSION_CODES } from '@cheque-saas/shared';
import { asyncHandler } from '../../core/asyncHandler.js';
import {
  authenticateTenantUser,
  requireFeature,
  requirePermission,
} from '../../middleware/auth.js';
import {
  createCompanyController,
  getCompanyController,
  listCompaniesController,
  updateCompanyController,
  updateCompanyStatusController,
} from './company.controller.js';

const router = Router();

router.use(authenticateTenantUser);
router.use(requireFeature(FEATURE_KEYS.COMPANIES));

router.get(
  '/',
  requirePermission(PERMISSION_CODES.COMPANY_VIEW),
  asyncHandler(listCompaniesController)
);
router.get(
  '/:companyId',
  requirePermission(PERMISSION_CODES.COMPANY_VIEW),
  asyncHandler(getCompanyController)
);
router.post(
  '/',
  requirePermission(PERMISSION_CODES.COMPANY_MANAGE),
  asyncHandler(createCompanyController)
);
router.patch(
  '/:companyId',
  requirePermission(PERMISSION_CODES.COMPANY_MANAGE),
  asyncHandler(updateCompanyController)
);
router.patch(
  '/:companyId/status',
  requirePermission(PERMISSION_CODES.COMPANY_MANAGE),
  asyncHandler(updateCompanyStatusController)
);

export { router as companyRouter };
