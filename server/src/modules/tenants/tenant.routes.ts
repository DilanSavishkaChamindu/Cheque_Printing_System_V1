import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler.js';
import { authenticateTenantUser, requireClientAdmin } from '../../middleware/auth.js';
import {
  getCurrentTenantController,
  updateCurrentTenantController,
} from './tenant.controller.js';

const router = Router();

router.use(authenticateTenantUser);
router.get('/current', asyncHandler(getCurrentTenantController));
router.patch('/current', requireClientAdmin, asyncHandler(updateCurrentTenantController));

export { router as tenantRouter };
