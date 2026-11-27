import { Router } from 'express';
import { FEATURE_KEYS, PERMISSION_CODES } from '@cheque-saas/shared';
import { asyncHandler } from '../../core/asyncHandler.js';
import {
  authenticateTenantUser,
  requireFeature,
  requirePermission,
} from '../../middleware/auth.js';
import {
  createCalibrationController,
  createTemplateController,
  duplicateTemplateController,
  getTemplateController,
  listCalibrationController,
  listTemplatesController,
  testPrintCalibrationController,
  updateCalibrationController,
  updateTemplateController,
  updateTemplateStatusController,
} from './template.controller.js';

const templateRouter = Router();
templateRouter.use(authenticateTenantUser);
templateRouter.use(requireFeature(FEATURE_KEYS.TEMPLATES_CALIBRATION));

templateRouter.get(
  '/',
  requirePermission(PERMISSION_CODES.TEMPLATE_VIEW),
  asyncHandler(listTemplatesController)
);
templateRouter.get(
  '/:templateId',
  requirePermission(PERMISSION_CODES.TEMPLATE_VIEW),
  asyncHandler(getTemplateController)
);
templateRouter.post(
  '/',
  requirePermission(PERMISSION_CODES.TEMPLATE_MANAGE),
  asyncHandler(createTemplateController)
);
templateRouter.patch(
  '/:templateId',
  requirePermission(PERMISSION_CODES.TEMPLATE_MANAGE),
  asyncHandler(updateTemplateController)
);
templateRouter.post(
  '/:templateId/duplicate',
  requirePermission(PERMISSION_CODES.TEMPLATE_MANAGE),
  asyncHandler(duplicateTemplateController)
);
templateRouter.patch(
  '/:templateId/status',
  requirePermission(PERMISSION_CODES.TEMPLATE_MANAGE),
  asyncHandler(updateTemplateStatusController)
);

const calibrationRouter = Router();
calibrationRouter.use(authenticateTenantUser);
calibrationRouter.use(requireFeature(FEATURE_KEYS.TEMPLATES_CALIBRATION));

calibrationRouter.get(
  '/',
  requirePermission(PERMISSION_CODES.TEMPLATE_VIEW),
  asyncHandler(listCalibrationController)
);
calibrationRouter.post(
  '/',
  requirePermission(PERMISSION_CODES.TEMPLATE_MANAGE),
  asyncHandler(createCalibrationController)
);
calibrationRouter.patch(
  '/:profileId',
  requirePermission(PERMISSION_CODES.TEMPLATE_MANAGE),
  asyncHandler(updateCalibrationController)
);
calibrationRouter.post(
  '/:profileId/test-print',
  requirePermission(PERMISSION_CODES.TEMPLATE_MANAGE),
  asyncHandler(testPrintCalibrationController)
);

export { templateRouter, calibrationRouter };
