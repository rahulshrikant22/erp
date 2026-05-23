/**
 * Global error handler — must be registered LAST in the middleware stack.
 *
 * Behaviour:
 *   - AppError (and subclasses)  → returned as the standard error envelope
 *     with the configured httpStatus. Logged at info/warn depending on status.
 *   - Anything else              → 500 INTERNAL_ERROR with a generic message.
 *     Stack trace and original error are logged but never serialized.
 */
import type { ErrorRequestHandler, Request, Response, NextFunction } from 'express';
import { AppError } from '../errors';
import { logger } from '../utils/logger';
import { sendError } from '../utils/response';

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  // Express requires the 4-arg signature even when next is unused.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) => {
  if (err instanceof AppError) {
    const child = logger.child({
      reqId: (req as Request & { id?: string }).id,
      url: req.originalUrl,
      method: req.method,
      code: err.code,
      status: err.httpStatus,
    });
    if (err.httpStatus >= 500) {
      child.error({ err }, err.message);
    } else if (err.httpStatus >= 400) {
      child.warn({ err }, err.message);
    } else {
      child.info({ err }, err.message);
    }
    sendError(res, err);
    return;
  }

  // Unknown error — never expose details to the client.
  logger.error(
    {
      err,
      url: req.originalUrl,
      method: req.method,
    },
    'unhandled error',
  );

  const fallback = new AppError({
    httpStatus: 500,
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  });
  sendError(res, fallback);
};
