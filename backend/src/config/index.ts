/**
 * Application config — derived constants on top of the validated env.
 * Keep this file thin; behaviour changes belong with the feature, not here.
 */
import { env } from './env';

export const config = {
  env,
  isDev: env.NODE_ENV === 'development',
  isTest: env.NODE_ENV === 'test',
  isProd: env.NODE_ENV === 'production',
  logLevel: env.LOG_LEVEL ?? (env.NODE_ENV === 'production' ? 'info' : 'debug'),
} as const;

export type AppConfig = typeof config;
