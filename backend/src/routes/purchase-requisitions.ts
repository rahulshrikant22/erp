import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  createPr, listPrs, getPr, updatePr,
  addPrLine, removePrLine,
  submitPr, approvePr, rejectPr,
  generatePrFromOrders, getConsolidationPreview, createPoFromPrLines,
} from '../services/purchase-requisitions';

const router = Router();

const VIEW = requirePermission('PROCUREMENT', 'purchase_requisition', 'view');
const CREATE = requirePermission('PROCUREMENT', 'purchase_requisition', 'create');
const EDIT = requirePermission('PROCUREMENT', 'purchase_requisition', 'edit');
const APPROVE = requirePermission('PROCUREMENT', 'purchase_requisition', 'approve');

const idParam = z.object({ id: z.string().uuid() });
const lineParam = z.object({ id: z.string().uuid(), lineId: z.string().uuid() });

// ─── Zod Schemas ────────────────────────────────────────────────────────────────

const prLineBody = z.object({
  material_id: z.string().uuid(),
  quantity_requested: z.number().positive(),
  uom: z.string().optional(),
  estimated_unit_price: z.number().nonnegative().nullable().optional(),
  suggested_vendor_id: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const createBody = z.object({
  pr_type: z.enum(['auto_from_bom', 'manual']).optional(),
  source_type: z.enum(['order_consolidated', 'single_order', 'manual', 'reorder_alert']).optional(),
  required_by_date: z.string().nullable().optional(),
  currency_code: z.string().optional(),
  notes: z.string().nullable().optional(),
  lines: z.array(prLineBody).min(1),
});

const listQuery = z.object({
  status: z.string().optional(),
  pr_type: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

// ─── CRUD ───────────────────────────────────────────────────────────────────────

router.post('/', requireInternal, CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, createBody);
    const pr = await createPr({
      prType: body.pr_type,
      sourceType: body.source_type,
      requiredByDate: body.required_by_date,
      currencyCode: body.currency_code,
      notes: body.notes,
      requestedBy: req.user?.id,
      lines: body.lines.map((l) => ({
        materialId: l.material_id,
        quantityRequested: l.quantity_requested,
        uom: l.uom,
        estimatedUnitPrice: l.estimated_unit_price,
        suggestedVendorId: l.suggested_vendor_id,
        notes: l.notes,
      })),
    });
    sendSuccess(res, { pr }, { status: 201 });
  } catch (err) { next(err); }
});

router.get('/', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, listQuery);
    const result = await listPrs({
      status: q.status,
      prType: q.pr_type,
      search: q.search,
      page: q.page,
      limit: q.limit,
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.get('/:id', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const pr = await getPr(id);
    sendSuccess(res, { pr });
  } catch (err) { next(err); }
});

router.put('/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, z.object({
      required_by_date: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    }));
    const pr = await updatePr(id, {
      requiredByDate: body.required_by_date,
      notes: body.notes,
    });
    sendSuccess(res, { pr });
  } catch (err) { next(err); }
});

// ─── Lines ──────────────────────────────────────────────────────────────────────

router.post('/:id/lines', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, prLineBody);
    const line = await addPrLine(id, {
      materialId: body.material_id,
      quantityRequested: body.quantity_requested,
      uom: body.uom,
      estimatedUnitPrice: body.estimated_unit_price,
      suggestedVendorId: body.suggested_vendor_id,
      notes: body.notes,
    });
    sendSuccess(res, { line }, { status: 201 });
  } catch (err) { next(err); }
});

router.delete('/:id/lines/:lineId', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id, lineId } = parseParams(req, lineParam);
    await removePrLine(id, lineId);
    sendSuccess(res, { deleted: true });
  } catch (err) { next(err); }
});

// ─── Workflow ───────────────────────────────────────────────────────────────────

router.post('/:id/submit', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const pr = await submitPr(id);
    sendSuccess(res, { pr });
  } catch (err) { next(err); }
});

router.post('/:id/approve', requireInternal, APPROVE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const pr = await approvePr(id, req.user!.id);
    sendSuccess(res, { pr });
  } catch (err) { next(err); }
});

router.post('/:id/reject', requireInternal, APPROVE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, z.object({ reason: z.string().min(1) }));
    const pr = await rejectPr(id, req.user!.id, body.reason);
    sendSuccess(res, { pr });
  } catch (err) { next(err); }
});

// ─── Auto-generation ────────────────────────────────────────────────────────────

router.post('/generate-from-orders', requireInternal, CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, z.object({
      order_ids: z.array(z.string().uuid()).min(1),
    }));
    const result = await generatePrFromOrders(body.order_ids, req.user?.id);
    sendSuccess(res, result, { status: 201 });
  } catch (err) { next(err); }
});

router.post('/consolidation-preview', requireInternal, VIEW, async (req, res, next) => {
  try {
    const body = parseBody(req, z.object({
      pr_ids: z.array(z.string().uuid()).min(1),
    }));
    const preview = await getConsolidationPreview(body.pr_ids);
    sendSuccess(res, { preview });
  } catch (err) { next(err); }
});

// ─── PR to PO ───────────────────────────────────────────────────────────────────

router.post('/:id/create-po', requireInternal, CREATE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, z.object({
      line_ids: z.array(z.string().uuid()).min(1),
      vendor_id: z.string().uuid(),
    }));
    const po = await createPoFromPrLines(id, body.line_ids, body.vendor_id, req.user?.id);
    sendSuccess(res, { po }, { status: 201 });
  } catch (err) { next(err); }
});

export default router;
