import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  runCosting,
  getCostingRun,
  listCostingRuns,
  compareCostingRuns,
  listAssumptions,
  updateAssumption,
} from '../services/costing';

const router = Router();

const VIEW = requirePermission('COSTING', 'costing', 'view');
const CREATE = requirePermission('COSTING', 'costing', 'create');
const EDIT = requirePermission('COSTING', 'costing', 'edit');

const idParam = z.object({ id: z.string().uuid() });

const runBody = z.object({
  bom_version_id: z.string().uuid(),
  run_type: z.enum(['initial', 're_cost', 'what_if']).optional(),
  overhead_percent: z.number().nonnegative().optional(),
  margin_percent: z.number().nonnegative().optional(),
  tax_rate: z.number().nonnegative().optional(),
  quantity: z.number().positive().optional(),
  notes: z.string().nullable().optional(),
});

const listQuery = z.object({
  bom_version_id: z.string().uuid().optional(),
  run_type: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

const compareQuery = z.object({
  run1: z.string().uuid(),
  run2: z.string().uuid(),
});

const assumptionBody = z.object({
  value: z.string().min(1),
});

router.post('/runs', requireInternal, CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, runBody);
    const run = await runCosting({
      bomVersionId: body.bom_version_id,
      runType: body.run_type,
      overheadPercent: body.overhead_percent,
      marginPercent: body.margin_percent,
      taxRate: body.tax_rate,
      quantity: body.quantity,
      runBy: (req as any).user?.id,
      notes: body.notes ?? undefined,
    });
    sendSuccess(res, { run }, { status: 201 });
  } catch (err) { next(err); }
});

router.get('/runs', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, listQuery);
    const result = await listCostingRuns({
      bomVersionId: q.bom_version_id,
      runType: q.run_type,
      page: q.page,
      limit: q.limit,
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.get('/runs/:id', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const run = await getCostingRun(id);
    sendSuccess(res, { run });
  } catch (err) { next(err); }
});

router.get('/compare', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, compareQuery);
    const result = await compareCostingRuns(q.run1, q.run2);
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.get('/assumptions', requireInternal, VIEW, async (_req, res, next) => {
  try {
    const assumptions = await listAssumptions();
    sendSuccess(res, { assumptions });
  } catch (err) { next(err); }
});

router.put('/assumptions/:key', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { key } = req.params;
    const body = parseBody(req, assumptionBody);
    const assumption = await updateAssumption(key, body.value);
    sendSuccess(res, { assumption });
  } catch (err) { next(err); }
});

export default router;
