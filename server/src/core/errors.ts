import type { ApiErrorDetail } from '@cheque-saas/shared';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly errors: ApiErrorDetail[];
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    errors: ApiErrorDetail[] = [],
    isOperational = true
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed.', errors: ApiErrorDetail[] = []) {
    super(message, 400, 'VALIDATION_ERROR', errors);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required.', code = 'UNAUTHORIZED') {
    super(message, 401, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action.', code = 'FORBIDDEN') {
    super(message, 403, code);
  }
}

export class TenantStatusForbiddenError extends ForbiddenError {
  constructor(status: string) {
    super(`Organization access is restricted because tenant status is ${status}.`, 'TENANT_INACTIVE');
  }
}

export class FeatureDisabledError extends ForbiddenError {
  constructor(featureKey: string) {
    super(
      `Feature '${featureKey}' is not enabled for this organization.`,
      'FEATURE_DISABLED'
    );
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found.`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict detected.', code = 'CONFLICT', errors: ApiErrorDetail[] = []) {
    super(message, 409, code, errors);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests. Please try again later.') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}
