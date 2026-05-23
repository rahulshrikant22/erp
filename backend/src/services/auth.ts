/**
 * Auth orchestration for INTERNAL users (core.users).
 *
 * Each function is the single source of truth for one auth flow. Routes are
 * thin shells that validate input, call into here, and serialize the response
 * envelope. Anything that mutates auth state (login, refresh, logout, reset)
 * goes through this module so audit trails stay consistent.
 *
 * Customer-portal users have a parallel module — services/customer-auth.ts.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { AuthError, NotFoundError, ValidationError } from '../errors';
import { logger } from '../utils/logger';
import {
  assertPasswordPolicy,
  hashPassword,
  recordPasswordHistory,
  verifyPassword,
} from './password';
import {
  generateTokenPair,
  hashRefreshToken,
  isRefreshNearExpiry,
  verifyRefreshToken,
  type TokenPair,
} from './jwt';
import { sendTemplate } from './communication/email-service';

const RESET_TOKEN_BYTES = 32;

export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  userType: string;
  isActive: boolean;
  twoFactorEnabled: boolean;
}

function toPublicUser(u: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  userType: string;
  isActive: boolean;
  twoFactorEnabled: boolean;
}): PublicUser {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    userType: u.userType,
    isActive: u.isActive,
    twoFactorEnabled: u.twoFactorEnabled,
  };
}

export interface LoginInput {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
  deviceInfo?: Record<string, unknown>;
}

export interface LoginResult {
  user: PublicUser;
  tokens: TokenPair;
  sessionId: string;
}

/**
 * Generic, intentionally vague error so we don't reveal whether an email
 * exists. Both "user not found" and "password mismatch" surface as this.
 */
function invalidCredentials(): AuthError {
  return new AuthError('Invalid email or password');
}

async function isIpBlocked(ip?: string): Promise<boolean> {
  if (!ip) return false;
  const block = await prisma.ipBlocklist.findFirst({
    where: { ipAddress: ip, blockedUntil: { gt: new Date() } },
  });
  return block != null;
}

