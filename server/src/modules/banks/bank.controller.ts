import type { Request, Response } from 'express';
import {
  createBankBranchSchema,
  createBankSchema,
  listBankBranchesQuerySchema,
  listBanksQuerySchema,
  updateBankBranchSchema,
  updateBankSchema,
  updateRecordStatusSchema,
  uuidSchema,
} from '@cheque-saas/shared';
import { sendCreated, sendPaginated, sendSuccess } from '../../core/response.js';
import { getClientIp, getUserAgent } from '../../utils/sanitize.js';
import {
  createTenantBank,
  createTenantBranch,
  listVisibleBanks,
  listVisibleBranches,
  updateTenantBank,
  updateTenantBankStatus,
  updateTenantBranch,
  updateTenantBranchStatus,
} from './bank.service.js';

function getMeta(req: Request) {
  return {
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    requestId: req.requestId ?? null,
  };
}

export async function listBanksController(req: Request, res: Response): Promise<void> {
  const query = listBanksQuerySchema.parse(req.query);
  const result = await listVisibleBanks(req.tenantUser!.tenantId, query);
  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    totalItems: result.totalItems,
  });
}

export async function createBankController(req: Request, res: Response): Promise<void> {
  const input = createBankSchema.parse(req.body);
  const bank = await createTenantBank(req.tenantUser!, input, getMeta(req));
  sendCreated(res, bank, 'Bank created successfully.');
}

export async function updateBankController(req: Request, res: Response): Promise<void> {
  const bankId = uuidSchema.parse(req.params.bankId);
  const input = updateBankSchema.parse(req.body);
  const bank = await updateTenantBank(req.tenantUser!, bankId, input, getMeta(req));
  sendSuccess(res, bank, 'Bank updated successfully.');
}

export async function updateBankStatusController(req: Request, res: Response): Promise<void> {
  const bankId = uuidSchema.parse(req.params.bankId);
  const input = updateRecordStatusSchema.parse(req.body);
  const bank = await updateTenantBankStatus(
    req.tenantUser!,
    bankId,
    input.status,
    getMeta(req)
  );
  sendSuccess(res, bank, `Bank status updated to ${input.status}.`);
}

export async function listBankBranchesController(req: Request, res: Response): Promise<void> {
  const query = listBankBranchesQuerySchema.parse(req.query);
  const result = await listVisibleBranches(req.tenantUser!.tenantId, query);
  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    totalItems: result.totalItems,
  });
}

export async function createBankBranchController(req: Request, res: Response): Promise<void> {
  const input = createBankBranchSchema.parse(req.body);
  const branch = await createTenantBranch(req.tenantUser!, input, getMeta(req));
  sendCreated(res, branch, 'Bank branch created successfully.');
}

export async function updateBankBranchController(req: Request, res: Response): Promise<void> {
  const branchId = uuidSchema.parse(req.params.branchId);
  const input = updateBankBranchSchema.parse(req.body);
  const branch = await updateTenantBranch(req.tenantUser!, branchId, input, getMeta(req));
  sendSuccess(res, branch, 'Bank branch updated successfully.');
}

export async function updateBankBranchStatusController(
  req: Request,
  res: Response
): Promise<void> {
  const branchId = uuidSchema.parse(req.params.branchId);
  const input = updateRecordStatusSchema.parse(req.body);
  const branch = await updateTenantBranchStatus(
    req.tenantUser!,
    branchId,
    input.status,
    getMeta(req)
  );
  sendSuccess(res, branch, `Bank branch status updated to ${input.status}.`);
}
