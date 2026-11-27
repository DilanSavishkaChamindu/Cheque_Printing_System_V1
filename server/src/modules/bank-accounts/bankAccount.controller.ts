import type { Request, Response } from 'express';
import {
  createBankAccountSchema,
  listBankAccountsQuerySchema,
  updateBankAccountSchema,
  updateBankAccountStatusSchema,
  uuidSchema,
} from '@cheque-saas/shared';
import { sendCreated, sendPaginated, sendSuccess } from '../../core/response.js';
import { getClientIp, getUserAgent } from '../../utils/sanitize.js';
import {
  createBankAccount,
  getBankAccountById,
  listBankAccounts,
  listReferenceBanksForAccounts,
  updateBankAccount,
  updateBankAccountStatus,
} from './bankAccount.service.js';

function getMeta(req: Request) {
  return {
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    requestId: req.requestId ?? null,
  };
}

export async function listBankAccountsController(req: Request, res: Response): Promise<void> {
  const query = listBankAccountsQuerySchema.parse(req.query);
  const result = await listBankAccounts(req.tenantUser!, query);
  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    totalItems: result.totalItems,
  });
}

export async function listReferenceBanksController(req: Request, res: Response): Promise<void> {
  const banks = await listReferenceBanksForAccounts(req.tenantUser!.tenantId);
  sendSuccess(res, banks, 'Reference banks retrieved.');
}

export async function getBankAccountController(req: Request, res: Response): Promise<void> {
  const bankAccountId = uuidSchema.parse(req.params.bankAccountId);
  const account = await getBankAccountById(req.tenantUser!, bankAccountId);
  sendSuccess(res, account, 'Bank account retrieved.');
}

export async function createBankAccountController(req: Request, res: Response): Promise<void> {
  const input = createBankAccountSchema.parse(req.body);
  const account = await createBankAccount(req.tenantUser!, input, getMeta(req));
  sendCreated(res, account, 'Bank account created successfully.');
}

export async function updateBankAccountController(req: Request, res: Response): Promise<void> {
  const bankAccountId = uuidSchema.parse(req.params.bankAccountId);
  const input = updateBankAccountSchema.parse(req.body);
  const account = await updateBankAccount(req.tenantUser!, bankAccountId, input, getMeta(req));
  sendSuccess(res, account, 'Bank account updated successfully.');
}

export async function updateBankAccountStatusController(
  req: Request,
  res: Response
): Promise<void> {
  const bankAccountId = uuidSchema.parse(req.params.bankAccountId);
  const input = updateBankAccountStatusSchema.parse(req.body);
  const account = await updateBankAccountStatus(
    req.tenantUser!,
    bankAccountId,
    input.status,
    getMeta(req)
  );
  sendSuccess(res, account, `Bank account status updated to ${input.status}.`);
}
