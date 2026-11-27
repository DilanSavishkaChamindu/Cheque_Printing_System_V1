import { Router } from 'express';
import { FEATURE_KEYS, PERMISSION_CODES } from '@cheque-saas/shared';
import { asyncHandler } from '../../core/asyncHandler.js';
import {
  authenticateTenantUser,
  requireFeature,
  requirePermission,
} from '../../middleware/auth.js';
import {
  confirmRestoreController,
  exportBackupController,
  listBackupsController,
  previewRestoreController,
} from './backup.controller.js';

const router = Router();

router.use(authenticateTenantUser);
router.use(requireFeature(FEATURE_KEYS.BACKUP_RESTORE));

router.get(
  '/',
  requirePermission(PERMISSION_CODES.BACKUP_VIEW),
  asyncHandler(listBackupsController)
);
router.post(
  '/export',
  requirePermission(PERMISSION_CODES.BACKUP_MANAGE),
  asyncHandler(exportBackupController)
);
router.post(
  '/restore/preview',
  requirePermission(PERMISSION_CODES.BACKUP_MANAGE),
  asyncHandler(previewRestoreController)
);
router.post(
  '/restore/:restoreJobId/confirm',
  requirePermission(PERMISSION_CODES.BACKUP_MANAGE),
  asyncHandler(confirmRestoreController)
);

export { router as backupRouter };
