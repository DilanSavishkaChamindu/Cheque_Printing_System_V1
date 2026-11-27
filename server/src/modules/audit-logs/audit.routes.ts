import { Router } from 'express';
import { PERMISSION_CODES } from '@cheque-saas/shared';
import { asyncHandler } from '../../core/asyncHandler.js';
import { authenticateTenantUser, requirePermission } from '../../middleware/auth.js';
import { listTenantAuditLogsController } from './audit.controller.js';

const router = Router();

router.use(authenticateTenantUser);
router.get(
  '/',
  requirePermission(PERMISSION_CODES.AUDIT_VIEW),
  asyncHandler(listTenantAuditLogsController)
);

export { router as auditRouter };
