import type { Request, Response } from 'express';
import {
  cancelChequeSchema,
  createIssuedChequeSchema,
  listChequesQuerySchema,
  recordChequePrintSchema,
  updateChequeBankingStatusSchema,
  updateIssuedChequeSchema,
  uuidSchema,
} from '@cheque-saas/shared';
import { sendCreated, sendPaginated, sendSuccess } from '../../core/response.js';
import { getClientIp, getUserAgent } from '../../utils/sanitize.js';
import {
  cancelIssuedCheque,
  createIssuedCheque,
  getChequeCreationContext,
  getIssuedChequeById,
  issueDraftCheque,
  listIssuedCheques,
  recordChequePrintJob,
  updateChequeBankingStatus,
  updateIssuedCheque,
} from './cheque.service.js';
import { generateChequePdfBuffer } from './chequePdf.service.js';

function getMeta(req: Request) {
  return {
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    requestId: req.requestId ?? null,
  };
}

export async function getCreationContextController(
  req: Request,
  res: Response
): Promise<void> {
  const companyId =
    typeof req.query.companyId === 'string' && req.query.companyId
      ? uuidSchema.parse(req.query.companyId)
      : undefined;
  const ctx = await getChequeCreationContext(req.tenantUser!, companyId);
  sendSuccess(res, ctx, 'Cheque creation context retrieved.');
}

export async function listChequesController(req: Request, res: Response): Promise<void> {
  const query = listChequesQuerySchema.parse(req.query);
  const result = await listIssuedCheques(req.tenantUser!, query);
  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    totalItems: result.totalItems,
  });
}

export async function getChequeController(req: Request, res: Response): Promise<void> {
  const chequeId = uuidSchema.parse(req.params.chequeId);
  const cheque = await getIssuedChequeById(req.tenantUser!, chequeId);
  sendSuccess(res, cheque, 'Cheque details retrieved.');
}

export async function createChequeController(req: Request, res: Response): Promise<void> {
  const input = createIssuedChequeSchema.parse(req.body);
  const headerKey = req.header('idempotency-key');
  const result = await createIssuedCheque(
    req.tenantUser!,
    input,
    headerKey,
    getMeta(req)
  );

  if (result.deduplicated) {
    sendSuccess(
      res,
      result.cheque,
      'Existing cheque returned for idempotent request.',
      { deduplicated: true }
    );
    return;
  }

  sendCreated(res, result.cheque, 'Cheque created successfully.');
}

export async function updateChequeController(req: Request, res: Response): Promise<void> {
  const chequeId = uuidSchema.parse(req.params.chequeId);
  const input = updateIssuedChequeSchema.parse(req.body);
  const cheque = await updateIssuedCheque(req.tenantUser!, chequeId, input, getMeta(req));
  sendSuccess(res, cheque, 'Cheque updated successfully.');
}

export async function issueDraftChequeController(req: Request, res: Response): Promise<void> {
  const chequeId = uuidSchema.parse(req.params.chequeId);
  const cheque = await issueDraftCheque(req.tenantUser!, chequeId, getMeta(req));
  sendSuccess(res, cheque, 'Cheque issued successfully.');
}

export async function cancelChequeController(req: Request, res: Response): Promise<void> {
  const chequeId = uuidSchema.parse(req.params.chequeId);
  const input = cancelChequeSchema.parse(req.body);
  const cheque = await cancelIssuedCheque(req.tenantUser!, chequeId, input, getMeta(req));
  sendSuccess(res, cheque, 'Cheque cancelled successfully.');
}

export async function updateChequeBankingStatusController(
  req: Request,
  res: Response
): Promise<void> {
  const chequeId = uuidSchema.parse(req.params.chequeId);
  const input = updateChequeBankingStatusSchema.parse(req.body);
  const cheque = await updateChequeBankingStatus(
    req.tenantUser!,
    chequeId,
    input,
    getMeta(req)
  );
  sendSuccess(res, cheque, `Cheque banking status updated to ${input.bankingStatus}.`);
}

export async function recordChequePrintController(
  req: Request,
  res: Response
): Promise<void> {
  const chequeId = uuidSchema.parse(req.params.chequeId);
  const input = recordChequePrintSchema.parse(req.body);
  const cheque = await recordChequePrintJob(req.tenantUser!, chequeId, input, getMeta(req));
  sendSuccess(res, cheque, 'Cheque print job recorded.');
}

export async function downloadChequePdfController(
  req: Request,
  res: Response
): Promise<void> {
  const chequeId = uuidSchema.parse(req.params.chequeId);
  const { buffer, filename } = await generateChequePdfBuffer(req.tenantUser!, chequeId);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}
