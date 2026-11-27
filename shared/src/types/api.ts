export type SortOrder = 'asc' | 'desc';

export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ApiSuccessResponse<T = unknown, M = Record<string, unknown>> {
  success: true;
  message: string;
  data: T;
  meta: M;
}

export interface ApiErrorDetail {
  field?: string;
  code: string;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  code?: string;
  errors: ApiErrorDetail[];
  requestId?: string;
}
