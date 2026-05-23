/**
 * Workflow engine endpoints.
 *
 *   POST /api/workflows/instances
 *        body: { workflowCode, targetEntityId, context? }
 *        Starts a new instance and runs forward until pause/complete/cancel.
 *        (WORKFLOW:workflow:create)
 *
 *   GET  /api/workflows/instances?workflowCode=&targetEntity=&status=
 *        (WORKFLOW:workflow:view)
 *
 *   GET  /api/workflows/instances/:id              (WORKFLOW:workflow:view)
 *
 *   POST /api/workflows/instances/:id/approve      (WORKFLOW:workflow:approve)
 *        body: { notes?, context? }
 *
 *   POST /api/workflows/instances/:id/reject       (WORKFLOW:workflow:approve)
 *        body: { reason }
 *
 *   POST /api/workflows/instances/:id/cancel       (WORKFLOW:workflow:edit)
 *        body: { reason }
 *
 *   POST /api/workflows/process-timeouts           (WORKFLOW:workflow:edit)
 *        Manual trigger for the timeout/escalation scan. Cron lands in P0-19+.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  approveStep,
  cancelInstance,
  createInstance,
  getInstanceStatus,
  listInstances,
  processTimeouts,
  rejectStep,
} from '../services/workflow';

const router = Router();

const idParam = z.object({ id: z.string().uuid() });

const startBody = z.object({
  workflowCode: z.string().min(1),
  targetEntityId: z.string().min(1),
  context: z.record(z.string(), z.unknown()).optional(),
});

const listFilters = z.object({
  workflowCode: z.string().optional(),
  targetEntity: z.string().optional(),
  status: z.enum(['active', 'completed', 'cancelled']).optional(),
});

const approveBody = z
  .object({
    notes: z.string().max(2000).optional(),
    context: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const rejectBody = z.object({ reason: z.string().min(1).max(2000) });
const cancelBody = z.object({ reason: z.string().min(1).max(2000) });

const VIEW    = requirePermission('WORKFLOW', 'workflow', 'view');
const CREATE  = requirePermission('WORKFLOW', 'workflow', 'create');
const EDIT    = requirePermission('WORKFLOW', 'workflow', 'edit');
const APPROVE = requirePermission('WORKFLOW', 'workflow', 'approve');

router.post('/instances', requireInternal, CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, startBody);
    const r = await createInstance({
      workflowCode: body.workflowCode,
      targetEntityId: body.targetEntityId,
      initiatedById: req.user!.id,
      context: body.context,
    });
    sendSuccess(res, r);
  } catch (err) {
    next(err);
  }
});

router.get('/instances', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, listFilters);
    const rows = await listInstances(q);
    sendSuccess(res, {
      instances: rows.map((r) => ({
        ...r,
        initiatedAt: r.initiatedAt.toISOString(),
        completedAt: r.completedAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/process-timeouts', requireInternal, EDIT, async (_req, res, next) => {
  try {
    sendSuccess(res, await processTimeouts());
  } catch (err) {
    next(err);
  }
});

router.get('/instances/:id', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const status = await getInstanceStatus(id);
    sendSuccess(res, {
      ...status,
      initiatedAt: status.initiatedAt.toISOString(),
      completedAt: status.completedAt?.toISOString() ?? null,
      history: status.history.map((h) => ({
        ...h,
        actionAt: h.actionAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/instances/:id/approve', requireInternal, APPROVE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, approveBody);
    const r = await approveStep({
      instanceId: id,
      actorUserId: req.user!.id,
      notes: body.notes,
      context: body.context,
    });
    sendSuccess(res, r);
  } catch (err) {
    next(err);
  }
});

router.post('/instances/:id/reject', requireInternal, APPROVE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, rejectBody);
    const r = await rejectStep({
      instanceId: id,
      actorUserId: req.user!.id,
      reason: body.reason,
    });
    sendSuccess(res, r);
  } catch (err) {
    next(err);
  }
});

router.post('/instances/:id/cancel', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, cancelBody);
    await cancelInstance({
      instanceId: id,
      actorUserId: req.user!.id,
      reason: body.reason,
    });
    sendSuccess(res, { ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
