import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  createGrn, listGrns, getGrn, submitGrn,
  addGrnDocument, listGrnDocuments, deleteGrnDocument,
} from '../services/grn';

const router = Router();

const VIEW = requirePermission('INVENTORY', 'grn', 'view');
const CREATE = requirePermission('INVENTORY', 'grn', 'create');
const EDIT = requirePermission('INVENTORY', 'grn', 'edit');

const idParam = z.object({ id: z.string().uuid() });
const docParam = z.object({ id: z.string().uuid(), docId: z.string().uuid() });

const grnLineBody = z.object({
  po_line_id: z.string().uuid(),
  material_id: z.string().uuid(),
  quantity_received: z.number().positive(),
  uom: z.string().optional(),
  batch_number: z.string().nullable().optional(),
  lot_number: z.string().nullable().optional(),
  expiry_date: z.string().nullable().optional(),
  bin_id: z.string().uuid().nullable().optional(),
  general_area_id: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const createBody = z.object({
  po_id: z.string().uuid(),
  shipment_id: z.string().uuid().nullable().optional(),
  delivery_challan_number: z.string().nullable().optional(),
  delivery_challan_date: z.string().nullable().optional(),
  vehicle_number: z.string().nullable().optional(),
  driver_name: z.string().nullable().optional(),
  driver_phone: z.string().nullable().optional(),
  received_at_location_id: z.string().uuid(),
  gate_pass_number: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lines: z.array(grnLineBody).min(1),
});

const listQuery = z.object({
  status: z.string().optional(),
  po_id: z.string().uuid().optional(),
  vendor_id: z.string().uuid().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

router.post('/', requireInternal, CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, createBody);
    const grn = await createGrn({
      poId: body.po_id,
      shipmentId: body.shipment_id,
      deliveryChallanNumber: body.delivery_challan_number,
      deliveryChallanDate: body.delivery_challan_date,
      vehicleNumber: body.vehicle_number,
      driverName: body.driver_name,
      driverPhone: body.driver_phone,
      receivedAtLocationId: body.received_at_location_id,
      gatePassNumber: body.gate_pass_number,
      notes: body.notes,
      receivedBy: req.user?.id,
      lines: body.lines.map((l) => ({
        poLineId: l.po_line_id,
        materialId: l.material_id,
        quantityReceived: l.quantity_received,
        uom: l.uom,
        batchNumber: l.batch_number,
        lotNumber: l.lot_number,
        expiryDate: l.expiry_date,
        binId: l.bin_id,
        generalAreaId: l.general_area_id,
        notes: l.notes,
      })),
    });
    sendSuccess(res, { grn }, { status: 201 });
  } catch (err) { next(err); }
});

router.get('/', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, listQuery);
    const result = await listGrns({
      status: q.status,
      poId: q.po_id,
      vendorId: q.vendor_id,
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
    const grn = await getGrn(id);
    sendSuccess(res, { grn });
  } catch (err) { next(err); }
});

router.post('/:id/submit', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const grn = await submitGrn(id);
    sendSuccess(res, { grn });
  } catch (err) { next(err); }
});

// ─── Documents ──────────────────────────────────────────────────────────────────

router.post('/:id/documents', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, z.object({
      document_type: z.enum(['delivery_challan', 'invoice', 'weighbridge_slip', 'vehicle_photo', 'damage_photo']),
      document_path: z.string().min(1),
    }));
    const doc = await addGrnDocument(id, body.document_type, body.document_path, req.user?.id);
    sendSuccess(res, { document: doc }, { status: 201 });
  } catch (err) { next(err); }
});

router.get('/:id/documents', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const documents = await listGrnDocuments(id);
    sendSuccess(res, { documents });
  } catch (err) { next(err); }
});

router.delete('/:id/documents/:docId', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id, docId } = parseParams(req, docParam);
    await deleteGrnDocument(id, docId);
    sendSuccess(res, { deleted: true });
  } catch (err) { next(err); }
});

export default router;
