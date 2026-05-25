import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  addCustomSpec,
  addOrderCharge,
  addOrderLine,
  assignShipmentLines,
  cancelOrder,
  confirmOrder,
  createOrder,
  createShipment,
  deleteOrderLine,
  getOrder,
  listOrders,
  softDeleteOrder,
  transitionOrderStatus,
  updateOrder,
  updateOrderLine,
} from '../services/orders';
import {
  addCustomMilestone,
  generatePaymentSchedule,
  getPaymentHistory,
  getPaymentSchedule,
  recordPayment,
  updatePaymentMilestone,
} from '../services/payment-terms';
import {
  cancelDocument,
  generatePaymentReceipt,
  generateProforma,
  generateSalesOrder,
  generateTaxInvoice,
  regenerateDocument,
} from '../services/order-documents';
import {
  getOrderImportTemplate,
  getOrderLinesImportTemplate,
  importOrders,
} from '../services/order-import';

const router = Router();
const VIEW   = requirePermission('ORDER', 'order', 'view');
const CREATE = requirePermission('ORDER', 'order', 'create');
const EDIT   = requirePermission('ORDER', 'order', 'edit');
const DELETE = requirePermission('ORDER', 'order', 'delete');

const idParam = z.object({ id: z.string().uuid() });
const lineIdParam = z.object({ id: z.string().uuid(), line_id: z.string().uuid() });
const shipmentIdParam = z.object({ id: z.string().uuid(), shipment_id: z.string().uuid() });

const listQ = z.object({
  status: z.string().optional(),
  customer: z.string().uuid().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  source: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const createBody = z.object({
  customerId: z.string().uuid(),
  orderDate: z.string().optional(),
  orderType: z.enum(['regular', 'sample', 'replacement']).optional(),
  source: z.enum(['manual', 'csv_import', 'portal', 'quote_conversion']).optional(),
  billingAddressId: z.string().uuid().optional(),
  defaultShippingAddressId: z.string().uuid().optional(),
  expectedDeliveryDate: z.string().optional(),
  promisedDeliveryDate: z.string().optional(),
  paymentTermsTemplateId: z.string().uuid().optional(),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
});

const updateBody = z.object({
  orderDate: z.string().optional(),
  orderType: z.enum(['regular', 'sample', 'replacement']).optional(),
  billingAddressId: z.string().uuid().nullable().optional(),
  defaultShippingAddressId: z.string().uuid().nullable().optional(),
  expectedDeliveryDate: z.string().nullable().optional(),
  promisedDeliveryDate: z.string().nullable().optional(),
  paymentTermsTemplateId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
});

const lineBody = z.object({
  lineType: z.enum(['catalog_product', 'custom_item']),
  productId: z.string().uuid().optional(),
  productSizeVariantId: z.string().uuid().optional(),
  description: z.string().optional(),
  quantity: z.number().positive(),
  uom: z.string().optional(),
  unitPrice: z.number().nonnegative().optional(),
  discountType: z.enum(['none', 'percent', 'amount']).optional(),
  discountValue: z.number().nonnegative().optional(),
  hsnCode: z.string().optional(),
  taxRatePercent: z.number().min(0).max(100).optional(),
  customDimensions: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().optional(),
});

const updateLineBody = z.object({
  quantity: z.number().positive().optional(),
  unitPrice: z.number().nonnegative().optional(),
  discountType: z.enum(['none', 'percent', 'amount']).optional(),
  discountValue: z.number().nonnegative().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
});

const customSpecBody = z.object({
  specKey: z.string().min(1),
  specValue: z.string().min(1),
  specType: z.enum(['dimension', 'finish', 'material', 'other']).optional(),
  notes: z.string().optional(),
});

const shipmentBody = z.object({
  shippingAddressId: z.string().uuid().optional(),
  expectedDispatchDate: z.string().optional(),
  notes: z.string().optional(),
});

const assignBody = z.object({
  assignments: z.array(z.object({
    orderLineId: z.string().uuid(),
    quantity: z.number().positive(),
  })),
});

const chargeBody = z.object({
  chargeType: z.enum(['transport', 'installation', 'packaging', 'other']),
  description: z.string().optional(),
  amount: z.number().positive(),
  isTaxable: z.boolean().optional(),
  hsnCode: z.string().optional(),
  taxRatePercent: z.number().min(0).max(100).optional(),
});

// -- CSV Import (before /:id routes to avoid param conflicts) -----------------

const importBody = z.object({
  headers: z.array(z.object({
    order_ref: z.string(),
    customer_code: z.string(),
    order_date: z.string().optional(),
    order_type: z.string().optional(),
    payment_terms_code: z.string().optional(),
    notes: z.string().optional(),
  })),
  lines: z.array(z.object({
    order_ref: z.string(),
    product_code: z.string().optional(),
    description: z.string().optional(),
    quantity: z.string(),
    unit_price: z.string().optional(),
    discount_percent: z.string().optional(),
    hsn_code: z.string().optional(),
    tax_rate_percent: z.string().optional(),
  })),
});

router.post('/import', requireInternal, CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, importBody);
    sendSuccess(res, await importOrders(body.headers, body.lines, req.user!.id));
  } catch (err) { next(err); }
});

