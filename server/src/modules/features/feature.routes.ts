import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler.js';
import { authenticateTenantUser } from '../../middleware/auth.js';
import { getMyFeaturesController } from './feature.controller.js';

const router = Router();

router.use(authenticateTenantUser);
router.get('/my', asyncHandler(getMyFeaturesController));

export { router as featureRouter };
