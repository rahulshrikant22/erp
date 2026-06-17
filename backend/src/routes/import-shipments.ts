import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  createShipment, listShipments, getShipment, updateShipment,
  transitionShipmentStatus,
  addPoToShipment, removePoFromShipment,
  createOrUpdateCustoms, allocateLandedCosts,
  getShipmentDashboard,
} from '../services/import-shipments';

const router = Router();

const VIEW = requirePermission('PROCUREMENT', 'import_shipment', 'view');
const CREATE = requirePermission('PROCUREMENT', 'import_shipment', 'create');
const EDIT = requirePermission('PROCUREMENT', 'import_shipment', 'edit');

const idParam = z.object({ id: z.string().uuid() });

const createBody = z.object({
  supplier_invoice_number: z.string().nullable().optional(),
  supplier_invoice_date: z.string().nullable().optional(),
  supplier_invoice_value: z.number().nonnegative().nullable().optional(),
  currency_code: z.string().optional(),
  exchange_rate: z.number().positive().nullable().optional(),
  container_number: z.string().nullable().optional(),
  container_size: z.enum(['20ft', '40ft']).nullable().optional(),
  seal_number: z.string().nullable().optional(),
  vessel_name: z.string().nullable().optional(),
  voyage_number: z.string().nullable().optional(),
  bill_of_lading_number: z.string().nullable().optional(),
  bill_of_lading_date: z.string().nullable().optional(),
  port_of_loading: z.string().nullable().optional(),
  port_of_discharge: z.string().nullable().optional(),
  eta: z.string().nullable().optional(),
  shipping_line: z.string().nullable().optional(),
  freight_forwarder: z.string().nullable().optional(),
  po_ids: z.array(z.string().uuid()).min(1),
});

const listQuery = z.object({
  status: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

router.get('/dashboard', requireInternal, VIEW, async (_req, res, next) => {
  try {
    const dashboard = await getShipmentDashboard();
    sendSuccess(res, { dashboard });
  } catch (err) { next(err); }
});

router.post('/', requireInternal, CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, createBody);
    const shipment = await createShipment({
      supplierInvoiceNumber: body.supplier_invoice_number,
      supplierInvoiceDate: body.supplier_invoice_date,
      supplierInvoiceValue: body.supplier_invoice_value,
      currencyCode: body.currency_code,
      exchangeRate: body.exchange_rate,
      containerNumber: body.container_number,
      containerSize: body.container_size,
      sealNumber: body.seal_number,
      vesselName: body.vessel_name,
      voyageNumber: body.voyage_number,
      billOfLadingNumber: body.bill_of_lading_number,
      billOfLadingDate: body.bill_of_lading_date,
      portOfLoading: body.port_of_loading,
      portOfDischarge: body.port_of_discharge,
      eta: body.eta,
      shippingLine: body.shipping_line,
      freightForwarder: body.freight_forwarder,
      poIds: body.po_ids,
      createdById: req.user?.id,
    });
    sendSuccess(res, { shipment }, { status: 201 });
  } catch (err) { next(err); }
});

router.get('/', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, listQuery);
    const result = await listShipments(q);
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.get('/:id', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const shipment = await getShipment(id);
    sendSuccess(res, { shipment });
  } catch (err) { next(err); }
});

router.put('/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, createBody.omit({ po_ids: true }).partial());
    const shipment = await updateShipment(id, {
      supplierInvoiceNumber: body.supplier_invoice_number,
      supplierInvoiceDate: body.supplier_invoice_date,
      supplierInvoiceValue: body.supplier_invoice_value,
      exchangeRate: body.exchange_rate,
      containerNumber: body.container_number,
      containerSize: body.container_size,
      sealNumber: body.seal_number,
      vesselName: body.vessel_name,
      voyageNumber: body.voyage_number,
      billOfLadingNumber: body.bill_of_lading_number,
      billOfLadingDate: body.bill_of_lading_date,
      portOfLoading: body.port_of_loading,
      portOfDischarge: body.port_of_discharge,
      eta: body.eta,
      shippingLine: body.shipping_line,
      freightForwarder: body.freight_forwarder,
    });
    sendSuccess(res, { shipment });
  } catch (err) { next(err); }
});

router.post('/:id/transition', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, z.object({
      status: z.enum(['arrived_port', 'customs_clearance', 'cleared', 'in_transit_to_factory', 'received']),
    }));
    const shipment = await transitionShipmentStatus(id, body.status);
    sendSuccess(res, { shipment });
  } catch (err) { next(err); }
});

router.post('/:id/pos', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, z.object({ po_id: z.string().uuid() }));
    const link = await addPoToShipment(id, body.po_id);
    sendSuccess(res, { link }, { status: 201 });
  } catch (err) { next(err); }
});

router.delete('/:id/pos/:poId', requireInternal, EDIT, async (req, res, next) => {
  try {
    const params = parseParams(req, z.object({ id: z.string().uuid(), poId: z.string().uuid() }));
    await removePoFromShipment(params.id, params.poId);
    sendSuccess(res, { deleted: true });
  } catch (err) { next(err); }
});

// ─── Customs ────────────────────────────────────────────────────────────────────

const customsBody = z.object({
  bill_of_entry_number: z.string().nullable().optional(),
  bill_of_entry_date: z.string().nullable().optional(),
  assessable_value: z.number().nonnegative().nullable().optional(),
  basic_customs_duty: z.number().nonnegative().nullable().optional(),
  igst_amount: z.number().nonnegative().nullable().optional(),
  social_welfare_surcharge: z.number().nonnegative().nullable().optional(),
  anti_dumping_duty: z.number().nonnegative().nullable().optional(),
  cha_charges: z.number().nonnegative().nullable().optional(),
  port_charges: z.number().nonnegative().nullable().optional(),
  transport_charges: z.number().nonnegative().nullable().optional(),
  insurance: z.number().nonnegative().nullable().optional(),
  other_charges: z.number().nonnegative().nullable().optional(),
  cha_name: z.string().nullable().optional(),
  cha_contact: z.string().nullable().optional(),
});

router.put('/:id/customs', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, customsBody);
    const customs = await createOrUpdateCustoms(id, {
      billOfEntryNumber: body.bill_of_entry_number,
      billOfEntryDate: body.bill_of_entry_date,
      assessableValue: body.assessable_value,
      basicCustomsDuty: body.basic_customs_duty,
      igstAmount: body.igst_amount,
      socialWelfareSurcharge: body.social_welfare_surcharge,
      antiDumpingDuty: body.anti_dumping_duty,
      chaCharges: body.cha_charges,
      portCharges: body.port_charges,
      transportCharges: body.transport_charges,
      insurance: body.insurance,
      otherCharges: body.other_charges,
      chaName: body.cha_name,
      chaContact: body.cha_contact,
    });
    sendSuccess(res, { customs });
  } catch (err) { next(err); }
});

router.post('/:id/allocate-landed-costs', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const allocations = await allocateLandedCosts(id);
    sendSuccess(res, { allocations });
  } catch (err) { next(err); }
});

export default router;
