/**
 * Request-id middleware — always on, regardless of NODE_ENV.
 *
 * Honors an inbound `x-request-id` header if the caller supplied one
 * (useful for correlating logs across services); otherwise mints a UUID.
 * Sets `req.id` for downstream middleware (pino-http reuses it via genReqId)
 * and echoes the value back in the response header.
 */
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    id?: string;
  }
}

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
  req.id = id;
  res.setHeader('x-request-id', id);
  next();
};
