/**
 * Password service — hashing, verification, policy enforcement,
 * password-history checks, and HaveIBeenPwned breach checking.
 *
 * The password policy is intentionally strict because reasonable defaults
 * keep the install useful in regulated environments out of the box.
 *
 * Policy:
 *   - >= 12 characters
 *   - At least one uppercase, one lowercase, one digit, one symbol
 *   - Must not contain the user's email local-part, first name, or last name
 *     (case-insensitive, length >= 3 to avoid false matches on initials)
 *   - Must not match any of the user's last 5 password hashes
 *   - When PASSWORD_BREACH_CHECK_ENABLED is true, must not appear in HIBP
 */
import bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { ValidationError } from '../errors';
import { logger } from '../utils/logger';

const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const HIBP_TIMEOUT_MS = 4000;
const HISTORY_LOOKBACK = 5;

export interface PasswordContext {
  /** All identity strings to forbid as substrings (email, first name, last name). */
  forbiddenSubstrings: string[];
  /** Optional user id; when set, the last N password hashes are checked. */
  userId?: string;
  /** Same for customer users. Either-or with userId. */
  customerUserId?: string;
}

export const basePasswordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(256, 'Password is too long')
  .refine((p) => /[A-Z]/.test(p), 'Password must contain an uppercase letter')
  .refine((p) => /[a-z]/.test(p), 'Password must contain a lowercase letter')
  .refine((p) => /\d/.test(p), 'Password must contain a digit')
  .refine(
    (p) => /[^A-Za-z0-9]/.test(p),
    'Password must contain a symbol',
  );

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, config.env.AUTH_BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Validate a candidate password against the full policy.
 *
 * Throws ValidationError on the first failure with `details.field = "password"`
 * and a human-readable message. Returns void on success.
 */
export async function assertPasswordPolicy(
  candidate: string,
  ctx: PasswordContext,
): Promise<void> {
  const parsed = basePasswordSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0].message, { field: 'password' });
  }

  const lower = candidate.toLowerCase();
  for (const sub of ctx.forbiddenSubstrings) {
    const cleaned = sub?.trim().toLowerCase();
    if (!cleaned || cleaned.length < 3) continue;
    if (lower.includes(cleaned)) {
      throw new ValidationError(
        'Password must not contain your email or name',
        { field: 'password', reason: 'identity_substring' },
      );
    }
  }

  if (ctx.userId) {
    const recent = await prisma.userPasswordHistory.findMany({
      where: { userId: ctx.userId },
      orderBy: { setAt: 'desc' },
      take: HISTORY_LOOKBACK,
      select: { passwordHash: true },
    });
    for (const row of recent) {
      if (await bcrypt.compare(candidate, row.passwordHash)) {
        throw new ValidationError(
          `Password matches one of your last ${HISTORY_LOOKBACK} passwords`,
          { field: 'password', reason: 'history_match' },
        );
      }
    }
  }

  if (config.env.PASSWORD_BREACH_CHECK_ENABLED) {
    const breached = await isBreached(candidate).catch((err) => {
      // Treat HIBP failure as non-fatal — we don't want a third-party outage
      // to lock users out of password set / change. Log and proceed.
      logger.warn({ err }, 'HIBP breach check failed; allowing password through');
      return false;
    });
    if (breached) {
      throw new ValidationError(
        'This password has appeared in a known breach. Choose a different one.',
        { field: 'password', reason: 'breached' },
      );
    }
  }
}

/**
 * HaveIBeenPwned check using the k-anonymity range API. Only the first 5
 * hex chars of the SHA-1 leave the box; HIBP returns all hashes with that
 * prefix and we check the suffix locally.
 */
export async function isBreached(plain: string): Promise<boolean> {
  const sha1 = createHash('sha1').update(plain).digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HIBP_TIMEOUT_MS);
  try {
    const res = await fetch(`${HIBP_RANGE_URL}${prefix}`, {
      headers: {
        'Add-Padding': 'true',
        'User-Agent': 'modular-furniture-erp/0.1.0',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HIBP returned ${res.status}`);
    }
    const body = await res.text();
    for (const line of body.split('\n')) {
      const [hashSuffix] = line.split(':');
      if (hashSuffix?.trim().toUpperCase() === suffix) return true;
    }
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Append a row to user_password_history. Caller is expected to have just
 * updated the user's password; this records the *new* hash for future
 * history checks.
 */
export async function recordPasswordHistory(userId: string, hash: string): Promise<void> {
  await prisma.userPasswordHistory.create({
    data: { userId, passwordHash: hash },
  });
}
