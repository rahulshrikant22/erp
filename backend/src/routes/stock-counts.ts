import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  createCountSession, listCountSessions, getCountSession,
  generateCountLines, recordCount, markForRecount, recordRecount,
  finalizeCountSession, cancelCountSession,
  createAdjustment, listAdjustments, getAdjustment,
  approveAdjustment, rejectAdjustment,
} from '../services/stock-counts';

const router = Router();

const VIEW = requirePermission('INVENTORY', 'stock_count', 'view');
const CREATE = requirePermission('INVENTORY', 'stock_count', 'create');
const EDIT = requirePermission('INVENTORY', 'stock_count', 'edit');

const idParam = z.object({ id: z.string().uuid() });
const lineIdParam = z.object({ id: z.string().uuid(), lineId: z.string().uuid() });

// ─── Count Sessions ─────────────────────────────────────────────────────────────

router.post('/', requireInternal, CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, z.object({
      count_type: z.enum(['cycle', 'full', 'spot']),
      location_id: z.string().uuid(),
      planned_start_date: z.string().nullable().optional(),
      planned_end_date: z.string().nullable().optional(),
    }));
    const session = await createCountSession({
      countType: body.count_type,
      locationId: body.location_id,
      plannedStartDate: body.planned_start_date,
      plannedEndDate: body.planned_end_date,
    });
    sendSuccess(res, { session }, { status: 201 });
  } catch (err) { next(err); }
});

router.get('/', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, z.object({
      location_id: z.string().uuid().optional(),
      status: z.string().optional(),
      count_type: z.string().optional(),
      page: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().positive().max(200).optional(),
    }));
    const result = await listCountSessions({
      locationId: q.location_id,
      status: q.status,
      countType: q.count_type,
      page: q.page,
      limit: q.limit,
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.get('/:id', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const session = await getCountSession(id);
    sendSuccess(res, { session });
  } catch (err) { next(err); }
});

router.post('/:id/generate-lines', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const session = await generateCountLines(id);
    sendSuccess(res, { session });
  } catch (err) { next(err); }
});

router.post('/:id/lines/:lineId/count', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { lineId } = parseParams(req, lineIdParam);
    const body = parseBody(req, z.object({
      counted_quantity: z.number().nonnegative(),
      variance_reason: z.string().nullable().optional(),
    }));
    const line = await recordCount(lineId, {
      countedQuantity: body.counted_quantity,
      countedBy: req.user!.id,
      varianceReason: body.variance_reason,
    });
    sendSuccess(res, { line });
  } catch (err) { next(err); }
});

router.post('/:id/lines/:lineId/recount-required', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { lineId } = parseParams(req, lineIdParam);
    const line = await markForRecount(lineId);
    sendSuccess(res, { line });
  } catch (err) { next(err); }
});

router.post('/:id/lines/:lineId/recount', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { lineId } = parseParams(req, lineIdParam);
    const body = parseBody(req, z.object({
      recounted_quantity: z.number().nonnegative(),
    }));
    const line = await recordRecount(lineId, body.recounted_quantity, req.user!.id);
    sendSuccess(res, { line });
  } catch (err) { next(err); }
});

router.post('/:id/finalize', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const session = await finalizeCountSession(id, req.user?.id);
    sendSuccess(res, { session });
  } catch (err) { next(err); }
});

router.post('/:id/cancel', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    await cancelCountSession(id);
    sendSuccess(res, { cancelled: true });
  } catch (err) { next(err); }
});

export default router;

// ─── Stock Adjustments Router ───────────────────────────────────────────────────

export const adjustmentsRouter = Router();

const ADJ_VIEW = requirePermission('INVENTORY', 'stock_adjustment', 'view');
const ADJ_CREATE = requirePermission('INVENTORY', 'stock_adjustment', 'create');
const ADJ_APPROVE = requirePermission('INVENTORY', 'stock_adjustment', 'approve');

adjustmentsRouter.post('/', requireInternal, ADJ_CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, z.object({
      adjustment_type: z.enum(['count_variance', 'damage', 'theft', 'system_correction', 'write_off']),
      reason: z.string().nullable().optional(),
      lines: z.array(z.object({
        material_id: z.string().uuid(),
        batch_id: z.string().uuid().nullable().optional(),
        location_id: z.string().uuid(),
        bin_id: z.string().uuid().nullable().optional(),
        direction: z.enum(['plus', 'minus']),
        quantity: z.number().positive(),
        unit_cost_used: z.number().nonnegative().nullable().optional(),
      })).min(1),
    }));
    const adjustment = await createAdjustment({
      adjustmentType: body.adjustment_type,
      reason: body.reason,
      requestedBy: req.user?.id,
      lines: body.lines.map((l) => ({
        materialId: l.material_id,
        batchId: l.batch_id,
        locationId: l.location_id,
        binId: l.bin_id,
        direction: l.direction,
        quantity: l.quantity,
        unitCostUsed: l.unit_cost_used,
      })),
    });
    sendSuccess(res, { adjustment }, { status: 201 });
  } catch (err) { next(err); }
});

adjustmentsRouter.get('/', requireInternal, ADJ_VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, z.object({
      adjustment_type: z.string().optional(),
      approval_status: z.string().optional(),
      page: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().positive().max(200).optional(),
    }));
    const result = await listAdjustments({
      adjustmentType: q.adjustment_type,
      approvalStatus: q.approval_status,
      page: q.page,
      limit: q.limit,
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

adjustmentsRouter.get('/:id', requireInternal, ADJ_VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const adjustment = await getAdjustment(id);
    sendSuccess(res, { adjustment });
  } catch (err) { next(err); }
});

adjustmentsRouter.post('/:id/approve', requireInternal, ADJ_APPROVE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const adjustment = await approveAdjustment(id, req.user!.id);
    sendSuccess(res, { adjustment });
  } catch (err) { next(err); }
});

adjustmentsRouter.post('/:id/reject', requireInternal, ADJ_APPROVE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, z.object({ reason: z.string().optional() }));
    const adjustment = await rejectAdjustment(id, req.user!.id, body.reason);
    sendSuccess(res, { adjustment });
  } catch (err) { next(err); }
});
