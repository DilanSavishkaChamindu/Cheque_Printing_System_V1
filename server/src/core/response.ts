import type { Response } from 'express';
import type {
  ApiErrorDetail,
  ApiErrorResponse,
  ApiSuccessResponse,
  PaginationMeta,
} from '@cheque-saas/shared';

export function buildPaginationMeta(
  page: number,
  limit: number,
  totalItems: number
): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

export function sendSuccess<T, M = Record<string, unknown>>(
  res: Response,
  data: T,
  message = 'Operation completed successfully.',
  meta = {} as M,
  statusCode = 200
): Response<ApiSuccessResponse<T, M>> {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    meta,
  });
}

export function sendCreated<T, M = Record<string, unknown>>(
  res: Response,
  data: T,
  message = 'Resource created successfully.',
  meta = {} as M
): Response<ApiSuccessResponse<T, M>> {
  return sendSuccess(res, data, message, meta, 201);
}

export function sendPaginated<T>(
  res: Response,
  items: T[],
  pagination: { page: number; limit: number; totalItems: number },
  message = 'Records retrieved successfully.'
): Response<ApiSuccessResponse<T[], { pagination: PaginationMeta }>> {
  return sendSuccess(
    res,
    items,
    message,
    {
      pagination: buildPaginationMeta(
        pagination.page,
        pagination.limit,
        pagination.totalItems
      ),
    },
    200
  );
}

export function sendError(
  res: Response,
  statusCode: number,
  message: string,
  options: {
    code?: string;
    errors?: ApiErrorDetail[];
    requestId?: string;
  } = {}
): Response<ApiErrorResponse> {
  return res.status(statusCode).json({
    success: false,
    message,
    code: options.code,
    errors: options.errors ?? [],
    requestId: options.requestId,
  });
}
