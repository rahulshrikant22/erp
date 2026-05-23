/**
 * Wraps each request in an audit-context AsyncLocalStorage scope.
 *
 * Mounts BEFORE the auth middleware so requestId / IP / UA are captured for
 * every request — even unauthenticated ones (logins, signups, public
 * endpoints). The auth middleware later writes actorUserId into the same
 * context object once it has resolved req.user.
 */
import type { RequestHandler } from 'express';
import { auditStore } from '../services/audit-context';

export const auditContext: RequestHandler = (req, _res, next) => {
  auditStore.run(
    {
      requestId: req.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? undefined,
    },
    () => next(),
  );
};
