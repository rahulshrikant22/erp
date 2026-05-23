/**
 * Per-request audit context, threaded through async chains via AsyncLocalStorage.
 *
 * The context is populated by the audit-context middleware at the top of the
 * request pipeline (with requestId / IP / UA), then auth middleware mutates
 * it once req.user is known to set actorUserId. The Prisma audit extension
 * reads from this store when emitting log rows so writes carry the correct
 * actor without each call site having to thread the context manually.
 *
 * Outside of an HTTP request (background jobs, scripts, tests) the store is
 * empty and audit rows simply lack an actor — that's fine; system-emitted
 * events are still logged.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface AuditContext {
  actorUserId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export const auditStore = new AsyncLocalStorage<AuditContext>();

/** Snapshot the current context (or empty object). Mutating the result is safe. */
export function currentAuditContext(): AuditContext {
  return auditStore.getStore() ?? {};
}

/**
 * Run `fn` inside a fresh audit context. Used by the HTTP middleware; tests
 * can use it directly to simulate a request scope.
 */
export function runInAuditContext<T>(ctx: AuditContext, fn: () => T): T {
  return auditStore.run({ ...ctx }, fn);
}
