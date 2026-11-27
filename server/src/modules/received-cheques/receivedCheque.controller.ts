import type { Request, Response } from 'express';
import {
  createReceivedChequeSchema,
  listReceivedChequesQuerySchema,
  updateReceivedChequeSchema,
  updateReceivedChequeStatusSchema,
  uuidSchema,
} from '@cheque-saas/shared';
import { sendCreated, sendPaginated, sendSuccess } from '../../core/response.js';
import { getClientIp, getUserAgent } from '../../utils/sanitize.js';
import {
  createReceivedCheque,
  getReceivedChequeById,
  getReceivedChequeOptions,
  listReceivedCheques,
  updateReceivedCheque,
  updateReceivedChequeStatus,
} from './receivedCheque.service.js';

function getMeta(req: Request) {
  return {
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    requestId: req.requestId ?? null,
  };
}

export async function getReceivedChequeOptionsController(
  req: Request,
  res: Response
): Promise<void> {
  const options = await getReceivedChequeOptions(req.tenantUser!);
  sendSuccess(res, options, 'Received cheque reference options retrieved.');
}

export async function listReceivedChequesController(
  req: Request,
  res: Response
): Promise<void> {
  const query = listReceivedChequesQuerySchema.parse(req.query);
  const result = await listReceivedCheques(req.tenantUser!, query);
  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    totalItems: result.totalItems,
  });
}

export async function getReceivedChequeController(
  req: Request,
  res: Response
): Promise<void> {
  const receivedChequeId = uuidSchema.parse(req.params.receivedChequeId);
  const cheque = await getReceivedChequeById(req.tenantUser!, receivedChequeId);
  sendSuccess(res, cheque, 'Received cheque details retrieved.');
}

export async function createReceivedChequeController(
  req: Request,
  res: Response
): Promise<void> {
  const input = createReceivedChequeSchema.parse(req.body);
  const created = await createReceivedCheque(req.tenantUser!, input, getMeta(req));
  sendCreated(res, created, 'Received cheque recorded successfully.');
}

export async function updateReceivedChequeController(
  req: Request,
  res: Response
): Promise<void> {
  const receivedChequeId = uuidSchema.parse(req.params.receivedChequeId);
  const input = updateReceivedChequeSchema.parse(req.body);
  const updated = await updateReceivedCheque(
    req.tenantUser!,
    receivedChequeId,
    input,
    getMeta(req)
  );
  sendSuccess(res, updated, 'Received cheque updated successfully.');
}

export async function updateReceivedChequeStatusController(
  req: Request,
  res: Response
): Promise<void> {
  const receivedChequeId = uuidSchema.parse(req.params.receivedChequeId);
  const input = updateReceivedChequeStatusSchema.parse(req.body);
  const updated = await updateReceivedChequeStatus(
    req.tenantUser!,
    receivedChequeId,
    input,
    getMeta(req)
  );
  sendSuccess(res, updated, `Received cheque status updated to ${input.status}.`);
}
