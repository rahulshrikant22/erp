/**
 * Concrete error classes used across the ERP API.
 *
 * Conventions:
 *   - Each class fixes its httpStatus and code.
 *   - `details` is optional structured info safe to return to the client.
 *   - Use `cause` to chain the originating error for logging only — it is
 *     never serialized into the API response.
 */
import { AppError, type ErrorDetails } from './AppError';

export { AppError } from './AppError';
export type { ErrorDetails } from './AppError';

/** 400 — input failed validation. `details` should describe the failing fields. */
export class ValidationError extends AppError {
  constructor(message = 'Request validation failed', details?: ErrorDetails) {
    super({ httpStatus: 400, code: 'VALIDATION_ERROR', message, details });
  }
}

/** 401 — caller is not authenticated, or credentials are invalid. */
export class AuthError extends AppError {
  constructor(message = 'Authentication required', details?: ErrorDetails) {
    super({ httpStatus: 401, code: 'AUTH_ERROR', message, details });
  }
}

/** 403 — caller is authenticated but lacks permission for this action. */
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details?: ErrorDetails) {
    super({ httpStatus: 403, code: 'FORBIDDEN', message, details });
  }
}

/** 404 — requested resource does not exist (or is hidden from this caller). */
export class NotFoundError extends AppError {
  constructor(message = 'Not found', details?: ErrorDetails) {
    super({ httpStatus: 404, code: 'NOT_FOUND', message, details });
  }
}

/** 409 — request conflicts with current state (duplicate key, stale version, ...). */
export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: ErrorDetails) {
    super({ httpStatus: 409, code: 'CONFLICT', message, details });
  }
}
