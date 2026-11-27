import { Router } from 'express';
import { FEATURE_KEYS, PERMISSION_CODES } from '@cheque-saas/shared';
import { asyncHandler } from '../../core/asyncHandler.js';
import {
  authenticateTenantUser,
  requireFeature,
  requirePermission,
} from '../../middleware/auth.js';
import {
  createBankAccountController,
  getBankAccountController,
  listBankAccountsController,
  listReferenceBanksController,
  updateBankAccountController,
  updateBankAccountStatusController,
} from './bankAccount.controller.js';

const router = Router();

router.use(authenticateTenantUser);
router.use(requireFeature(FEATURE_KEYS.BANK_BALANCE));

router.get(
  '/reference-banks',
  requirePermission(PERMISSION_CODES.BANK_ACCOUNT_VIEW),
  asyncHandler(listReferenceBanksController)
);
router.get(
  '/',
  requirePermission(PERMISSION_CODES.BANK_ACCOUNT_VIEW),
  asyncHandler(listBankAccountsController)
);
router.get(
  '/:bankAccountId',
  requirePermission(PERMISSION_CODES.BANK_ACCOUNT_VIEW),
  asyncHandler(getBankAccountController)
);
router.post(
  '/',
  requirePermission(PERMISSION_CODES.BANK_ACCOUNT_MANAGE),
  asyncHandler(createBankAccountController)
);
router.patch(
  '/:bankAccountId',
  requirePermission(PERMISSION_CODES.BANK_ACCOUNT_MANAGE),
  asyncHandler(updateBankAccountController)
);
router.patch(
  '/:bankAccountId/status',
  requirePermission(PERMISSION_CODES.BANK_ACCOUNT_MANAGE),
  asyncHandler(updateBankAccountStatusController)
);

export { router as bankAccountRouter };
