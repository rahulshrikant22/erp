import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  createStockMovement,
  getStockByMaterial, getStockByLocation, getAggregateStock, getStockValuation,
  createReservation, releaseReservation, convertSoftToHard, listReservations,
  generateReorderAlerts, listReorderAlerts, acknowledgeAlert,
  transferStock, listMovements,
} from '../services/inventory';

const router = Router();

const VIEW = requirePermission('INVENTORY', 'stock', 'view');
const CREATE = requirePermission('INVENTORY', 'stock', 'create');
const EDIT = requirePermission('INVENTORY', 'stock', 'edit');

const idParam = z.object({ id: z.string().uuid() });

// ─── Stock Queries ──────────────────────────────────────────────────────────────

router.get('/stock/material/:id', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const stock = await getStockByMaterial(id);
    sendSuccess(res, { stock });
  } catch (err) { next(err); }
});

router.get('/stock/location/:id', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const stock = await getStockByLocation(id);
    sendSuccess(res, { stock });
  } catch (err) { next(err); }
});

router.get('/stock/aggregate/:id', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const aggregate = await getAggregateStock(id);
    sendSuccess(res, { aggregate });
  } catch (err) { next(err); }
});

router.get('/stock/valuation', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, z.object({ location_id: z.string().uuid().optional() }));
    const valuation = await getStockValuation(q.location_id);
    sendSuccess(res, { valuation });
  } catch (err) { next(err); }
});

// ─── Stock Movements ────────────────────────────────────────────────────────────

router.get('/movements', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, z.object({
      material_id: z.string().uuid().optional(),
      movement_type: z.string().optional(),
      location_id: z.string().uuid().optional(),
      search: z.string().optional(),
      page: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().positive().max(200).optional(),
    }));
    const result = await listMovements({
      materialId: q.material_id,
      movementType: q.movement_type,
      locationId: q.location_id,
      search: q.search,
      page: q.page,
      limit: q.limit,
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.post('/movements', requireInternal, CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, z.object({
      movement_type: z.enum(['inward_grn', 'outward_min', 'transfer', 'adjustment_plus', 'adjustment_minus', 'return_from_production', 'scrap']),
      material_id: z.string().uuid(),
      source_location_id: z.string().uuid().nullable().optional(),
      destination_location_id: z.string().uuid().nullable().optional(),
      source_bin_id: z.string().uuid().nullable().optional(),
      destination_bin_id: z.string().uuid().nullable().optional(),
      quantity: z.number().positive(),
      batch_id: z.string().uuid().nullable().optional(),
      unit_cost: z.number().nonnegative().nullable().optional(),
      reference_doc_type: z.string().nullable().optional(),
      reference_doc_id: z.string().nullable().optional(),
      reason: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    }));
    const movement = await createStockMovement({
      movementType: body.movement_type,
      materialId: body.material_id,
      sourceLocationId: body.source_location_id,
      destinationLocationId: body.destination_location_id,
      sourceBinId: body.source_bin_id,
      destinationBinId: body.destination_bin_id,
      quantity: body.quantity,
      batchId: body.batch_id,
      unitCost: body.unit_cost,
      referenceDocType: body.reference_doc_type,
      referenceDocId: body.reference_doc_id,
      movedBy: req.user?.id,
      reason: body.reason,
      notes: body.notes,
    });
    sendSuccess(res, { movement }, { status: 201 });
  } catch (err) { next(err); }
});

// ─── Transfer ───────────────────────────────────────────────────────────────────

router.post('/transfer', requireInternal, EDIT, async (req, res, next) => {
  try {
    const body = parseBody(req, z.object({
      material_id: z.string().uuid(),
      source_location_id: z.string().uuid(),
      destination_location_id: z.string().uuid(),
      quantity: z.number().positive(),
      source_bin_id: z.string().uuid().nullable().optional(),
      destination_bin_id: z.string().uuid().nullable().optional(),
      notes: z.string().nullable().optional(),
    }));
    const movement = await transferStock(
      body.material_id,
      body.source_location_id,
      body.destination_location_id,
      body.quantity,
      body.source_bin_id,
      body.destination_bin_id,
      req.user?.id,
      body.notes ?? undefined,
    );
    sendSuccess(res, { movement }, { status: 201 });
  } catch (err) { next(err); }
});

// ─── Reservations ───────────────────────────────────────────────────────────────

router.get('/reservations', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, z.object({
      material_id: z.string().uuid().optional(),
      source_type: z.string().optional(),
    }));
    const reservations = await listReservations(q.material_id, q.source_type);
    sendSuccess(res, { reservations });
  } catch (err) { next(err); }
});

router.post('/reservations', requireInternal, CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, z.object({
      material_id: z.string().uuid(),
      location_id: z.string().uuid().nullable().optional(),
      reserved_quantity: z.number().positive(),
      reservation_type: z.enum(['soft', 'hard']),
      source_type: z.string().min(1),
      source_id: z.string().uuid(),
      expires_at: z.string().nullable().optional(),
    }));
    const reservation = await createReservation({
      materialId: body.material_id,
      locationId: body.location_id,
      reservedQuantity: body.reserved_quantity,
      reservationType: body.reservation_type,
      sourceType: body.source_type,
      sourceId: body.source_id,
      reservedBy: req.user?.id,
      expiresAt: body.expires_at,
    });
    sendSuccess(res, { reservation }, { status: 201 });
  } catch (err) { next(err); }
});

router.post('/reservations/:id/release', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, z.object({ reason: z.string().optional() }));
    await releaseReservation(id, body.reason);
    sendSuccess(res, { released: true });
  } catch (err) { next(err); }
});

router.post('/reservations/convert-to-hard', requireInternal, EDIT, async (req, res, next) => {
  try {
    const body = parseBody(req, z.object({
      material_id: z.string().uuid(),
      source_type: z.string().min(1),
      source_id: z.string().uuid(),
    }));
    await convertSoftToHard(body.material_id, body.source_type, body.source_id);
    sendSuccess(res, { converted: true });
  } catch (err) { next(err); }
});

// ─── Reorder Alerts ─────────────────────────────────────────────────────────────

router.post('/reorder-alerts/generate', requireInternal, EDIT, async (_req, res, next) => {
  try {
    const alerts = await generateReorderAlerts();
    sendSuccess(res, { alerts, count: alerts.length });
  } catch (err) { next(err); }
});

router.get('/reorder-alerts', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, z.object({ status: z.string().optional() }));
    const alerts = await listReorderAlerts(q.status);
    sendSuccess(res, { alerts });
  } catch (err) { next(err); }
});

router.post('/reorder-alerts/:id/acknowledge', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const alert = await acknowledgeAlert(id, req.user!.id);
    sendSuccess(res, { alert });
  } catch (err) { next(err); }
});

export default router;
