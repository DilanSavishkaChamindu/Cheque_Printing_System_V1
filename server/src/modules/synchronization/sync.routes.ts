import { Router } from 'express';
import { PERMISSION_CODES } from '@cheque-saas/shared';
import { asyncHandler } from '../../core/asyncHandler.js';
import { authenticateTenantUser, requirePermission } from '../../middleware/auth.js';
import {
  approveDeviceController,
  listConflictsController,
  listDevicesController,
  listSyncLogsController,
  requestOfflineAllocationController,
  resolveConflictController,
  revokeDeviceController,
  syncBootstrapController,
  syncPushController,
} from './sync.controller.js';

const router = Router();

router.use(authenticateTenantUser);

// Registered Devices & Offline Allocations
router.get('/devices', asyncHandler(listDevicesController));
router.post(
  '/devices/:deviceId/approve',
  requirePermission(PERMISSION_CODES.DEVICE_MANAGE),
  asyncHandler(approveDeviceController)
);
router.post(
  '/devices/:deviceId/revoke',
  requirePermission(PERMISSION_CODES.DEVICE_MANAGE),
  asyncHandler(revokeDeviceController)
);
router.post(
  '/allocations/request',
  requirePermission(PERMISSION_CODES.CHEQUE_BOOK_MANAGE),
  asyncHandler(requestOfflineAllocationController)
);

// Bootstrap & Queue Processing
router.get('/bootstrap', asyncHandler(syncBootstrapController));
router.post('/push', asyncHandler(syncPushController));

// Conflict Review & Logs
router.get('/conflicts', asyncHandler(listConflictsController));
router.post(
  '/conflicts/:conflictId/resolve',
  requirePermission(PERMISSION_CODES.CHEQUE_EDIT),
  asyncHandler(resolveConflictController)
);
router.get('/logs', asyncHandler(listSyncLogsController));

export { router as syncRouter };
