import { Router } from 'express';
import { asyncHandler } from '../../core/asyncHandler.js';
import { getHealthController } from './health.controller.js';

const router = Router();

router.get('/', asyncHandler(getHealthController));

export { router as healthRouter };
