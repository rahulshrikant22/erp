import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  createPo, listPos, getPo, updatePo,
  addPoLine, removePoLine,
  submitPo, approvePo, rejectPo,
  sendPoToVendor, acknowledgePoByVendor, cancelPo,
} from '../services/purchase-orders';

const router = Router();

const VIEW = requirePermission('PROCUREMENT', 'purchase_order', 'view');
const CREATE = requirePermission('PROCUREMENT', 'purchase_order', 'create');
const EDIT = requirePermission('PROCUREMENT', 'purchase_order', 'edit');
const APPROVE = requirePermission('PROCUREMENT', 'purchase_order', 'approve');

const idParam = z.object({ id: z.string().uuid() });
const lineParam = z.object({ id: z.string().uuid(), lineId: z.string().uuid() });

const poLineBody = z.object({
  material_id: z.string().uuid(),
  pr_line_id: z.string().uuid().nullable().optional(),
  quantity_ordered: z.number().positive(),
  uom: z.string().optional(),
  unit_price: z.number().nonnegative(),
  hsn_code: z.string().nullable().optional(),
  tax_rate: z.number().nonnegative().nullable().optional(),
  expected_delivery_date: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const createBody = z.object({
  vendor_id: z.string().uuid(),
  vendor_contact_id: z.string().uuid().nullable().optional(),
  source_pr_id: z.string().uuid().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  delivery_location_id: z.string().uuid().nullable().optional(),
  expected_delivery_date: z.string().nullable().optional(),
  currency_code: z.string().optional(),
  exchange_rate_at_po: z.number().positive().nullable().optional(),
  discount: z.number().nonnegative().optional(),
  other_charges: z.number().nonnegative().optional(),
  payment_terms_template_id: z.string().uuid().nullable().optional(),
  payment_terms_notes: z.string().nullable().optional(),
  delivery_terms: z.string().nullable().optional(),
  shipping_mode: z.enum(['road', 'rail', 'sea', 'air']).nullable().optional(),
  lines: z.array(poLineBody).min(1),
});

const listQuery = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  vendor_id: z.string().uuid().optional(),
  po_type: z.enum(['domestic', 'import']).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

// ─── CRUD ───────────────────────────────────────────────────────────────────────

router.post('/', requireInternal, CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, createBody);
    const po = await createPo({
      vendorId: body.vendor_id,
      vendorContactId: body.vendor_contact_id,
      sourcePrId: body.source_pr_id,
      branchId: body.branch_id,
      deliveryLocationId: body.delivery_location_id,
      expectedDeliveryDate: body.expected_delivery_date,
      currencyCode: body.currency_code,
      exchangeRateAtPo: body.exchange_rate_at_po,
      discount: body.discount,
      otherCharges: body.other_charges,
      paymentTermsTemplateId: body.payment_terms_template_id,
      paymentTermsNotes: body.payment_terms_notes,
      deliveryTerms: body.delivery_terms,
      shippingMode: body.shipping_mode,
      createdById: req.user?.id,
      lines: body.lines.map((l) => ({
        materialId: l.material_id,
        prLineId: l.pr_line_id,
        quantityOrdered: l.quantity_ordered,
        uom: l.uom,
        unitPrice: l.unit_price,
        hsnCode: l.hsn_code,
        taxRate: l.tax_rate,
        expectedDeliveryDate: l.expected_delivery_date,
        notes: l.notes,
      })),
    });
    sendSuccess(res, { po }, { status: 201 });
  } catch (err) { next(err); }
});

router.get('/', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, listQuery);
    const result = await listPos({
      search: q.search,
      status: q.status,
      vendorId: q.vendor_id,
      poType: q.po_type,
      page: q.page,
      limit: q.limit,
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.get('/:id', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const po = await getPo(id);
    sendSuccess(res, { po });
  } catch (err) { next(err); }
});

router.put('/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, z.object({
      vendor_contact_id: z.string().uuid().nullable().optional(),
      expected_delivery_date: z.string().nullable().optional(),
      discount: z.number().nonnegative().optional(),
      other_charges: z.number().nonnegative().optional(),
      payment_terms_template_id: z.string().uuid().nullable().optional(),
      payment_terms_notes: z.string().nullable().optional(),
      delivery_terms: z.string().nullable().optional(),
      shipping_mode: z.enum(['road', 'rail', 'sea', 'air']).nullable().optional(),
    }));
    const po = await updatePo(id, {
      vendorContactId: body.vendor_contact_id,
      expectedDeliveryDate: body.expected_delivery_date,
      discount: body.discount,
      otherCharges: body.other_charges,
      paymentTermsTemplateId: body.payment_terms_template_id,
      paymentTermsNotes: body.payment_terms_notes,
      deliveryTerms: body.delivery_terms,
      shippingMode: body.shipping_mode,
      updatedById: req.user?.id,
    });
    sendSuccess(res, { po });
  } catch (err) { next(err); }
});

// ─── Lines ──────────────────────────────────────────────────────────────────────

router.post('/:id/lines', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, poLineBody);
    const line = await addPoLine(id, {
      materialId: body.material_id,
      prLineId: body.pr_line_id,
      quantityOrdered: body.quantity_ordered,
      uom: body.uom,
      unitPrice: body.unit_price,
      hsnCode: body.hsn_code,
      taxRate: body.tax_rate,
      expectedDeliveryDate: body.expected_delivery_date,
      notes: body.notes,
    });
    sendSuccess(res, { line }, { status: 201 });
  } catch (err) { next(err); }
});

router.delete('/:id/lines/:lineId', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id, lineId } = parseParams(req, lineParam);
    await removePoLine(id, lineId);
    sendSuccess(res, { deleted: true });
  } catch (err) { next(err); }
});

// ─── Workflow ───────────────────────────────────────────────────────────────────

router.post('/:id/submit', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const po = await submitPo(id);
    sendSuccess(res, { po });
  } catch (err) { next(err); }
});

router.post('/:id/approve', requireInternal, APPROVE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const po = await approvePo(id, req.user!.id);
    sendSuccess(res, { po });
  } catch (err) { next(err); }
});

router.post('/:id/reject', requireInternal, APPROVE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, z.object({ notes: z.string().optional() }));
    const po = await rejectPo(id, req.user!.id, body.notes);
    sendSuccess(res, { po });
  } catch (err) { next(err); }
});

router.post('/:id/send-to-vendor', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, z.object({
      comm_type: z.enum(['email', 'whatsapp', 'sms']),
      recipient: z.string().min(1),
    }));
    const po = await sendPoToVendor(id, body.comm_type, body.recipient, req.user?.id);
    sendSuccess(res, { po });
  } catch (err) { next(err); }
});

router.post('/:id/acknowledge', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, z.object({ method: z.string().optional() }));
    const po = await acknowledgePoByVendor(id, body.method);
    sendSuccess(res, { po });
  } catch (err) { next(err); }
});

router.post('/:id/cancel', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, z.object({ reason: z.string().min(1) }));
    const po = await cancelPo(id, body.reason, req.user?.id);
    sendSuccess(res, { po });
  } catch (err) { next(err); }
});

export default router;
