import { Router } from 'express';
import { FEATURE_KEYS, PERMISSION_CODES } from '@cheque-saas/shared';
import { asyncHandler } from '../../core/asyncHandler.js';
import {
  authenticateTenantUser,
  requireFeature,
  requirePermission,
} from '../../middleware/auth.js';
import {
  createReceivedChequeController,
  getReceivedChequeController,
  getReceivedChequeOptionsController,
  listReceivedChequesController,
  updateReceivedChequeController,
  updateReceivedChequeStatusController,
} from './receivedCheque.controller.js';

const router = Router();

router.use(authenticateTenantUser);
router.use(requireFeature(FEATURE_KEYS.RECEIVED_CHEQUES));

router.get(
  '/options',
  requirePermission(PERMISSION_CODES.RECEIVED_CHEQUE_VIEW),
  asyncHandler(getReceivedChequeOptionsController)
);
router.get(
  '/',
  requirePermission(PERMISSION_CODES.RECEIVED_CHEQUE_VIEW),
  asyncHandler(listReceivedChequesController)
);
router.get(
  '/:receivedChequeId',
  requirePermission(PERMISSION_CODES.RECEIVED_CHEQUE_VIEW),
  asyncHandler(getReceivedChequeController)
);
router.post(
  '/',
  requirePermission(PERMISSION_CODES.RECEIVED_CHEQUE_MANAGE),
  asyncHandler(createReceivedChequeController)
);
router.patch(
  '/:receivedChequeId',
  requirePermission(PERMISSION_CODES.RECEIVED_CHEQUE_MANAGE),
  asyncHandler(updateReceivedChequeController)
);
router.patch(
  '/:receivedChequeId/status',
  requirePermission(PERMISSION_CODES.RECEIVED_CHEQUE_MANAGE),
  asyncHandler(updateReceivedChequeStatusController)
);

export { router as receivedChequeRouter };