router.get('/import/template', requireInternal, VIEW, async (_req, res, next) => {
  try {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="order_import_template.csv"');
    res.send(getOrderImportTemplate());
  } catch (err) { next(err); }
});

router.get('/import/lines-template', requireInternal, VIEW, async (_req, res, next) => {
  try {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="order_lines_import_template.csv"');
    res.send(getOrderLinesImportTemplate());
  } catch (err) { next(err); }
});

// -- Order CRUD ---------------------------------------------------------------

router.get('/', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, listQ);
    sendSuccess(res, await listOrders({
      status: q.status,
      customer: q.customer,
      dateFrom: q.date_from,
      dateTo: q.date_to,
      source: q.source,
      page: q.page,
      limit: q.limit,
    }));
  } catch (err) { next(err); }
});

router.post('/', requireInternal, CREATE, async (req, res, next) => {
  try {
    sendSuccess(res, await createOrder(parseBody(req, createBody), req.user!.id), { status: 201 });
  } catch (err) { next(err); }
});

router.get('/:id', requireInternal, VIEW, async (req, res, next) => {
  try {
    sendSuccess(res, await getOrder(parseParams(req, idParam).id));
  } catch (err) { next(err); }
});

router.put('/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    sendSuccess(res, await updateOrder(parseParams(req, idParam).id, parseBody(req, updateBody)));
  } catch (err) { next(err); }
});

router.delete('/:id', requireInternal, DELETE, async (req, res, next) => {
  try {
    await softDeleteOrder(parseParams(req, idParam).id, req.user!.id);
    sendSuccess(res, { ok: true });
  } catch (err) { next(err); }
});

// -- Order Lines --------------------------------------------------------------

router.post('/:id/lines', requireInternal, EDIT, async (req, res, next) => {
  try {
    sendSuccess(res, await addOrderLine(parseParams(req, idParam).id, parseBody(req, lineBody)), { status: 201 });
  } catch (err) { next(err); }
});

router.put('/:id/lines/:line_id', requireInternal, EDIT, async (req, res, next) => {
  try {
    const p = parseParams(req, lineIdParam);
    sendSuccess(res, await updateOrderLine(p.id, p.line_id, parseBody(req, updateLineBody)));
  } catch (err) { next(err); }
});

router.delete('/:id/lines/:line_id', requireInternal, EDIT, async (req, res, next) => {
  try {
    const p = parseParams(req, lineIdParam);
    await deleteOrderLine(p.id, p.line_id);
    sendSuccess(res, { ok: true });
  } catch (err) { next(err); }
});

router.post('/:id/lines/:line_id/custom-specs', requireInternal, EDIT, async (req, res, next) => {
  try {
    const p = parseParams(req, lineIdParam);
    sendSuccess(res, await addCustomSpec(p.id, p.line_id, parseBody(req, customSpecBody)), { status: 201 });
  } catch (err) { next(err); }
});

// -- Shipments ----------------------------------------------------------------

router.post('/:id/shipments', requireInternal, EDIT, async (req, res, next) => {
  try {
    sendSuccess(res, await createShipment(parseParams(req, idParam).id, parseBody(req, shipmentBody)), { status: 201 });
  } catch (err) { next(err); }
});

router.post('/:id/shipments/:shipment_id/assign-lines', requireInternal, EDIT, async (req, res, next) => {
  try {
    const p = parseParams(req, shipmentIdParam);
    sendSuccess(res, await assignShipmentLines(p.id, p.shipment_id, parseBody(req, assignBody)));
  } catch (err) { next(err); }
});

// -- Charges ------------------------------------------------------------------

router.post('/:id/charges', requireInternal, EDIT, async (req, res, next) => {
  try {
    sendSuccess(res, await addOrderCharge(parseParams(req, idParam).id, parseBody(req, chargeBody)), { status: 201 });
  } catch (err) { next(err); }
});

// -- Status Workflow ----------------------------------------------------------

const statusBody = z.object({
  toStatus: z.string().min(1),
  notes: z.string().optional(),
});

const cancelBody = z.object({
  cancellationReason: z.string().min(1),
});

router.post('/:id/confirm', requireInternal, EDIT, async (req, res, next) => {
  try {
    sendSuccess(res, await confirmOrder(parseParams(req, idParam).id, req.user!.id));
  } catch (err) { next(err); }
});

router.post('/:id/status', requireInternal, EDIT, async (req, res, next) => {
  try {
    sendSuccess(res, await transitionOrderStatus(parseParams(req, idParam).id, parseBody(req, statusBody), req.user!.id));
  } catch (err) { next(err); }
});

