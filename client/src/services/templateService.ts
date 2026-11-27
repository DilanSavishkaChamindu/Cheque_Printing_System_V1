import type {
  ApiSuccessResponse,
  CreateCalibrationProfileInput,
  CreateChequeTemplateInput,
  PaginationMeta,
  TemplateFieldInput,
  UpdateCalibrationProfileInput,
  UpdateChequeTemplateInput,
} from '@cheque-saas/shared';
import { apiClient } from '../lib/apiClient';

export interface TemplateFieldDto extends TemplateFieldInput {
  id?: string;
}

export interface CalibrationProfileDto {
  id: string;
  templateId: string;
  deviceId: string | null;
  profileName: string;
  offsetXMm: number;
  offsetYMm: number;
  scalePercent: number;
  printerMarginTopMm: number;
  printerMarginLeftMm: number;
  isDefault: boolean;
  lastTestPrintedAt: string | null;
}

export interface ChequeTemplateDto {
  id: string;
  companyId: string | null;
  bankId: string;
  bank: { id: string; bankCode: string; bankName: string };
  bankAccountId: string | null;
  templateName: string;
  paperWidthMm: number;
  paperHeightMm: number;
  orientation: 'PORTRAIT' | 'LANDSCAPE';
  dateFormat: 'DD/MM/YYYY' | 'DDMMYYYY' | 'DD MMM YYYY';
  feedDirection: 'TOP_FIRST' | 'BOTTOM_FIRST' | 'LEFT_FIRST' | 'RIGHT_FIRST';
  centerOnA4: boolean;
  isDefault: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  fields: TemplateFieldDto[];
  calibrationProfiles: CalibrationProfileDto[];
}

export const templateService = {
  async listTemplates(params: { page?: number; limit?: number; bankId?: string; status?: string }) {
    const res = await apiClient.get<
      ApiSuccessResponse<ChequeTemplateDto[], { pagination: PaginationMeta }>
    >('/cheque-templates', {
      params: Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== '' && v !== undefined)
      ),
    });
    return { items: res.data.data, pagination: res.data.meta.pagination };
  },

  async createTemplate(input: CreateChequeTemplateInput): Promise<ChequeTemplateDto> {
    const res = await apiClient.post<ApiSuccessResponse<ChequeTemplateDto>>(
      '/cheque-templates',
      input
    );
    return res.data.data;
  },

  async updateTemplate(
    templateId: string,
    input: UpdateChequeTemplateInput
  ): Promise<ChequeTemplateDto> {
    const res = await apiClient.patch<ApiSuccessResponse<ChequeTemplateDto>>(
      `/cheque-templates/${templateId}`,
      input
    );
    return res.data.data;
  },

  async duplicateTemplate(
    templateId: string,
    templateName: string
  ): Promise<ChequeTemplateDto> {
    const res = await apiClient.post<ApiSuccessResponse<ChequeTemplateDto>>(
      `/cheque-templates/${templateId}/duplicate`,
      { templateName }
    );
    return res.data.data;
  },

  async updateTemplateStatus(
    templateId: string,
    status: 'ACTIVE' | 'INACTIVE'
  ): Promise<ChequeTemplateDto> {
    const res = await apiClient.patch<ApiSuccessResponse<ChequeTemplateDto>>(
      `/cheque-templates/${templateId}/status`,
      { status }
    );
    return res.data.data;
  },

  async createCalibrationProfile(input: CreateCalibrationProfileInput) {
    const res = await apiClient.post<ApiSuccessResponse<CalibrationProfileDto>>(
      '/calibration',
      input
    );
    return res.data.data;
  },

  async updateCalibrationProfile(
    profileId: string,
    input: UpdateCalibrationProfileInput
  ) {
    const res = await apiClient.patch<ApiSuccessResponse<CalibrationProfileDto>>(
      `/calibration/${profileId}`,
      input
    );
    return res.data.data;
  },

  async recordTestPrint(profileId: string) {
    const res = await apiClient.post(`/calibration/${profileId}/test-print`);
    return res.data.data;
  },
};