async function recordLoginAttempt(args: {
  identifier: string;
  success: boolean;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  await prisma.loginAttempt.create({
    data: {
      identifier: args.identifier,
      success: args.success,
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
    },
  });
}

async function applyLockoutIfNeeded(userId: string, identifier: string): Promise<void> {
  const since = new Date(
    Date.now() - config.env.AUTH_LOCKOUT_DURATION_MINUTES * 60 * 1000,
  );
  const recentFails = await prisma.loginAttempt.count({
    where: { identifier, success: false, attemptAt: { gte: since } },
  });
  if (recentFails >= config.env.AUTH_LOCKOUT_MAX_ATTEMPTS) {
    const lockedUntil = new Date(
      Date.now() + config.env.AUTH_LOCKOUT_DURATION_MINUTES * 60 * 1000,
    );
    await prisma.user.update({
      where: { id: userId },
      data: { isLocked: true, lockedUntil },
    });
    logger.warn(
      { userId, identifier, lockedUntil },
      'account locked after repeated failures',
    );
  }
}

export async function login(input: LoginInput): Promise<LoginResult> {
  const email = input.email.toLowerCase().trim();

  if (await isIpBlocked(input.ipAddress)) {
    throw new AuthError('Access from this IP is temporarily blocked');
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // Always log the attempt — even for unknown emails — so abuse patterns are visible.
  if (!user) {
    await recordLoginAttempt({
      identifier: email,
      success: false,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    throw invalidCredentials();
  }

  // Auto-unlock when lockedUntil has passed.
  if (user.isLocked && user.lockedUntil && user.lockedUntil <= new Date()) {
    await prisma.user.update({
      where: { id: user.id },
      data: { isLocked: false, lockedUntil: null },
    });
    user.isLocked = false;
    user.lockedUntil = null;
  }

  if (user.isLocked) {
    throw new AuthError('Account is temporarily locked. Try again later.', {
      lockedUntil: user.lockedUntil,
    });
  }

  if (!user.isActive || user.isDeleted) {
    throw new AuthError('Account is inactive');
  }

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    await recordLoginAttempt({
      identifier: email,
      success: false,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    await applyLockoutIfNeeded(user.id, email);
    throw invalidCredentials();
  }

  // Success path: create a session row, sign tokens that reference its id,
  // store the refresh hash, then return.
  const refreshExpiresAt = new Date(
    Date.now() + config.env.AUTH_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const session = await prisma.userSession.create({
    data: {
      userId: user.id,
      // Placeholder hash — replaced immediately below with the real one.
      // We need the row id to embed in the refresh token before we can
      // compute the actual hash, so the two writes are sequential.
      refreshTokenHash: 'pending',
      deviceInfo: (input.deviceInfo ?? undefined) as Prisma.InputJsonValue | undefined,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      expiresAt: refreshExpiresAt,
      lastUsedAt: new Date(),
    },
  });

  const tokens = generateTokenPair({
    userId: user.id,
    userType: 'internal',
    sessionId: session.id,
  });

  await prisma.userSession.update({
    where: { id: session.id },
    data: { refreshTokenHash: tokens.refreshTokenHash },
  });

  await Promise.all([
    recordLoginAttempt({
      identifier: email,
      success: true,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }),
  ]);

  return { user: toPublicUser(user), tokens, sessionId: session.id };
}

export interface RefreshResult {
  tokens: TokenPair;
  rotated: boolean;
}

export async function refresh(refreshTokenStr: string): Promise<RefreshResult> {
  const payload = verifyRefreshToken(refreshTokenStr);
  if (payload.ut !== 'internal') {
    throw new AuthError('Token does not belong to an internal user');
  }

  const incomingHash = hashRefreshToken(refreshTokenStr);
  const session = await prisma.userSession.findUnique({
    where: { id: payload.sid },
  });
  if (!session || session.revokedAt) {
    throw new AuthError('Session is no longer valid');
  }
  if (session.refreshTokenHash !== incomingHash) {
    // Token was tampered with or has already been rotated. Belt-and-braces.
    throw new AuthError('Refresh token mismatch');
  }
  if (session.expiresAt <= new Date()) {
    throw new AuthError('Refresh token expired');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive || user.isDeleted || user.isLocked) {
    throw new AuthError('Account is not eligible for refresh');
  }

  const rotate = isRefreshNearExpiry(payload);
  const tokens = generateTokenPair({
    userId: user.id,
    userType: 'internal',
    sessionId: session.id,
  });

  await prisma.userSession.update({
    where: { id: session.id },
    data: rotate
      ? {
          refreshTokenHash: tokens.refreshTokenHash,
          expiresAt: tokens.refreshExpiresAt,
          lastUsedAt: new Date(),
        }
      : { lastUsedAt: new Date() },
  });

  // When NOT rotating, we keep returning the same refresh token to the caller
  // so the existing one stays valid until natural expiry.
  return rotate
    ? { tokens, rotated: true }
    : {
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: refreshTokenStr,
          refreshTokenHash: incomingHash,
          accessExpiresAt: tokens.accessExpiresAt,
          refreshExpiresAt: session.expiresAt,
        },
        rotated: false,
      };
}

export async function logout(sessionId: string): Promise<void> {
  await prisma.userSession.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
}

export async function logoutAll(userId: string): Promise<{ revokedCount: number }> {
  const result = await prisma.userSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return { revokedCount: result.count };
}

export async function listSessions(userId: string): Promise<
  {
    id: string;
    deviceInfo: unknown;
    ipAddress: string | null;
    userAgent: string | null;
    issuedAt: Date;
    lastUsedAt: Date | null;
    expiresAt: Date;
  }[]
> {
  return prisma.userSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: {
      id: true,
      deviceInfo: true,
      ipAddress: true,
      userAgent: true,
      issuedAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
    orderBy: { lastUsedAt: 'desc' },
  });
}

export interface ForgotPasswordResult {
  /** Always true — we don't reveal whether the email exists. */
  ok: true;
  /** Only present in non-production for ergonomics; null in prod. */
  resetUrl: string | null;
}

export async function forgotPassword(emailRaw: string): Promise<ForgotPasswordResult> {
  const email = emailRaw.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });

  // Always behave as if we sent the email — no enumeration.
  if (!user || !user.isActive || user.isDeleted) {
    return { ok: true, resetUrl: null };
  }

  const tokenPlain = randomBytes(RESET_TOKEN_BYTES).toString('hex');
  const tokenHash = createHash('sha256').update(tokenPlain).digest('hex');
  const expiresAt = new Date(
    Date.now() + config.env.AUTH_PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000,
  );

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  const resetUrl = `${config.env.FRONTEND_URL}/reset-password?token=${tokenPlain}`;

  // Use the templated path. Fall back gracefully if the template hasn't been
  // seeded yet (renderTemplate throws NotFoundError) — older deployments that
  // re-run after a partial seed shouldn't lose the reset flow over branding.
  await sendTemplate({
    to: user.email,
    templateCode: 'password_reset',
    notificationType: 'password_reset',
    recipientUserId: user.id,
    variables: {
      firstName: user.firstName,
      orgName: 'Modular Furniture ERP',
      resetUrl,
      ttlMinutes: config.env.AUTH_PASSWORD_RESET_TOKEN_TTL_MINUTES,
    },
  }).catch((err) => {
    // Log and surface to caller via the resetUrl in non-prod (existing behaviour).
    logger.warn({ err }, 'password_reset template send failed; reset URL is still valid');
  });

  return { ok: true, resetUrl: config.isProd ? null : resetUrl };
}

export async function resetPassword(args: {
  token: string;
  newPassword: string;
}): Promise<void> {
  const tokenHash = createHash('sha256').update(args.token).digest('hex');
  const row = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
      userId: { not: null },
    },
  });
  if (!row || !row.userId) throw new AuthError('Invalid or expired reset token');

  const user = await prisma.user.findUnique({ where: { id: row.userId } });
  if (!user) throw new NotFoundError('User no longer exists');

  await assertPasswordPolicy(args.newPassword, {
    forbiddenSubstrings: [user.email, user.firstName, user.lastName],
    userId: user.id,
  });

  const newHash = await hashPassword(args.newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
      },
    }),
    prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
    // Invalidate every active session — set revokedAt rather than delete so
    // we keep an audit trail.
    prisma.userSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await recordPasswordHistory(user.id, newHash);
}

export async function changePassword(args: {
  userId: string;
  currentSessionId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: args.userId } });
  if (!user) throw new NotFoundError('User not found');

  const ok = await verifyPassword(args.currentPassword, user.passwordHash);
  if (!ok) throw new AuthError('Current password is incorrect');

  if (args.currentPassword === args.newPassword) {
    throw new ValidationError('New password must be different from current password', {
      field: 'newPassword',
    });
  }

  await assertPasswordPolicy(args.newPassword, {
    forbiddenSubstrings: [user.email, user.firstName, user.lastName],
    userId: user.id,
  });

  const newHash = await hashPassword(args.newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
      },
    }),
    // Revoke OTHER sessions; keep the current one alive so the user can
    // continue working without re-login.
    prisma.userSession.updateMany({
      where: {
        userId: user.id,
        id: { not: args.currentSessionId },
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    }),
  ]);

  await recordPasswordHistory(user.id, newHash);
}
