/**
 * Shared API response types.
 *
 * Every successful response is `{ success: true, data, meta? }`.
 * Every error response is `{ success: false, error: { code, message, details? } }`.
 * The two shapes are mutually exclusive — discriminate on `success`.
 */

export interface ApiSuccess<TData = unknown, TMeta = Record<string, unknown>> {
  success: true;
  data: TData;
  meta?: TMeta;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiError {
  success: false;
  error: ApiErrorBody;
}

export type ApiResponse<TData = unknown, TMeta = Record<string, unknown>> =
  | ApiSuccess<TData, TMeta>
  | ApiError;
