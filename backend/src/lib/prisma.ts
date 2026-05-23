/**
 * App-facing Prisma client — same singleton as `prisma-base` but extended
 * with the audit middleware so every create/update/delete/upsert on a
 * tracked model writes a row to core.audit_logs.
 *
 * Models in AUDIT_SKIPPED_MODELS bypass the extension. updateMany, deleteMany
 * and createMany are NOT intercepted in P0-09 — bulk callers should emit a
 * manual auditEvent if they need a paper trail.
 *
 * The extension reads "before" state for update/delete/upsert by querying
 * the row first (single-row lookups by `where`). For batched operations or
 * upserts that touch many fields, the read uses the same `where` the caller
 * provided. If `where` doesn't uniquely identify a row, before-state is left
 * empty and the audit log records action only.
 */
import { rawPrisma } from './prisma-base';
import { AUDIT_SKIPPED_MODELS, logAction } from '../services/audit';

type AnyDelegate = {
  findUnique: (args: { where: unknown }) => Promise<unknown>;
};

function camel(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

async function readBefore(model: string, where: unknown): Promise<unknown | null> {
  if (!where || typeof where !== 'object') return null;
  const delegate = (rawPrisma as unknown as Record<string, AnyDelegate>)[camel(model)];
  if (!delegate?.findUnique) return null;
  try {
    return await delegate.findUnique({ where });
  } catch {
    return null;
  }
}

function extractId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const id = (value as { id?: unknown }).id;
  return typeof id === 'string' ? id : null;
}

export const prisma = rawPrisma.$extends({
  name: 'audit',
  query: {
    $allModels: {
      async create({ model, args, query }) {
        const result = await query(args);
        if (!AUDIT_SKIPPED_MODELS.has(model)) {
          await logAction({
            entityType: model,
            entityId: extractId(result),
            action: 'create',
            afterData: result,
          });
        }
        return result;
      },
      async update({ model, args, query }) {
        const before = AUDIT_SKIPPED_MODELS.has(model)
          ? null
          : await readBefore(model, (args as { where?: unknown }).where);
        const result = await query(args);
        if (!AUDIT_SKIPPED_MODELS.has(model)) {
          await logAction({
            entityType: model,
            entityId: extractId(result) ?? extractId(before),
            action: 'update',
            beforeData: before,
            afterData: result,
          });
        }
        return result;
      },
      async upsert({ model, args, query }) {
        const before = AUDIT_SKIPPED_MODELS.has(model)
          ? null
          : await readBefore(model, (args as { where?: unknown }).where);
        const result = await query(args);
        if (!AUDIT_SKIPPED_MODELS.has(model)) {
          await logAction({
            entityType: model,
            entityId: extractId(result),
            action: before ? 'update' : 'create',
            beforeData: before,
            afterData: result,
          });
        }
        return result;
      },
      async delete({ model, args, query }) {
        const before = AUDIT_SKIPPED_MODELS.has(model)
          ? null
          : await readBefore(model, (args as { where?: unknown }).where);
        const result = await query(args);
        if (!AUDIT_SKIPPED_MODELS.has(model)) {
          await logAction({
            entityType: model,
            entityId: extractId(before) ?? extractId(result),
            action: 'delete',
            beforeData: before,
          });
        }
        return result;
      },
    },
  },
});
