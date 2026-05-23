/**
 * Standard response helpers — every handler ends with one of these.
 *
 * Keeps the envelope shape (`{ success, data, meta }` or
 * `{ success, error }`) in exactly one place. Direct `res.json(...)` calls
 * are linted away in CI.
 */
import type { Response } from 'express';
import type { ApiSuccess, ApiError } from '../types';
import { AppError } from '../errors';

export function sendSuccess<TData, TMeta extends Record<string, unknown>>(
  res: Response,
  data: TData,
  opts: { status?: number; meta?: TMeta } = {},
): Response {
  const body: ApiSuccess<TData, TMeta> = {
    success: true,
    data,
    ...(opts.meta ? { meta: opts.meta } : {}),
  };
  return res.status(opts.status ?? 200).json(body);
}

export function sendError(res: Response, error: AppError): Response {
  const body: ApiError = {
    success: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    },
  };
  return res.status(error.httpStatus).json(body);
}
