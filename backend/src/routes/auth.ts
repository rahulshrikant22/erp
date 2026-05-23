/**
 * Auth routes for INTERNAL users.
 *
 *   POST /api/auth/login
 *   POST /api/auth/refresh
 *   POST /api/auth/logout            (auth required)
 *   POST /api/auth/logout-all        (auth required)
 *   POST /api/auth/forgot-password
 *   POST /api/auth/reset-password
 *   POST /api/auth/change-password   (auth required)
 *   GET  /api/auth/me                (auth required)
 *   GET  /api/auth/sessions          (auth required)
 *
 * Everything goes through services/auth.ts; routes only validate input,
 * extract the request id / IP / UA, and wrap the result in the envelope.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  changePassword,
  forgotPassword,
  listSessions,
  login,
  logout,
  logoutAll,
  refresh,
  resetPassword,
} from '../services/auth';
import {
  disableMfa,
  generateMfaTempToken,
  regenerateBackupCodes,
  setupMfa,
  verifyMfaCode,
  verifyMfaTempToken,
  verifySetup,
} from '../services/mfa';
import { generateTokenPair } from '../services/jwt';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { AuthError } from '../errors';
import { sendSuccess } from '../utils/response';
import { parseBody } from '../utils/validate';
import { requireInternal } from '../middleware/auth';
import { loginLimit, forgotPasswordLimit } from '../middleware/rate-limit';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceInfo: z.record(z.string(), z.unknown()).optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const forgotSchema = z.object({
  email: z.string().email(),
});

const resetSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(1),
});

const changeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

router.post('/login', loginLimit, async (req, res, next) => {
  try {
    const input = parseBody(req, loginSchema);
    const result = await login({
      email: input.email,
      password: input.password,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? undefined,
      deviceInfo: input.deviceInfo,
    });

    if (result.user.twoFactorEnabled) {
      await logout(result.sessionId);
      const tempToken = generateMfaTempToken(result.user.id);
      sendSuccess(res, { mfaRequired: true, tempToken });
      return;
    }

    sendSuccess(res, {
      user: result.user,
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      accessExpiresAt: result.tokens.accessExpiresAt.toISOString(),
      refreshExpiresAt: result.tokens.refreshExpiresAt.toISOString(),
      sessionId: result.sessionId,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const input = parseBody(req, refreshSchema);
    const result = await refresh(input.refreshToken);
    sendSuccess(res, {
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      accessExpiresAt: result.tokens.accessExpiresAt.toISOString(),
      refreshExpiresAt: result.tokens.refreshExpiresAt.toISOString(),
      rotated: result.rotated,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', requireInternal, async (req, res, next) => {
  try {
    await logout(req.user!.sessionId);
    sendSuccess(res, { ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/logout-all', requireInternal, async (req, res, next) => {
  try {
    const result = await logoutAll(req.user!.id);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

router.post('/forgot-password', forgotPasswordLimit, async (req, res, next) => {
  try {
    const input = parseBody(req, forgotSchema);
    const result = await forgotPassword(input.email);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const input = parseBody(req, resetSchema);
    await resetPassword({ token: input.token, newPassword: input.newPassword });
    sendSuccess(res, { ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/change-password', requireInternal, async (req, res, next) => {
  try {
    const input = parseBody(req, changeSchema);
    await changePassword({
      userId: req.user!.id,
      currentSessionId: req.user!.sessionId,
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
    });
    sendSuccess(res, { ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireInternal, async (req, res, next) => {
  try {
    sendSuccess(res, { user: req.user });
  } catch (err) {
    next(err);
  }
});

router.get('/sessions', requireInternal, async (req, res, next) => {
  try {
    const sessions = await listSessions(req.user!.id);
    sendSuccess(res, {
      sessions: sessions.map((s) => ({
        ...s,
        issuedAt: s.issuedAt.toISOString(),
        lastUsedAt: s.lastUsedAt?.toISOString() ?? null,
        expiresAt: s.expiresAt.toISOString(),
        isCurrent: s.id === req.user!.sessionId,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// -- MFA endpoints --------------------------------------------------------

const mfaVerifySchema = z.object({
  tempToken: z.string().min(1),
  code: z.string().min(6).max(8),
});

const mfaCodeSchema = z.object({ code: z.string().min(6).max(8) });

const mfaDisableSchema = z.object({
  password: z.string().min(1),
  code: z.string().min(6).max(8),
});

router.post('/mfa/setup', requireInternal, async (req, res, next) => {
  try {
    const result = await setupMfa(req.user!.id);
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.post('/mfa/verify-setup', requireInternal, async (req, res, next) => {
  try {
    const { code } = parseBody(req, mfaCodeSchema);
    await verifySetup(req.user!.id, code);
    sendSuccess(res, { ok: true, mfaEnabled: true });
  } catch (err) { next(err); }
});

router.post('/mfa/disable', requireInternal, async (req, res, next) => {
  try {
    const { password, code } = parseBody(req, mfaDisableSchema);
    await disableMfa(req.user!.id, password, code);
    sendSuccess(res, { ok: true, mfaEnabled: false });
  } catch (err) { next(err); }
});

router.post('/mfa/verify', async (req, res, next) => {
  try {
    const input = parseBody(req, mfaVerifySchema);
    const payload = verifyMfaTempToken(input.tempToken);
    const result = await verifyMfaCode(payload.sub, input.code);
    if (!result.valid) {
      throw new AuthError('Invalid MFA code');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new AuthError('User not found or inactive');
    }

    const refreshExpiresAt = new Date(
      Date.now() + config.env.AUTH_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    const session = await prisma.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: 'pending',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
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

    sendSuccess(res, {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        userType: user.userType,
        isActive: user.isActive,
        twoFactorEnabled: user.twoFactorEnabled,
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessExpiresAt: tokens.accessExpiresAt.toISOString(),
      refreshExpiresAt: tokens.refreshExpiresAt.toISOString(),
      sessionId: session.id,
    });
  } catch (err) { next(err); }
});

router.post('/mfa/regenerate-backup-codes', requireInternal, async (req, res, next) => {
  try {
    const codes = await regenerateBackupCodes(req.user!.id);
    sendSuccess(res, { backupCodes: codes });
  } catch (err) { next(err); }
});

export default router;
