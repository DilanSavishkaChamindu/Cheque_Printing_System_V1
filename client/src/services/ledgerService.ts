import type {
  ApiSuccessResponse,
  CreateBankTransactionInput,
  CreateReceivedChequeInput,
  PaginationMeta,
  ReceivedChequeStatus,
  UpdateReceivedChequeInput,
  UpdateReceivedChequeStatusInput,
} from '@cheque-saas/shared';
import { apiClient } from '../lib/apiClient';

export interface BankTransactionDto {
  id: string;
  companyId: string;
  company: { id: string; companyCode: string; companyName: string };
  bankAccountId: string;
  bankAccount: {
    id: string;
    accountName: string;
    accountNumberMasked: string;
    currency: string;
    bank: { bankCode: string; bankName: string };
  };
  transactionDate: string;
  transactionType: string;
  referenceNumber: string | null;
  description: string | null;
  debitAmount: string;
  creditAmount: string;
  balanceAfterTransaction: string;
  issuedChequeId: string | null;
  receivedChequeId: string | null;
  reversedTransactionId: string | null;
  isReversed: boolean;
  sequenceNumber: string;
}

export interface ReceivedChequeDto {
  id: string;
  companyId: string;
  company: { id: string; companyCode: string; companyName: string };
  chequeNumber: string;
  chequeDate: string;
  receivedDate: string;
  bankId: string | null;
  bankName: string;
  branchName: string | null;
  receivedFrom: string;
  amount: string;
  currency: string;
  depositBankAccountId: string | null;
  depositBankAccount: {
    id: string;
    accountName: string;
    accountNumberMasked: string;
    currency: string;
    bankName: string;
  } | null;
  note: string | null;
  status: ReceivedChequeStatus;
  version: number;
}

export const ledgerService = {
  async listTransactions(params: {
    page?: number;
    limit?: number;
    companyId?: string;
    bankAccountId?: string;
    transactionType?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
  }) {
    const res = await apiClient.get<
      ApiSuccessResponse<BankTransactionDto[], { pagination: PaginationMeta }>
    >('/bank-transactions', {
      params: Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== '' && v !== undefined)
      ),
    });
    return { items: res.data.data, pagination: res.data.meta.pagination };
  },

  async postTransaction(
    input: CreateBankTransactionInput,
    idempotencyKey?: string
  ): Promise<BankTransactionDto> {
    const res = await apiClient.post<ApiSuccessResponse<BankTransactionDto>>(
      '/bank-transactions',
      input,
      {
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      }
    );
    return res.data.data;
  },

  async reverseTransaction(transactionId: string, reason: string) {
    const res = await apiClient.post<ApiSuccessResponse<BankTransactionDto>>(
      `/bank-transactions/${transactionId}/reverse`,
      { reason }
    );
    return res.data.data;
  },

  async reconcileAccount(bankAccountId: string) {
    const res = await apiClient.get<
      ApiSuccessResponse<{
        bankAccountId: string;
        openingBalance: string;
        cachedBookBalance: string;
        calculatedLedgerBalance: string;
        isReconciled: boolean;
        transactionCount: number;
      }>
    >(`/bank-transactions/reconcile/${bankAccountId}`);
    return res.data.data;
  },

  // Received Cheques
  async getReceivedChequeOptions() {
    const res = await apiClient.get<
      ApiSuccessResponse<{
        banks: Array<{ id: string; bankCode: string; bankName: string }>;
        bankAccounts: Array<{
          id: string;
          companyId: string;
          accountName: string;
          accountNumberMasked: string;
          currency: string;
          bankName: string;
        }>;
      }>
    >('/received-cheques/options');
    return res.data.data;
  },

  async listReceivedCheques(params: {
    page?: number;
    limit?: number;
    companyId?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
  }) {
    const res = await apiClient.get<
      ApiSuccessResponse<ReceivedChequeDto[], { pagination: PaginationMeta }>
    >('/received-cheques', {
      params: Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== '' && v !== undefined)
      ),
    });
    return { items: res.data.data, pagination: res.data.meta.pagination };
  },

  async getReceivedChequeDetails(id: string) {
    const res = await apiClient.get<
      ApiSuccessResponse<
        ReceivedChequeDto & {
          statusHistory: Array<{
            id: string;
            previousStatus: string | null;
            newStatus: string;
            reason: string | null;
            createdAt: string;
          }>;
        }
      >
    >(`/received-cheques/${id}`);
    return res.data.data;
  },

  async createReceivedCheque(input: CreateReceivedChequeInput) {
    const res = await apiClient.post<ApiSuccessResponse<ReceivedChequeDto>>(
      '/received-cheques',
      input
    );
    return res.data.data;
  },

  async updateReceivedCheque(id: string, input: UpdateReceivedChequeInput) {
    const res = await apiClient.patch<ApiSuccessResponse<ReceivedChequeDto>>(
      `/received-cheques/${id}`,
      input
    );
    return res.data.data;
  },

  async updateReceivedChequeStatus(id: string, input: UpdateReceivedChequeStatusInput) {
    const res = await apiClient.patch<ApiSuccessResponse<ReceivedChequeDto>>(
      `/received-cheques/${id}/status`,
      input
    );
    return res.data.data;
  },
};
