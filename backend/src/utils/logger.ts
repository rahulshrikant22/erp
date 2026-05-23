/**
 * Application logger — pino, pretty-printed in development, JSON in production.
 *
 * Use the named export `logger` everywhere. The HTTP request logger middleware
 * (middleware/request-logger.ts) is built on top of this same instance via
 * pino-http so logs share a single output sink.
 */
import pino, { type Logger } from 'pino';
import { config } from '../config';

const transport = config.isDev
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore: 'pid,hostname',
        singleLine: false,
      },
    }
  : undefined;

export const logger: Logger = pino({
  level: config.logLevel,
  base: { service: 'erp-backend' },
  transport,
});
