import type { Request, Response } from 'express';
import {
  createChequeAllocationSchema,
  createChequeBookSchema,
  listChequeBooksQuerySchema,
  updateChequeBookStatusSchema,
  uuidSchema,
} from '@cheque-saas/shared';
import { sendCreated, sendPaginated, sendSuccess } from '../../core/response.js';
import { getClientIp, getUserAgent } from '../../utils/sanitize.js';
import {
  allocateChequeRange,
  createChequeBook,
  listChequeBookAllocations,
  listChequeBooks,
  revokeChequeAllocation,
  updateChequeBookStatus,
} from './chequeBook.service.js';

function getMeta(req: Request) {
  return {
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    requestId: req.requestId ?? null,
  };
}

export async function listChequeBooksController(req: Request, res: Response): Promise<void> {
  const query = listChequeBooksQuerySchema.parse(req.query);
  const result = await listChequeBooks(req.tenantUser!, query);
  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    totalItems: result.totalItems,
  });
}

export async function createChequeBookController(req: Request, res: Response): Promise<void> {
  const input = createChequeBookSchema.parse(req.body);
  const created = await createChequeBook(req.tenantUser!, input, getMeta(req));
  sendCreated(res, created, 'Cheque book created successfully.');
}

export async function updateChequeBookStatusController(
  req: Request,
  res: Response
): Promise<void> {
  const chequeBookId = uuidSchema.parse(req.params.chequeBookId);
  const input = updateChequeBookStatusSchema.parse(req.body);
  const updated = await updateChequeBookStatus(
    req.tenantUser!,
    chequeBookId,
    input.status,
    getMeta(req)
  );
  sendSuccess(res, updated, `Cheque book status updated to ${input.status}.`);
}

export async function listAllocationsController(req: Request, res: Response): Promise<void> {
  const chequeBookId = uuidSchema.parse(req.params.chequeBookId);
  const items = await listChequeBookAllocations(req.tenantUser!, chequeBookId);
  sendSuccess(res, items, 'Cheque number allocations retrieved.');
}

export async function allocateRangeController(req: Request, res: Response): Promise<void> {
  const chequeBookId = uuidSchema.parse(req.params.chequeBookId);
  const input = createChequeAllocationSchema.parse(req.body);
  const allocation = await allocateChequeRange(
    req.tenantUser!,
    chequeBookId,
    input,
    getMeta(req)
  );
  sendCreated(res, allocation, 'Cheque number range allocated successfully.');
}

export async function revokeAllocationController(req: Request, res: Response): Promise<void> {
  const allocationId = uuidSchema.parse(req.params.allocationId);
  const allocation = await revokeChequeAllocation(
    req.tenantUser!,
    allocationId,
    getMeta(req)
  );
  sendSuccess(res, allocation, 'Cheque number allocation revoked.');
}
