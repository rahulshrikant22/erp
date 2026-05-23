/**
 * Backend entry point — boots the Express app from `./app`.
 *
 * P0-03 promoted this from a single-file Express toy to the real wired-up
 * server: zod-validated config, pino logger, error handler, request logger,
 * stub middleware (auth/rbac/rate-limit) ready for later prompts to fill.
 */
import { createApp } from './app';
import { config } from './config';
import { logger } from './utils/logger';

const app = createApp();

const server = app.listen(config.env.PORT, () => {
  logger.info(
    {
      port: config.env.PORT,
      env: config.env.NODE_ENV,
    },
    'erp-backend listening',
  );
});

// Graceful shutdown — give in-flight requests a few seconds before SIGKILL.
const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutdown requested');
  const timer = setTimeout(() => {
    logger.warn('forced shutdown — connections did not close in time');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  timer.unref();
  server.close((err) => {
    if (err) {
      logger.error({ err }, 'error during shutdown');
      process.exit(1);
    }
    logger.info('shutdown complete');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
