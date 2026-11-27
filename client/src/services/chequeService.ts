import type {
  ApiSuccessResponse,
  ChequeBankingStatus,
  ChequeBusinessStatus,
  ChequePrintingStatus,
  CreateChequeBookInput,
  CreateIssuedChequeInput,
  PaginationMeta,
  PaymentType,
  RecordChequePrintInput,
  UpdateIssuedChequeInput,
} from '@cheque-saas/shared';
import { apiClient } from '../lib/apiClient';

export interface ChequeCreationContextDto {
  bankAccounts: Array<{
    id: string;
    companyId: string;
    company: { id: string; companyCode: string; companyName: string };
    bankId: string;
    bank: { id: string; bankCode: string; bankName: string };
    branch: { id: string; branchCode: string; branchName: string } | null;
    accountName: string;
    accountNumberMasked: string;
    currency: string;
  }>;
  chequeBooks: Array<{
    id: string;
    companyId: string;
    bankAccountId: string;
    bookName: string;
    chequePrefix: string | null;
    startingNumber: number;
    endingNumber: number;
    nextAvailableNumber: number;
    nextChequeNumberFormatted: string;
    remainingLeaves: number;
  }>;
  templates: Array<{
    id: string;
    bankId: string;
    bankAccountId: string | null;
    templateName: string;
    paperWidthMm: string;
    paperHeightMm: string;
    orientation: 'PORTRAIT' | 'LANDSCAPE';
    dateFormat: string;
    centerOnA4: boolean;
    fields: Array<{
      id: string;
      fieldKey: string;
      xMm: string;
      yMm: string;
      widthMm: string;
      heightMm: string;
      fontFamily: string;
      fontSizePt: string;
      fontWeight: string;
      letterSpacingMm: string;
      lineHeight: string;
      textAlign: 'LEFT' | 'CENTER' | 'RIGHT';
      dateDigitGapMm: string | null;
      isVisible: boolean;
    }>;
  }>;
}

export interface IssuedChequeDto {
  id: string;
  companyId: string;
  company: { id: string; companyCode: string; companyName: string };
  bankId: string;
  bank: { id: string; bankCode: string; bankName: string };
  bankAccountId: string;
  bankAccount: {
    id: string;
    accountName: string;
    accountNumberMasked: string;
    currency: string;
  };
  chequeBookId: string | null;
  chequeBook: {
    id: string;
    bookName: string;
    chequePrefix: string | null;
  } | null;
  templateId: string | null;
  chequeNumber: string;
  chequeDate: string;
  dateFormat: string;
  payeeName: string;
  amount: string;
  currency: string;
  paymentType: PaymentType;
  cashRecipient: string | null;
  amountInWords: string;
  description: string | null;
  businessStatus: ChequeBusinessStatus;
  printingStatus: ChequePrintingStatus;
  bankingStatus: ChequeBankingStatus;
  printCount: number;
  lastPrintedAt: string | null;
  clearedAt: string | null;
  bouncedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  isOfflineCreated: boolean;
  version: number;
  createdAt: string;
}

export interface IssuedChequeDetailsDto extends IssuedChequeDto {
  statusHistory: Array<{
    id: string;
    statusCategory: string;
    previousStatus: string | null;
    newStatus: string;
    reason: string | null;
    createdAt: string;
  }>;
  printJobs: Array<{
    id: string;
    jobType: string;
    status: string;
    printedAt: string;
  }>;
}

export const chequeService = {
  async getCreationContext(companyId?: string): Promise<ChequeCreationContextDto> {
    const res = await apiClient.get<ApiSuccessResponse<ChequeCreationContextDto>>(
      '/cheques/creation-context',
      { params: companyId ? { companyId } : undefined }
    );
    return res.data.data;
  },

  async createChequeBook(input: CreateChequeBookInput) {
    const res = await apiClient.post('/cheque-books', input);
    return res.data.data;
  },

  async createCheque(
    input: CreateIssuedChequeInput,
    idempotencyKey?: string
  ): Promise<IssuedChequeDto> {
    const res = await apiClient.post<ApiSuccessResponse<IssuedChequeDto>>(
      '/cheques',
      input,
      {
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      }
    );
    return res.data.data;
  },

  async listCheques(params: {
    page?: number;
    limit?: number;
    companyId?: string;
    bankAccountId?: string;
    search?: string;
    businessStatus?: string;
    printingStatus?: string;
    bankingStatus?: string;
    fromDate?: string;
    toDate?: string;
    minAmount?: string;
    maxAmount?: string;
  }) {
    const res = await apiClient.get<
      ApiSuccessResponse<IssuedChequeDto[], { pagination: PaginationMeta }>
    >('/cheques', {
      params: Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== '' && v !== undefined)
      ),
    });
    return { items: res.data.data, pagination: res.data.meta.pagination };
  },

  async getChequeDetails(chequeId: string): Promise<IssuedChequeDetailsDto> {
    const res = await apiClient.get<ApiSuccessResponse<IssuedChequeDetailsDto>>(
      `/cheques/${chequeId}`
    );
    return res.data.data;
  },

  async updateCheque(chequeId: string, input: UpdateIssuedChequeInput): Promise<IssuedChequeDto> {
    const res = await apiClient.patch<ApiSuccessResponse<IssuedChequeDto>>(
      `/cheques/${chequeId}`,
      input
    );
    return res.data.data;
  },

  async issueDraft(chequeId: string): Promise<IssuedChequeDto> {
    const res = await apiClient.post<ApiSuccessResponse<IssuedChequeDto>>(
      `/cheques/${chequeId}/issue`
    );
    return res.data.data;
  },

  async cancelCheque(chequeId: string, reason: string): Promise<IssuedChequeDto> {
    const res = await apiClient.post<ApiSuccessResponse<IssuedChequeDto>>(
      `/cheques/${chequeId}/cancel`,
      { reason }
    );
    return res.data.data;
  },

  async updateBankingStatus(
    chequeId: string,
    bankingStatus: ChequeBankingStatus,
    reason?: string
  ): Promise<IssuedChequeDto> {
    const res = await apiClient.patch<ApiSuccessResponse<IssuedChequeDto>>(
      `/cheques/${chequeId}/banking-status`,
      { bankingStatus, reason }
    );
    return res.data.data;
  },

  async recordPrintJob(
    chequeId: string,
    input: RecordChequePrintInput
  ): Promise<IssuedChequeDto> {
    const res = await apiClient.post<ApiSuccessResponse<IssuedChequeDto>>(
      `/cheques/${chequeId}/print`,
      input
    );
    return res.data.data;
  },

  async downloadChequePdf(chequeId: string, chequeNumber: string): Promise<void> {
    const res = await apiClient.get<Blob>(`/cheques/${chequeId}/pdf`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(res.data);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `cheque-${chequeNumber}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  },
};
