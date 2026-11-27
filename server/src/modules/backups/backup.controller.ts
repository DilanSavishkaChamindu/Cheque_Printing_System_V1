import type { Request, Response } from 'express';
import { confirmRestoreSchema, uuidSchema } from '@cheque-saas/shared';
import { sendSuccess } from '../../core/response.js';
import { getClientIp, getUserAgent } from '../../utils/sanitize.js';
import {
  confirmTenantRestore,
  exportTenantBackup,
  listTenantBackupHistory,
  previewTenantRestore,
} from './backup.service.js';

function getMeta(req: Request) {
  return {
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    requestId: req.requestId ?? null,
  };
}

export async function listBackupsController(req: Request, res: Response): Promise<void> {
  const history = await listTenantBackupHistory(req.tenantUser!);
  sendSuccess(res, history, 'Backup and restore history retrieved.');
}

export async function exportBackupController(req: Request, res: Response): Promise<void> {
  const result = await exportTenantBackup(req.tenantUser!, getMeta(req));
  sendSuccess(res, result, 'Organization backup exported successfully.');
}

export async function previewRestoreController(req: Request, res: Response): Promise<void> {
  const preview = await previewTenantRestore(req.tenantUser!, req.body, getMeta(req));
  sendSuccess(res, preview, 'Backup validation and restore preview completed.');
}

export async function confirmRestoreController(req: Request, res: Response): Promise<void> {
  const restoreJobId = uuidSchema.parse(req.params.restoreJobId);
  confirmRestoreSchema.parse(req.body);
  const result = await confirmTenantRestore(req.tenantUser!, restoreJobId, getMeta(req));
  sendSuccess(res, result, 'Organization restore executed successfully.');
}
