/**
 * Auth orchestration for EXTERNAL users (core.customer_users).
 *
 * Mirrors services/auth.ts but operates on `customerUser`. Differences:
 *   - userType in tokens is 'external'
 *   - No isLocked column on CustomerUser → we still enforce IP / attempt
 *     throttling but don't toggle a lock flag (matches the simpler portal
 *     scope agreed in the spec; tightening lands when the portal grows).
 *   - Sessions are still stored in core.user_sessions but with userId set to
 *     the customer user's id; we distinguish by the `ut` claim in tokens.
 *
 * For now, customer users do NOT have password history or breach checks
 * separate from internal users — we apply the same policy to keep things
 * consistent. (This can split later if customers need different rules.)
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
  verifyPassword,
} from './password';
import {
  generateTokenPair,
  hashRefreshToken,
  isRefreshNearExpiry,
  verifyRefreshToken,
  type TokenPair,
} from './jwt';
import { sendMail } from './email';

const RESET_TOKEN_BYTES = 32;

export interface PublicCustomerUser {
  id: string;
  customerAccountId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
}

function toPublicCustomerUser(u: {
  id: string;
  customerAccountId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
}): PublicCustomerUser {
  return {
    id: u.id,
    customerAccountId: u.customerAccountId,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    isActive: u.isActive,
  };
}

export interface CustomerLoginInput {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
  deviceInfo?: Record<string, unknown>;
}

export interface CustomerLoginResult {
  user: PublicCustomerUser;
  tokens: TokenPair;
  sessionId: string;
}

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

async function recordAttempt(args: {
  identifier: string;
  success: boolean;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  await prisma.loginAttempt.create({
    data: {
      identifier: `portal:${args.identifier}`,
      success: args.success,
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
    },
  });
}

export async function customerLogin(input: CustomerLoginInput): Promise<CustomerLoginResult> {
  const email = input.email.toLowerCase().trim();
  if (await isIpBlocked(input.ipAddress)) {
    throw new AuthError('Access from this IP is temporarily blocked');
  }

  const user = await prisma.customerUser.findFirst({
    where: { email },
    include: { account: true },
  });

  if (!user) {
    await recordAttempt({
      identifier: email,
      success: false,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    throw invalidCredentials();
  }

  if (!user.isActive) {
    throw new AuthError('Account is inactive');
  }
  if (!user.account.isActive || user.account.isDeleted) {
    throw new AuthError('Account is no longer available');
  }

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    await recordAttempt({
      identifier: email,
      success: false,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    throw invalidCredentials();
  }

  const refreshExpiresAt = new Date(
    Date.now() + config.env.AUTH_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const session = await prisma.userSession.create({
    data: {
      customerUserId: user.id,
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
    userType: 'external',
    sessionId: session.id,
  });

  await prisma.userSession.update({
    where: { id: session.id },
    data: { refreshTokenHash: tokens.refreshTokenHash },
  });

  await Promise.all([
    recordAttempt({
      identifier: email,
      success: true,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    }),
    prisma.customerUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }),
  ]);

  return { user: toPublicCustomerUser(user), tokens, sessionId: session.id };
}

export async function customerRefresh(refreshTokenStr: string): Promise<{
  tokens: TokenPair;
  rotated: boolean;
}> {
  const payload = verifyRefreshToken(refreshTokenStr);
  if (payload.ut !== 'external') {
    throw new AuthError('Token does not belong to a customer user');
  }
  const incomingHash = hashRefreshToken(refreshTokenStr);
  const session = await prisma.userSession.findUnique({
    where: { id: payload.sid },
  });
  if (!session || session.revokedAt) {
    throw new AuthError('Session is no longer valid');
  }
  if (session.refreshTokenHash !== incomingHash) {
    throw new AuthError('Refresh token mismatch');
  }
  if (session.expiresAt <= new Date()) {
    throw new AuthError('Refresh token expired');
  }

  const user = await prisma.customerUser.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) {
    throw new AuthError('Account is not eligible for refresh');
  }

  const rotate = isRefreshNearExpiry(payload);
  const tokens = generateTokenPair({
    userId: user.id,
    userType: 'external',
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

export async function customerLogout(sessionId: string): Promise<void> {
  await prisma.userSession.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
}

export async function customerLogoutAll(customerUserId: string): Promise<{ revokedCount: number }> {
  const r = await prisma.userSession.updateMany({
    where: { customerUserId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return { revokedCount: r.count };
}

export async function customerForgotPassword(emailRaw: string): Promise<{
  ok: true;
  resetUrl: string | null;
}> {
  const email = emailRaw.toLowerCase().trim();
  const user = await prisma.customerUser.findFirst({ where: { email } });
  if (!user || !user.isActive) return { ok: true, resetUrl: null };

  // Reuse the `password_reset_tokens` table for both internal and customer
  // users — userId column is opaque (UUID); we know which kind it is by
  // checking which table the id resolves to at consumption time.
  const tokenPlain = randomBytes(RESET_TOKEN_BYTES).toString('hex');
  const tokenHash = createHash('sha256').update(tokenPlain).digest('hex');
  const expiresAt = new Date(
    Date.now() + config.env.AUTH_PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000,
  );

  await prisma.passwordResetToken.create({
    data: { customerUserId: user.id, tokenHash, expiresAt },
  });

  const resetUrl = `${config.env.FRONTEND_URL}/portal/reset-password?token=${tokenPlain}`;

  await sendMail({
    to: user.email,
    subject: 'Reset your customer portal password',
    text:
      `Hi ${user.firstName},\n\n` +
      `Use this link to set a new password for the customer portal:\n\n` +
      `${resetUrl}\n\n` +
      `Expires in ${config.env.AUTH_PASSWORD_RESET_TOKEN_TTL_MINUTES} minutes.\n`,
  });

  logger.info({ customerUserId: user.id }, 'customer password reset email sent');
  return { ok: true, resetUrl: config.isProd ? null : resetUrl };
}

export async function customerResetPassword(args: {
  token: string;
  newPassword: string;
}): Promise<void> {
  const tokenHash = createHash('sha256').update(args.token).digest('hex');
  const row = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
      customerUserId: { not: null },
    },
  });
  if (!row || !row.customerUserId) throw new AuthError('Invalid or expired reset token');

  const user = await prisma.customerUser.findUnique({ where: { id: row.customerUserId } });
  if (!user) throw new NotFoundError('Customer user no longer exists');

  await assertPasswordPolicy(args.newPassword, {
    forbiddenSubstrings: [user.email, user.firstName, user.lastName],
    customerUserId: user.id,
  });

  const newHash = await hashPassword(args.newPassword);

  await prisma.$transaction([
    prisma.customerUser.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
    prisma.userSession.updateMany({
      where: { customerUserId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

export async function customerChangePassword(args: {
  customerUserId: string;
  currentSessionId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const user = await prisma.customerUser.findUnique({ where: { id: args.customerUserId } });
  if (!user) throw new NotFoundError('Customer user not found');

  const ok = await verifyPassword(args.currentPassword, user.passwordHash);
  if (!ok) throw new AuthError('Current password is incorrect');

  if (args.currentPassword === args.newPassword) {
    throw new ValidationError('New password must be different from current password', {
      field: 'newPassword',
    });
  }

  await assertPasswordPolicy(args.newPassword, {
    forbiddenSubstrings: [user.email, user.firstName, user.lastName],
    customerUserId: user.id,
  });

  const newHash = await hashPassword(args.newPassword);

  await prisma.$transaction([
    prisma.customerUser.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    }),
    prisma.userSession.updateMany({
      where: {
        customerUserId: user.id,
        id: { not: args.currentSessionId },
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    }),
  ]);
}

export async function customerListSessions(customerUserId: string): Promise<
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
    where: { customerUserId, revokedAt: null, expiresAt: { gt: new Date() } },
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
