/**
 * Per-request logger — adds a request id, logs start/end with status + latency.
 *
 * Built on pino-http so it shares the same logger instance and output sink as
 * the rest of the app. The genReqId function uses crypto.randomUUID so every
 * request can be correlated end-to-end via `reqId`.
 */
import pinoHttp from 'pino-http';
import { logger } from '../utils/logger';

export const requestLogger = pinoHttp({
  logger,
  // requestId middleware (mounted before this) already populated req.id and
  // the x-request-id response header; just reuse the id for log correlation.
  genReqId: (req) => (req as { id?: string }).id ?? '',
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // Trim noise — full headers/body bloat the log without adding signal.
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});