router.post('/:id/cancel', requireInternal, EDIT, async (req, res, next) => {
  try {
    sendSuccess(res, await cancelOrder(parseParams(req, idParam).id, parseBody(req, cancelBody), req.user!.id));
  } catch (err) { next(err); }
});

// -- Payment Schedule ---------------------------------------------------------

const milestoneIdParam = z.object({ id: z.string().uuid(), milestone_id: z.string().uuid() });

const updateMilestoneBody = z.object({
  milestoneName: z.string().min(1).optional(),
  percentage: z.number().min(0).max(100).optional(),
  amount: z.number().nonnegative().optional(),
  triggerEvent: z.enum(['on_order', 'before_dispatch', 'on_delivery', 'after_installation', 'fixed_days']).optional(),
  triggerDays: z.number().int().positive().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const addMilestoneBody = z.object({
  milestoneName: z.string().min(1),
  percentage: z.number().min(0).max(100),
  amount: z.number().nonnegative(),
  triggerEvent: z.enum(['on_order', 'before_dispatch', 'on_delivery', 'after_installation', 'fixed_days']),
  triggerDays: z.number().int().positive().optional(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
});

const paymentBody = z.object({
  milestoneId: z.string().uuid(),
  amount: z.number().positive(),
  paymentMode: z.enum(['online', 'bank_transfer', 'cheque', 'cash']),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

router.post('/:id/payment-schedule/generate', requireInternal, EDIT, async (req, res, next) => {
  try {
    sendSuccess(res, await generatePaymentSchedule(parseParams(req, idParam).id), { status: 201 });
  } catch (err) { next(err); }
});

router.get('/:id/payment-schedule', requireInternal, VIEW, async (req, res, next) => {
  try {
    sendSuccess(res, await getPaymentSchedule(parseParams(req, idParam).id));
  } catch (err) { next(err); }
});

router.put('/:id/payment-schedule/:milestone_id', requireInternal, EDIT, async (req, res, next) => {
  try {
    const p = parseParams(req, milestoneIdParam);
    sendSuccess(res, await updatePaymentMilestone(p.id, p.milestone_id, parseBody(req, updateMilestoneBody)));
  } catch (err) { next(err); }
});

router.post('/:id/payment-schedule/milestone', requireInternal, EDIT, async (req, res, next) => {
  try {
    sendSuccess(res, await addCustomMilestone(parseParams(req, idParam).id, parseBody(req, addMilestoneBody)), { status: 201 });
  } catch (err) { next(err); }
});

router.post('/:id/payments', requireInternal, EDIT, async (req, res, next) => {
  try {
    sendSuccess(res, await recordPayment(parseParams(req, idParam).id, parseBody(req, paymentBody)), { status: 201 });
  } catch (err) { next(err); }
});

router.get('/:id/payments', requireInternal, VIEW, async (req, res, next) => {
  try {
    sendSuccess(res, await getPaymentHistory(parseParams(req, idParam).id));
  } catch (err) { next(err); }
});

// -- Documents ----------------------------------------------------------------

const docTypeParam = z.object({ id: z.string().uuid(), doc_type: z.enum(['proforma', 'sales_order', 'tax_invoice']) });
const docIdParam = z.object({ id: z.string().uuid(), doc_id: z.string().uuid() });
const receiptParam = z.object({ id: z.string().uuid(), milestone_id: z.string().uuid() });

router.get('/:id/documents/proforma', requireInternal, VIEW, async (req, res, next) => {
  try {
    sendSuccess(res, await generateProforma(parseParams(req, idParam).id, req.user!.id));
  } catch (err) { next(err); }
});

router.get('/:id/documents/sales-order', requireInternal, VIEW, async (req, res, next) => {
  try {
    sendSuccess(res, await generateSalesOrder(parseParams(req, idParam).id, req.user!.id));
  } catch (err) { next(err); }
});

router.get('/:id/documents/tax-invoice', requireInternal, VIEW, async (req, res, next) => {
  try {
    sendSuccess(res, await generateTaxInvoice(parseParams(req, idParam).id, req.user!.id));
  } catch (err) { next(err); }
});

router.get('/:id/payments/:milestone_id/receipt', requireInternal, VIEW, async (req, res, next) => {
  try {
    const p = parseParams(req, receiptParam);
    sendSuccess(res, await generatePaymentReceipt(p.id, p.milestone_id, req.user!.id));
  } catch (err) { next(err); }
});

router.post('/:id/documents/:doc_type/regenerate', requireInternal, EDIT, async (req, res, next) => {
  try {
    const p = parseParams(req, docTypeParam);
    sendSuccess(res, await regenerateDocument(p.id, p.doc_type, req.user!.id));
  } catch (err) { next(err); }
});

router.post('/:id/documents/:doc_id/cancel', requireInternal, EDIT, async (req, res, next) => {
  try {
    const p = parseParams(req, docIdParam);
    const body = parseBody(req, z.object({ reason: z.string().min(1) }));
    sendSuccess(res, await cancelDocument(p.doc_id, body.reason));
  } catch (err) { next(err); }
});

export default router;
