/**
 * Auth middleware — turns a Bearer token into `req.user`.
 *
 * Behaviour:
 *   - 401 when the Authorization header is missing or malformed.
 *   - 401 when the access token is invalid / expired.
 *   - 401 when the user can no longer authenticate (deleted, inactive, locked).
 *   - On success: attaches a normalised principal to req.user containing the
 *     id, type, and a session id (when known).
 *
 * Two helpers are exported:
 *   - requireAuth      : either internal or external user
 *   - requireInternal  : strictly internal (use for /api/auth/*)
 *   - requireCustomer  : strictly external (use for /api/portal/auth/*)
 */
import type { RequestHandler } from 'express';
import { prisma } from '../lib/prisma';
import { AuthError, ForbiddenError } from '../errors';
import { verifyAccessToken, type UserType } from '../services/jwt';
import { auditStore } from '../services/audit-context';

function tagAuditContext(userId: string): void {
  const store = auditStore.getStore();
  if (store) store.actorUserId = userId;
}

export interface AuthPrincipal {
  id: string;
  userType: UserType;
  email: string;
  sessionId: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthPrincipal;
  }
}

function extractBearer(headerValue: string | undefined): string | null {
  if (!headerValue) return null;
  const m = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return m ? m[1].trim() : null;
}

async function loadInternal(userId: string, sessionId: string): Promise<AuthPrincipal> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.isDeleted || !user.isActive) {
    throw new AuthError('Account is no longer active');
  }
  if (user.isLocked && user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AuthError('Account is temporarily locked');
  }
  return { id: user.id, userType: 'internal', email: user.email, sessionId };
}

async function loadCustomer(userId: string, sessionId: string): Promise<AuthPrincipal> {
  const user = await prisma.customerUser.findUnique({
    where: { id: userId },
    include: { account: true },
  });
  if (!user || !user.isActive) throw new AuthError('Account is no longer active');
  if (!user.account.isActive || user.account.isDeleted) {
    throw new AuthError('Customer account is no longer available');
  }
  return { id: user.id, userType: 'external', email: user.email, sessionId };
}

async function assertSessionLive(sessionId: string): Promise<void> {
  const sess = await prisma.userSession.findUnique({ where: { id: sessionId } });
  if (!sess || sess.revokedAt || sess.expiresAt <= new Date()) {
    throw new AuthError('Session is no longer valid');
  }
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = extractBearer(req.headers.authorization);
    if (!token) throw new AuthError('Missing Authorization Bearer token');

    const payload = verifyAccessToken(token);
    await assertSessionLive(payload.sid);
    req.user = payload.ut === 'internal'
      ? await loadInternal(payload.sub, payload.sid)
      : await loadCustomer(payload.sub, payload.sid);
    tagAuditContext(req.user.id);
    next();
  } catch (err) {
    next(err);
  }
};

export const requireInternal: RequestHandler = async (req, _res, next) => {
  try {
    const token = extractBearer(req.headers.authorization);
    if (!token) throw new AuthError('Missing Authorization Bearer token');
    const payload = verifyAccessToken(token);
    if (payload.ut !== 'internal') {
      throw new ForbiddenError('Internal user required');
    }
    await assertSessionLive(payload.sid);
    req.user = await loadInternal(payload.sub, payload.sid);
    tagAuditContext(req.user.id);
    next();
  } catch (err) {
    next(err);
  }
};

export const requireCustomer: RequestHandler = async (req, _res, next) => {
  try {
    const token = extractBearer(req.headers.authorization);
    if (!token) throw new AuthError('Missing Authorization Bearer token');
    const payload = verifyAccessToken(token);
    if (payload.ut !== 'external') {
      throw new ForbiddenError('Customer user required');
    }
    await assertSessionLive(payload.sid);
    req.user = await loadCustomer(payload.sub, payload.sid);
    tagAuditContext(req.user.id);
    next();
  } catch (err) {
    next(err);
  }
};
