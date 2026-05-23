/**
 * Audit query endpoints (read-only). All gated by AUDIT:audit:view.
 *
 *   GET /api/audit/logs
 *       ?entityType=&entityId=&actor=&action=
 *       &dateFrom=&dateTo=&search=&page=1&limit=50
 *
 *   GET /api/audit/logs/:id                 (single row, full diff payload)
 *
 *   GET /api/audit/entity/:entityType/:entityId/history
 *       (timeline view, oldest first)
 *
 *   POST /api/audit/archive                 (AUDIT:audit:edit if granted —
 *       super_admin only by default since AUDIT only has :view in seed.
 *       Returns 403 unless caller has it; not currently surfaced in the UI.)
 */
import { Router } from 'express';
import { z } from 'zod';
import { rawPrisma } from '../lib/prisma-base';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseParams, parseQuery, parseBody } from '../utils/validate';
import { archiveOldLogs } from '../services/audit';

const router = Router();

const idParam = z.object({ id: z.string().uuid() });
const entityParams = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
});

const listQuery = z.object({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  actor: z.string().uuid().optional(),
  action: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const VIEW = requirePermission('AUDIT', 'audit', 'view');

router.get('/logs', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, listQuery);
    const where: Record<string, unknown> = {};
    if (q.entityType) where.entityType = q.entityType;
    if (q.entityId) where.entityId = q.entityId;
    if (q.actor) where.actorUserId = q.actor;
    if (q.action) where.action = q.action;
    if (q.dateFrom || q.dateTo) {
      where.actionAt = {
        ...(q.dateFrom ? { gte: new Date(q.dateFrom) } : {}),
        ...(q.dateTo ? { lte: new Date(q.dateTo) } : {}),
      };
    }
    if (q.search) {
      where.changesSummary = { contains: q.search, mode: 'insensitive' };
    }

    const [total, rows] = await Promise.all([
      rawPrisma.auditLog.count({ where }),
      rawPrisma.auditLog.findMany({
        where,
        orderBy: { actionAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        select: {
          id: true,
          entityType: true,
          entityId: true,
          action: true,
          actorUserId: true,
          actorIp: true,
          changesSummary: true,
          actionAt: true,
          requestId: true,
        },
      }),
    ]);

    sendSuccess(res, {
      total,
      page: q.page,
      limit: q.limit,
      logs: rows.map((r) => ({ ...r, actionAt: r.actionAt.toISOString() })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/logs/:id', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const row = await rawPrisma.auditLog.findUnique({ where: { id } });
    if (!row) {
      return sendSuccess(res, { log: null }, { status: 404 });
    }
    sendSuccess(res, {
      log: { ...row, actionAt: row.actionAt.toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

router.get(
  '/entity/:entityType/:entityId/history',
  requireInternal,
  VIEW,
  async (req, res, next) => {
    try {
      const { entityType, entityId } = parseParams(req, entityParams);
      const rows = await rawPrisma.auditLog.findMany({
        where: { entityType, entityId },
        orderBy: { actionAt: 'asc' },
      });
      sendSuccess(res, {
        entityType,
        entityId,
        history: rows.map((r) => ({ ...r, actionAt: r.actionAt.toISOString() })),
      });
    } catch (err) {
      next(err);
    }
  },
);

const archiveBody = z.object({ retentionDays: z.coerce.number().int().positive() });

router.post(
  '/archive',
  requireInternal,
  // We require :view here because AUDIT module's only seeded action is :view.
  // The route is intentionally rare/manual; in production, the cron uses
  // archiveOldLogs() directly without going through HTTP.
  VIEW,
  async (req, res, next) => {
    try {
      const body = parseBody(req, archiveBody);
      const out = await archiveOldLogs(body.retentionDays);
      sendSuccess(res, out);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
