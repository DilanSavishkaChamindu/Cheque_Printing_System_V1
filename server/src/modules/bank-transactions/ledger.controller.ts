import type { Request, Response } from 'express';
import {
  createBankTransactionSchema,
  listBankTransactionsQuerySchema,
  reverseBankTransactionSchema,
  uuidSchema,
} from '@cheque-saas/shared';
import { sendCreated, sendPaginated, sendSuccess } from '../../core/response.js';
import { getClientIp, getUserAgent } from '../../utils/sanitize.js';
import {
  getBankLedgerSummary,
  listBankTransactions,
  postManualBankTransaction,
  reconcileBankAccountBalance,
  reverseBankTransaction,
} from './ledger.service.js';

function getMeta(req: Request) {
  return {
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    requestId: req.requestId ?? null,
  };
}

export async function listTransactionsController(
  req: Request,
  res: Response
): Promise<void> {
  const query = listBankTransactionsQuerySchema.parse(req.query);
  const result = await listBankTransactions(req.tenantUser!, query);
  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    totalItems: result.totalItems,
  });
}

export async function postTransactionController(
  req: Request,
  res: Response
): Promise<void> {
  const input = createBankTransactionSchema.parse(req.body);
  const idempotencyHeader = req.header('idempotency-key');
  const result = await postManualBankTransaction(
    req.tenantUser!,
    input,
    idempotencyHeader,
    getMeta(req)
  );

  if (result.deduplicated) {
    sendSuccess(
      res,
      result.transaction,
      'Existing transaction returned for idempotent request.',
      { deduplicated: true }
    );
    return;
  }

  sendCreated(res, result.transaction, 'Bank transaction posted successfully.');
}

export async function reverseTransactionController(
  req: Request,
  res: Response
): Promise<void> {
  const transactionId = uuidSchema.parse(req.params.transactionId);
  const input = reverseBankTransactionSchema.parse(req.body);
  const idempotencyHeader = req.header('idempotency-key');
  const reversal = await reverseBankTransaction(
    req.tenantUser!,
    transactionId,
    input,
    idempotencyHeader,
    getMeta(req)
  );
  sendCreated(res, reversal, 'Reversal transaction posted successfully.');
}

export async function reconcileAccountController(
  req: Request,
  res: Response
): Promise<void> {
  const bankAccountId = uuidSchema.parse(req.params.bankAccountId);
  const result = await reconcileBankAccountBalance(req.tenantUser!, bankAccountId);
  sendSuccess(res, result, 'Bank account ledger reconciliation completed.');
}

export async function getLedgerSummaryController(
  req: Request,
  res: Response
): Promise<void> {
  const companyId =
    typeof req.query.companyId === 'string' && req.query.companyId
      ? uuidSchema.parse(req.query.companyId)
      : undefined;
  const bankAccountId =
    typeof req.query.bankAccountId === 'string' && req.query.bankAccountId
      ? uuidSchema.parse(req.query.bankAccountId)
      : undefined;
  const fromDate =
    typeof req.query.fromDate === 'string' ? req.query.fromDate : undefined;
  const toDate =
    typeof req.query.toDate === 'string' ? req.query.toDate : undefined;

  const summary = await getBankLedgerSummary(req.tenantUser!, {
    companyId,
    bankAccountId,
    fromDate,
    toDate,
  });
  sendSuccess(res, summary, 'Bank transaction summary retrieved.');
}
