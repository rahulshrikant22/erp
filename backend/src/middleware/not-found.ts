/**
 * 404 handler — must be registered AFTER all route handlers but BEFORE
 * the global error handler. Throws a NotFoundError so the error handler
 * formats the response uniformly.
 */
import type { RequestHandler } from 'express';
import { NotFoundError } from '../errors';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
};
