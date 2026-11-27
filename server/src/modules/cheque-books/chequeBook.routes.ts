import { Router } from 'express';
import { FEATURE_KEYS, PERMISSION_CODES } from '@cheque-saas/shared';
import { asyncHandler } from '../../core/asyncHandler.js';
import {
  authenticateTenantUser,
  requireAnyFeature,
  requirePermission,
} from '../../middleware/auth.js';
import {
  allocateRangeController,
  createChequeBookController,
  listAllocationsController,
  listChequeBooksController,
  revokeAllocationController,
  updateChequeBookStatusController,
} from './chequeBook.controller.js';

const router = Router();

router.use(authenticateTenantUser);
router.use(
  requireAnyFeature(
    FEATURE_KEYS.NEW_CHEQUE,
    FEATURE_KEYS.BANK_BALANCE,
    FEATURE_KEYS.CHEQUE_HISTORY
  )
);

router.get(
  '/',
  requirePermission(PERMISSION_CODES.CHEQUE_BOOK_VIEW),
  asyncHandler(listChequeBooksController)
);
router.post(
  '/',
  requirePermission(PERMISSION_CODES.CHEQUE_BOOK_MANAGE),
  asyncHandler(createChequeBookController)
);
router.patch(
  '/:chequeBookId/status',
  requirePermission(PERMISSION_CODES.CHEQUE_BOOK_MANAGE),
  asyncHandler(updateChequeBookStatusController)
);
router.get(
  '/:chequeBookId/allocations',
  requirePermission(PERMISSION_CODES.CHEQUE_BOOK_VIEW),
  asyncHandler(listAllocationsController)
);
router.post(
  '/:chequeBookId/allocations',
  requirePermission(PERMISSION_CODES.CHEQUE_BOOK_MANAGE),
  asyncHandler(allocateRangeController)
);
router.post(
  '/allocations/:allocationId/revoke',
  requirePermission(PERMISSION_CODES.CHEQUE_BOOK_MANAGE),
  asyncHandler(revokeAllocationController)
);

export { router as chequeBookRouter };
