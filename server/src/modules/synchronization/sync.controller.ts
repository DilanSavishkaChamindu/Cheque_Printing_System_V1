import type { Request, Response } from 'express';
import {
  listSyncConflictsQuerySchema,
  paginationQuerySchema,
  requestOfflineRangeSchema,
  resolveSyncConflictSchema,
  revokeDeviceSchema,
  syncPushBatchSchema,
  uuidSchema,
} from '@cheque-saas/shared';
import { sendCreated, sendPaginated, sendSuccess } from '../../core/response.js';
import { getClientIp, getUserAgent } from '../../utils/sanitize.js';
import {
  approveRegisteredDevice,
  getOfflineSyncBootstrap,
  listRegisteredDevices,
  listSyncConflicts,
  listSyncLogs,
  processSyncPushBatch,
  requestOfflineAllocationForDevice,
  resolveSyncConflict,
  revokeRegisteredDevice,
} from './sync.service.js';

function getMeta(req: Request) {
  return {
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    requestId: req.requestId ?? null,
  };
}

export async function listDevicesController(req: Request, res: Response): Promise<void> {
  const devices = await listRegisteredDevices(req.tenantUser!);
  sendSuccess(res, devices, 'Registered devices retrieved.');
}

export async function approveDeviceController(req: Request, res: Response): Promise<void> {
  const deviceId = uuidSchema.parse(req.params.deviceId);
  const device = await approveRegisteredDevice(req.tenantUser!, deviceId, getMeta(req));
  sendSuccess(res, device, 'Device approved for offline synchronization.');
}

export async function revokeDeviceController(req: Request, res: Response): Promise<void> {
  const deviceId = uuidSchema.parse(req.params.deviceId);
  const input = revokeDeviceSchema.parse(req.body);
  const device = await revokeRegisteredDevice(
    req.tenantUser!,
    deviceId,
    input.reason,
    getMeta(req)
  );
  sendSuccess(res, device, 'Device revoked successfully.');
}

export async function requestOfflineAllocationController(
  req: Request,
  res: Response
): Promise<void> {
  const input = requestOfflineRangeSchema.parse(req.body);
  const allocation = await requestOfflineAllocationForDevice(
    req.tenantUser!,
    input,
    getMeta(req)
  );
  sendCreated(res, allocation, 'Offline cheque number range allocated to device.');
}

export async function syncBootstrapController(req: Request, res: Response): Promise<void> {
  const deviceId =
    req.header('x-device-id') ??
    (typeof req.query.deviceId === 'string' && req.query.deviceId
      ? uuidSchema.parse(req.query.deviceId)
      : undefined);

  const payload = await getOfflineSyncBootstrap(req.tenantUser!, deviceId);
  sendSuccess(res, payload, 'Offline synchronization bootstrap retrieved.');
}

export async function syncPushController(req: Request, res: Response): Promise<void> {
  const input = syncPushBatchSchema.parse(req.body);
  const results = await processSyncPushBatch(req.tenantUser!, input, getMeta(req));
  sendSuccess(res, results, 'Synchronization batch processed.');
}

export async function listConflictsController(req: Request, res: Response): Promise<void> {
  const query = listSyncConflictsQuerySchema.parse(req.query);
  const result = await listSyncConflicts(req.tenantUser!, query);
  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    totalItems: result.totalItems,
  });
}

export async function resolveConflictController(req: Request, res: Response): Promise<void> {
  const conflictId = uuidSchema.parse(req.params.conflictId);
  const input = resolveSyncConflictSchema.parse(req.body);
  const conflict = await resolveSyncConflict(
    req.tenantUser!,
    conflictId,
    input,
    getMeta(req)
  );
  sendSuccess(res, conflict, 'Synchronization conflict resolved.');
}

export async function listSyncLogsController(req: Request, res: Response): Promise<void> {
  const query = paginationQuerySchema.parse(req.query);
  const result = await listSyncLogs(req.tenantUser!, query.page, query.limit);
  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    totalItems: result.totalItems,
  });
}
