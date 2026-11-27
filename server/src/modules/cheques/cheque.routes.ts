import { Router } from 'express';
import { FEATURE_KEYS, PERMISSION_CODES } from '@cheque-saas/shared';
import { asyncHandler } from '../../core/asyncHandler.js';
import {
  authenticateTenantUser,
  requireAnyFeature,
  requireFeature,
  requirePermission,
} from '../../middleware/auth.js';
import {
  cancelChequeController,
  createChequeController,
  downloadChequePdfController,
  getChequeController,
  getCreationContextController,
  issueDraftChequeController,
  listChequesController,
  recordChequePrintController,
  updateChequeBankingStatusController,
  updateChequeController,
} from './cheque.controller.js';

const router = Router();

router.use(authenticateTenantUser);

router.get(
  '/creation-context',
  requireFeature(FEATURE_KEYS.NEW_CHEQUE),
  requirePermission(PERMISSION_CODES.CHEQUE_CREATE),
  asyncHandler(getCreationContextController)
);

router.post(
  '/',
  requireFeature(FEATURE_KEYS.NEW_CHEQUE),
  requirePermission(PERMISSION_CODES.CHEQUE_CREATE),
  asyncHandler(createChequeController)
);

router.get(
  '/',
  requireFeature(FEATURE_KEYS.CHEQUE_HISTORY),
  requirePermission(PERMISSION_CODES.CHEQUE_HISTORY_VIEW),
  asyncHandler(listChequesController)
);

router.get(
  '/:chequeId',
  requireAnyFeature(FEATURE_KEYS.CHEQUE_HISTORY, FEATURE_KEYS.NEW_CHEQUE),
  asyncHandler(getChequeController)
);

router.patch(
  '/:chequeId',
  requireAnyFeature(FEATURE_KEYS.CHEQUE_HISTORY, FEATURE_KEYS.NEW_CHEQUE),
  requirePermission(PERMISSION_CODES.CHEQUE_EDIT),
  asyncHandler(updateChequeController)
);

router.post(
  '/:chequeId/issue',
  requireAnyFeature(FEATURE_KEYS.CHEQUE_HISTORY, FEATURE_KEYS.NEW_CHEQUE),
  requirePermission(PERMISSION_CODES.CHEQUE_CREATE),
  asyncHandler(issueDraftChequeController)
);

router.post(
  '/:chequeId/cancel',
  requireFeature(FEATURE_KEYS.CHEQUE_HISTORY),
  requirePermission(PERMISSION_CODES.CHEQUE_CANCEL),
  asyncHandler(cancelChequeController)
);

router.patch(
  '/:chequeId/banking-status',
  requireFeature(FEATURE_KEYS.CHEQUE_HISTORY),
  requirePermission(PERMISSION_CODES.CHEQUE_STATUS_UPDATE),
  asyncHandler(updateChequeBankingStatusController)
);

router.post(
  '/:chequeId/print',
  requireAnyFeature(FEATURE_KEYS.NEW_CHEQUE, FEATURE_KEYS.CHEQUE_HISTORY),
  requirePermission(PERMISSION_CODES.CHEQUE_PRINT),
  asyncHandler(recordChequePrintController)
);

router.get(
  '/:chequeId/pdf',
  requireAnyFeature(FEATURE_KEYS.NEW_CHEQUE, FEATURE_KEYS.CHEQUE_HISTORY),
  requirePermission(PERMISSION_CODES.CHEQUE_PRINT),
  asyncHandler(downloadChequePdfController)
);

export { router as chequeRouter };
