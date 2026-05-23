/**
 * Express app factory — split from index.ts so tests (supertest) can import
 * the wired-up application without binding a port.
 *
 * Middleware order matters:
 *   1. cors          — runs before everything so preflights succeed
 *   2. body parser   — request body must be available to logger / handlers
 *   3. request logger — captures every request with a stable reqId
 *   4. rate limit     — STUB; real rules in P0-19
 *   5. routes         — currently just /health and /
 *   6. 404 handler    — anything that didn't match a route
 *   7. error handler  — final, must be 4-arg
 */
import express, {
  type Application,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import cors from 'cors';
import helmet from 'helmet';

import packageJson from '../package.json';
import { config } from './config';
import { logger } from './utils/logger';
import { sendSuccess } from './utils/response';
import { nowIso } from './utils/dates';
import { requestId } from './middleware/request-id';
import { requestLogger } from './middleware/request-logger';
import { rateLimit } from './middleware/rate-limit';
import { notFoundHandler } from './middleware/not-found';
import { errorHandler } from './middleware/error-handler';
import { auditContext } from './middleware/audit-context';
import { registerRoutes } from './routes';
import { UPLOADS_PATH } from './services/organization';

export interface CreateAppOptions {
  /**
   * Hook for tests (or future feature modules) to register additional routes
   * AFTER the core routes but BEFORE the 404 + error handlers. Without this,
   * any `app.use(...)` after createApp() lands behind notFoundHandler and is
   * unreachable.
   */
  registerExtraRoutes?: (app: Application) => void;
}

export function createApp(opts: CreateAppOptions = {}): Application {
  const app = express();

  app.disable('x-powered-by');

  // 0. Security headers via helmet.
  app.use(
    helmet({
      contentSecurityPolicy: config.isProd
        ? undefined
        : false, // Disable CSP in dev for hot-reload
      hsts: { maxAge: 31536000, includeSubDomains: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }) as unknown as RequestHandler,
  );

  // 1. CORS — allow the dev frontend by default; tighten in production env.
  app.use(
    cors({
      origin: config.env.FRONTEND_URL,
      credentials: true,
    }),
  );

  // 2. Body parsers — JSON only for now; multipart added when uploads land.
  // Casts work around an @types/express vs body-parser overload mismatch where
  // the returned NextHandleFunction is not seen as RequestHandler-compatible.
  app.use(express.json({ limit: '1mb' }) as RequestHandler);
  app.use(express.urlencoded({ extended: false, limit: '1mb' }) as RequestHandler);

  // 3. Request id — always on, even in tests, so callers can correlate.
  app.use(requestId);

  // 3b. Audit context — wraps the rest of the request in an
  // AsyncLocalStorage scope. Auth middlewares later set `actorUserId` once
  // req.user is resolved; the Prisma audit extension reads from this store
  // when emitting log rows, so writes carry actor + requestId without each
  // call site threading them manually.
  app.use(auditContext);

  // 4. Request logging — pino-http; skipped in tests to avoid output noise.
  // Cast: pino-http's HttpLogger satisfies RequestHandler at runtime but the
  // exported type doesn't line up with Express's overload set.
  if (!config.isTest) {
    app.use(requestLogger as unknown as RequestHandler);
  }

  // 5. Global IP rate limiting (1000 req/min/IP).
  app.use(rateLimit);

  // 6. Routes
  app.get('/', (_req: Request, res: Response) =>
    sendSuccess(res, {
      name: packageJson.name,
      version: packageJson.version,
      message: 'Modular Furniture ERP backend. See /health.',
    }),
  );

  app.get('/health', (_req: Request, res: Response) =>
    sendSuccess(res, {
      status: 'ok',
      timestamp: nowIso(),
      version: packageJson.version,
    }),
  );

  // 6b. Static uploads — logos, future document downloads. Path resolves to
  // <repo>/uploads. The directory is gitignored; in production this is
  // typically swapped for object storage (S3 / GCS) and removed from here.
  // Cast: serve-static's RequestHandler doesn't fit any Express overload
  // cleanly under the current @types/express; runtime is fine.
  app.use(
    '/uploads',
    express.static(UPLOADS_PATH, { fallthrough: true }) as unknown as RequestHandler,
  );

  // 7. Domain routes — /api/auth, /api/portal/auth, ...
  registerRoutes(app);

  // 8. Extra routes (test hook / future modules) before the 404.
  opts.registerExtraRoutes?.(app);

  // 9. 404 — anything unmatched at this point.
  app.use(notFoundHandler);

  // 10. Error handler — LAST.
  app.use(errorHandler);

  logger.debug('express app initialized');
  return app;
}
