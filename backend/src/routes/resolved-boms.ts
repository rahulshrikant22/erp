import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  resolveBom,
  getResolvedBom,
  listResolvedBoms,
  approveResolvedBom,
  lockResolvedBom,
} from '../services/bom-resolution';

const router = Router();

const VIEW = requirePermission('BOM', 'bom', 'view');
const CREATE = requirePermission('BOM', 'bom', 'create');
const APPROVE = requirePermission('BOM', 'bom', 'approve');

const idParam = z.object({ id: z.string().uuid() });

const resolveBody = z.object({
  order_id: z.string().uuid(),
  order_line_id: z.string().uuid(),
  bom_version_id: z.string().uuid(),
  selection_list_id: z.string().uuid().nullable().optional(),
});

const listQuery = z.object({
  order_id: z.string().uuid().optional(),
  order_line_id: z.string().uuid().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

router.post('/', requireInternal, CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, resolveBody);
    const resolved = await resolveBom({
      orderId: body.order_id,
      orderLineId: body.order_line_id,
      bomVersionId: body.bom_version_id,
      selectionListId: body.selection_list_id,
      resolvedBy: (req as any).user?.id,
    });
    sendSuccess(res, { resolvedBom: resolved }, { status: 201 });
  } catch (err) { next(err); }
});

router.get('/', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, listQuery);
    const result = await listResolvedBoms({
      orderId: q.order_id,
      orderLineId: q.order_line_id,
      status: q.status,
      page: q.page,
      limit: q.limit,
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.get('/:id', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const resolved = await getResolvedBom(id);
    sendSuccess(res, { resolvedBom: resolved });
  } catch (err) { next(err); }
});

router.post('/:id/approve', requireInternal, APPROVE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const resolved = await approveResolvedBom(id);
    sendSuccess(res, { resolvedBom: resolved });
  } catch (err) { next(err); }
});

router.post('/:id/lock', requireInternal, APPROVE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const resolved = await lockResolvedBom(id);
    sendSuccess(res, { resolvedBom: resolved });
  } catch (err) { next(err); }
});

export default router;
