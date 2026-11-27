import { Router } from 'express';
import { FEATURE_KEYS, PERMISSION_CODES } from '@cheque-saas/shared';
import { asyncHandler } from '../../core/asyncHandler.js';
import {
  authenticateTenantUser,
  requireFeature,
  requirePermission,
} from '../../middleware/auth.js';
import {
  createBankBranchController,
  createBankController,
  listBankBranchesController,
  listBanksController,
  updateBankBranchController,
  updateBankBranchStatusController,
  updateBankController,
  updateBankStatusController,
} from './bank.controller.js';

const bankRouter = Router();
bankRouter.use(authenticateTenantUser);
bankRouter.use(requireFeature(FEATURE_KEYS.BANK_MANAGEMENT));

bankRouter.get('/', requirePermission(PERMISSION_CODES.BANK_VIEW), asyncHandler(listBanksController));
bankRouter.post('/', requirePermission(PERMISSION_CODES.BANK_MANAGE), asyncHandler(createBankController));
bankRouter.patch('/:bankId', requirePermission(PERMISSION_CODES.BANK_MANAGE), asyncHandler(updateBankController));
bankRouter.patch('/:bankId/status', requirePermission(PERMISSION_CODES.BANK_MANAGE), asyncHandler(updateBankStatusController));

const bankBranchRouter = Router();
bankBranchRouter.use(authenticateTenantUser);
bankBranchRouter.use(requireFeature(FEATURE_KEYS.BANK_MANAGEMENT));

bankBranchRouter.get('/', requirePermission(PERMISSION_CODES.BANK_VIEW), asyncHandler(listBankBranchesController));
bankBranchRouter.post('/', requirePermission(PERMISSION_CODES.BANK_MANAGE), asyncHandler(createBankBranchController));
bankBranchRouter.patch('/:branchId', requirePermission(PERMISSION_CODES.BANK_MANAGE), asyncHandler(updateBankBranchController));
bankBranchRouter.patch('/:branchId/status', requirePermission(PERMISSION_CODES.BANK_MANAGE), asyncHandler(updateBankBranchStatusController));

export { bankRouter, bankBranchRouter };
