/**
 * Tiny request-validation helper. Each route does:
 *   const body = parseBody(req, schema);
 * which either returns the parsed value or throws ValidationError.
 *
 * The error envelope's `details` is the zod issues array — clients can render
 * field-level error UI directly from it.
 */
import type { Request } from 'express';
import { z, type ZodSchema } from 'zod';
import { ValidationError } from '../errors';

export function parseBody<T>(req: Request, schema: ZodSchema<T>): T {
  const r = schema.safeParse(req.body);
  if (!r.success) {
    throw new ValidationError('Request body validation failed', r.error.issues);
  }
  return r.data;
}

export function parseQuery<T>(req: Request, schema: ZodSchema<T>): T {
  const r = schema.safeParse(req.query);
  if (!r.success) {
    throw new ValidationError('Query string validation failed', r.error.issues);
  }
  return r.data;
}

export function parseParams<T>(req: Request, schema: ZodSchema<T>): T {
  const r = schema.safeParse(req.params);
  if (!r.success) {
    throw new ValidationError('URL params validation failed', r.error.issues);
  }
  return r.data;
}

export const z_ = z;
