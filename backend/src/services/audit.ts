/**
 * Audit logger — writes one row per recorded action to core.audit_logs.
 *
 * Two entry points:
 *   - logAction(...)   — Prisma-driven CRUD events; called by the audit
 *                        extension in lib/prisma.ts. Computes a shallow JSON
 *                        diff between before/after.
 *   - auditEvent(...)  — Manual, non-Prisma events (login, logout, password
 *                        change, permission failure, etc.). Caller decides
 *                        what goes into details.
 *
 * Sensitive field protection:
 *   Field names matching SENSITIVE_FIELD_PATTERN have their values replaced
 *   with REDACTION_MARKER before storage. Applied to before, after, and the
 *   details payload of manual events. Recursive on plain objects only.
 *
 * Direct DB writes — we use the BARE PrismaClient (lib/prisma-base.ts) here
 * to bypass the audit extension. Auditing the audit table is an obvious
 * recursion trap.
 */
import { rawPrisma } from '../lib/prisma-base';
import { logger } from '../utils/logger';
import { currentAuditContext } from './audit-context';

export const REDACTION_MARKER = '***REDACTED***';

/** Field-name patterns whose values are redacted before being logged. */
const SENSITIVE_FIELD_PATTERN =
  /password|secret|token|hash|encrypted|ssn|pan|credit_?card|cvv|otp/i;

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | string; // free-form for manual events (login, logout, permission_denied, ...)

export interface LogActionInput {
  entityType: string;
  entityId?: string | null;
  action: AuditAction;
  beforeData?: unknown;
  afterData?: unknown;
  /** Optional override for actor; defaults to currentAuditContext().actorUserId. */
  actorUserId?: string | null;
}

export async function logAction(input: LogActionInput): Promise<void> {
  const ctx = currentAuditContext();
  const before = input.beforeData == null ? null : redact(input.beforeData);
  const after = input.afterData == null ? null : redact(input.afterData);
  const summary = computeChangesSummary(before, after, input.action);

  try {
    await rawPrisma.auditLog.create({
      data: {
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        action: input.action,
        actorUserId: input.actorUserId ?? ctx.actorUserId ?? null,
        actorIp: ctx.ipAddress ?? null,
        actorUserAgent: ctx.userAgent ?? null,
        beforeData: before as never,
        afterData: after as never,
        changesSummary: summary,
        requestId: ctx.requestId ?? null,
      },
    });
  } catch (err) {
    // An audit failure should NEVER take down the underlying request.
    // Log loudly and move on.
    logger.error(
      { err, entityType: input.entityType, action: input.action },
      'audit logAction failed',
    );
  }
}

export interface AuditEventInput {
  eventType: string;
  details?: Record<string, unknown>;
  /** Entity association — useful for "permission_denied on Order X". */
  entityType?: string;
  entityId?: string | null;
  /** Override actor; defaults to currentAuditContext().actorUserId. */
  actorUserId?: string | null;
}

export async function auditEvent(input: AuditEventInput): Promise<void> {
  await logAction({
    entityType: input.entityType ?? 'event',
    entityId: input.entityId,
    action: input.eventType,
    afterData: input.details,
    actorUserId: input.actorUserId,
  });
}

// -- helpers -------------------------------------------------------------

function redact(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value !== 'object') return value;

  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_FIELD_PATTERN.test(k)) {
      out[k] = REDACTION_MARKER;
    } else if (v != null && typeof v === 'object') {
      out[k] = redact(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

interface ChangeEntry {
  field: string;
  before: unknown;
  after: unknown;
}

/**
 * Shallow diff at the top level only. Logs of nested-object changes show the
 * whole subtree before/after rather than nested per-field deltas — keeps the
 * diff cheap to compute and easy to read in queries.
 */
function computeChangesSummary(
  before: unknown,
  after: unknown,
  action: string,
): string {
  if (action === 'create') {
    if (!isObject(after)) return 'created';
    return `created with ${Object.keys(after).length} fields`;
  }
  if (action === 'delete') {
    if (!isObject(before)) return 'deleted';
    return `deleted ${Object.keys(before).length}-field row`;
  }
  if (action === 'update' && isObject(before) && isObject(after)) {
    const diff: ChangeEntry[] = [];
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
      // skip server-managed timestamps from the diff (always change on update)
      if (k === 'updatedAt') continue;
      const b = before[k];
      const a = after[k];
      if (!shallowEqual(b, a)) diff.push({ field: k, before: b, after: a });
    }
    if (diff.length === 0) return 'no field changes (updatedAt only)';
    return diff.map((d) => d.field).sort().join(', ');
  }
  // For manual events: just stringify a short summary.
  return action;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (typeof a === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

// -- retention ----------------------------------------------------------

/**
 * Mark / archive logs older than `retentionDays`. For now we just delete
 * (regulatory note: in production we'd move to cold storage; for Phase 0 a
 * simple cutoff is fine and easy to verify). Returns count.
 *
 * Hook for the cron in P0-19+ — call from there or via the admin endpoint.
 */
export async function archiveOldLogs(retentionDays: number): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const r = await rawPrisma.auditLog.deleteMany({
    where: { actionAt: { lt: cutoff } },
  });
  return { deleted: r.count };
}

// -- skip list ---------------------------------------------------------

/**
 * Models the audit extension does NOT auto-log. Reasons:
 *   AuditLog        — recursion (writing audit auto-creates audit row).
 *   LoginAttempt    — high volume; logged manually as 'login_success'/'login_failure' events.
 *   NotificationLog — high volume; the parent Notification row IS logged.
 *   Notification    — high volume on busy systems; revisit if regulatory needs it.
 *   UserSession     — every refresh would write a row; log auth events instead.
 *   UserPasswordHistory — sensitive + redundant with manual 'password_changed' event.
 *   PasswordResetToken  — sensitive; the issuance event is logged manually.
 *   ModuleActivationHistory — already an audit-style table; let the trigger handle it.
 *   WorkflowActionLog — same — engine-internal log table.
 */
export const AUDIT_SKIPPED_MODELS = new Set<string>([
  'AuditLog',
  'LoginAttempt',
  'NotificationLog',
  'Notification',
  'UserSession',
  'UserPasswordHistory',
  'PasswordResetToken',
  'ModuleActivationHistory',
  'WorkflowActionLog',
]);
