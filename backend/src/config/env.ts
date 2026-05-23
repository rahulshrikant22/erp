/**
 * Environment loader — single source of truth for configuration.
 *
 * Reads the repo-root .env (one level above /backend) and validates it with
 * zod. Anything else in the codebase imports from `./index` and gets a
 * fully-typed `config` object — no `process.env.X` access elsewhere.
 *
 * Failing validation throws on import so a misconfigured server never starts.
 */
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().url(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),

  FRONTEND_URL: z.string().url(),

  // Optional log level override; defaults to debug in dev, info in prod.
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .optional(),

  // --- Auth (P0-05) ---
  AUTH_ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  AUTH_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  AUTH_LOCKOUT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  AUTH_LOCKOUT_DURATION_MINUTES: z.coerce.number().int().positive().default(15),
  AUTH_PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  AUTH_BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),

  // --- Password breach checking (HaveIBeenPwned) ---
  // K-anonymity model so only the first 5 SHA-1 chars of the password leave
  // the box. Set to "false" in .env to skip during offline dev / tests.
  PASSWORD_BREACH_CHECK_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  // --- SMTP (placeholder; real provider abstraction in P0-15) ---
  // Leaving SMTP_HOST empty makes the email service fall back to a log-only
  // transport — useful for local dev and for tests.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().default('noreply@erp.local'),
  SMTP_FROM_NAME: z.string().default('Modular Furniture ERP'),

  // --- SMS / DLT (P0-16) ---
  // DLT enforcement: when true, SMS sends require a registered dltTemplateId
  // on the template. Off in dev/tests so smoke flows don't need real TRAI
  // registration; ON in production.
  DLT_ENFORCEMENT_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // Per-recipient send cap to prevent abuse. Counted against the last hour
  // of notification_log entries for that destination.
  SMS_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(5),

  // --- WhatsApp (P0-17) ---
  WHATSAPP_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(10),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Prefer a compact, readable failure over zod's default flatten output.
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`Invalid environment variables:\n${issues}`);
  throw new Error('Environment validation failed');
}

export const env = parsed.data;
export type Env = typeof env;
