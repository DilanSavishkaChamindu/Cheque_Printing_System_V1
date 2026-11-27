import { Router } from 'express';
import { FEATURE_KEYS, PERMISSION_CODES } from '@cheque-saas/shared';
import { asyncHandler } from '../../core/asyncHandler.js';
import {
  authenticateTenantUser,
  requireFeature,
  requirePermission,
} from '../../middleware/auth.js';
import {
  getLedgerSummaryController,
  listTransactionsController,
  postTransactionController,
  reconcileAccountController,
  reverseTransactionController,
} from './ledger.controller.js';

const router = Router();

router.use(authenticateTenantUser);
router.use(requireFeature(FEATURE_KEYS.BANK_BALANCE));

router.get(
  '/',
  requirePermission(PERMISSION_CODES.BANK_ACCOUNT_VIEW),
  asyncHandler(listTransactionsController)
);
router.get(
  '/summary',
  requirePermission(PERMISSION_CODES.BANK_ACCOUNT_VIEW),
  asyncHandler(getLedgerSummaryController)
);
router.get(
  '/reconcile/:bankAccountId',
  requirePermission(PERMISSION_CODES.BANK_ACCOUNT_VIEW),
  asyncHandler(reconcileAccountController)
);
router.post(
  '/',
  requirePermission(PERMISSION_CODES.BANK_TRANSACTION_MANAGE),
  asyncHandler(postTransactionController)
);
router.post(
  '/:transactionId/reverse',
  requirePermission(PERMISSION_CODES.BANK_TRANSACTION_MANAGE),
  asyncHandler(reverseTransactionController)
);

export { router as bankTransactionRouter };
