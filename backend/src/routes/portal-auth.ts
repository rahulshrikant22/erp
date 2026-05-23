/**
 * Auth routes for EXTERNAL (customer) users — mirrors /api/auth.
 *
 *   POST /api/portal/auth/login
 *   POST /api/portal/auth/refresh
 *   POST /api/portal/auth/logout            (auth required)
 *   POST /api/portal/auth/logout-all        (auth required)
 *   POST /api/portal/auth/forgot-password
 *   POST /api/portal/auth/reset-password
 *   POST /api/portal/auth/change-password   (auth required)
 *   GET  /api/portal/auth/me                (auth required)
 *   GET  /api/portal/auth/sessions          (auth required)
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  customerChangePassword,
  customerForgotPassword,
  customerListSessions,
  customerLogin,
  customerLogout,
  customerLogoutAll,
  customerRefresh,
  customerResetPassword,
} from '../services/customer-auth';
import { sendSuccess } from '../utils/response';
import { parseBody } from '../utils/validate';
import { requireCustomer } from '../middleware/auth';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceInfo: z.record(z.string(), z.unknown()).optional(),
});
const refreshSchema = z.object({ refreshToken: z.string().min(1) });
const forgotSchema  = z.object({ email: z.string().email() });
const resetSchema   = z.object({ token: z.string().min(1), newPassword: z.string().min(1) });
const changeSchema  = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(1) });

router.post('/login', async (req, res, next) => {
  try {
    const input = parseBody(req, loginSchema);
    const result = await customerLogin({
      email: input.email,
      password: input.password,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? undefined,
      deviceInfo: input.deviceInfo,
    });
    sendSuccess(res, {
      user: result.user,
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      accessExpiresAt: result.tokens.accessExpiresAt.toISOString(),
      refreshExpiresAt: result.tokens.refreshExpiresAt.toISOString(),
      sessionId: result.sessionId,
    });
  } catch (err) { next(err); }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const input = parseBody(req, refreshSchema);
    const r = await customerRefresh(input.refreshToken);
    sendSuccess(res, {
      accessToken: r.tokens.accessToken,
      refreshToken: r.tokens.refreshToken,
      accessExpiresAt: r.tokens.accessExpiresAt.toISOString(),
      refreshExpiresAt: r.tokens.refreshExpiresAt.toISOString(),
      rotated: r.rotated,
    });
  } catch (err) { next(err); }
});

router.post('/logout', requireCustomer, async (req, res, next) => {
  try { await customerLogout(req.user!.sessionId); sendSuccess(res, { ok: true }); }
  catch (err) { next(err); }
});

router.post('/logout-all', requireCustomer, async (req, res, next) => {
  try { sendSuccess(res, await customerLogoutAll(req.user!.id)); }
  catch (err) { next(err); }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const input = parseBody(req, forgotSchema);
    sendSuccess(res, await customerForgotPassword(input.email));
  } catch (err) { next(err); }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const input = parseBody(req, resetSchema);
    await customerResetPassword({ token: input.token, newPassword: input.newPassword });
    sendSuccess(res, { ok: true });
  } catch (err) { next(err); }
});

router.post('/change-password', requireCustomer, async (req, res, next) => {
  try {
    const input = parseBody(req, changeSchema);
    await customerChangePassword({
      customerUserId: req.user!.id,
      currentSessionId: req.user!.sessionId,
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
    });
    sendSuccess(res, { ok: true });
  } catch (err) { next(err); }
});

router.get('/me', requireCustomer, async (req, res, next) => {
  try { sendSuccess(res, { user: req.user }); }
  catch (err) { next(err); }
});

router.get('/sessions', requireCustomer, async (req, res, next) => {
  try {
    const sessions = await customerListSessions(req.user!.id);
    sendSuccess(res, {
      sessions: sessions.map((s) => ({
        ...s,
        issuedAt: s.issuedAt.toISOString(),
        lastUsedAt: s.lastUsedAt?.toISOString() ?? null,
        expiresAt: s.expiresAt.toISOString(),
        isCurrent: s.id === req.user!.sessionId,
      })),
    });
  } catch (err) { next(err); }
});

export default router;
