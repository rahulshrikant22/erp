import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  createMr, listMrs, getMr,
  submitMr, approveMr, rejectMr,
  generatePickList,
  createMin, issueMin, listMins, getMin,
  createMrn, listMrns, getMrn,
} from '../services/material-requisitions';

const router = Router();

const VIEW = requirePermission('INVENTORY', 'material_requisition', 'view');
const CREATE = requirePermission('INVENTORY', 'material_requisition', 'create');
const EDIT = requirePermission('INVENTORY', 'material_requisition', 'edit');
const APPROVE = requirePermission('INVENTORY', 'material_requisition', 'approve');

const idParam = z.object({ id: z.string().uuid() });

// ─── Material Requisitions ──────────────────────────────────────────────────────

const mrLineBody = z.object({
  material_id: z.string().uuid(),
  quantity_required: z.number().positive(),
  uom: z.string().optional(),
  nesting_run_line_id: z.string().uuid().nullable().optional(),
  preferred_location_id: z.string().uuid().nullable().optional(),
});

const createMrBody = z.object({
  production_job_id: z.string().uuid().nullable().optional(),
  nesting_run_id: z.string().uuid().nullable().optional(),
  request_type: z.enum(['production', 'sample', 'rework', 'r_and_d', 'general']).optional(),
  required_by_date: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lines: z.array(mrLineBody).min(1),
});

const listMrQuery = z.object({
  status: z.string().optional(),
  request_type: z.string().optional(),
  production_job_id: z.string().uuid().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

router.post('/', requireInternal, CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, createMrBody);
    const mr = await createMr({
      productionJobId: body.production_job_id,
      nestingRunId: body.nesting_run_id,
      requestType: body.request_type,
      requiredByDate: body.required_by_date,
      notes: body.notes,
      requestingUserId: req.user?.id,
      lines: body.lines.map((l) => ({
        materialId: l.material_id,
        quantityRequired: l.quantity_required,
        uom: l.uom,
        nestingRunLineId: l.nesting_run_line_id,
        preferredLocationId: l.preferred_location_id,
      })),
    });
    sendSuccess(res, { mr }, { status: 201 });
  } catch (err) { next(err); }
});

router.get('/', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, listMrQuery);
    const result = await listMrs({
      status: q.status,
      requestType: q.request_type,
      productionJobId: q.production_job_id,
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
    const mr = await getMr(id);
    sendSuccess(res, { mr });
  } catch (err) { next(err); }
});

router.post('/:id/submit', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const mr = await submitMr(id);
    sendSuccess(res, { mr });
  } catch (err) { next(err); }
});

router.post('/:id/approve', requireInternal, APPROVE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const mr = await approveMr(id, req.user!.id);
    sendSuccess(res, { mr });
  } catch (err) { next(err); }
});

router.post('/:id/reject', requireInternal, APPROVE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, z.object({ reason: z.string().min(1) }));
    const mr = await rejectMr(id, req.user!.id, body.reason);
    sendSuccess(res, { mr });
  } catch (err) { next(err); }
});

router.post('/:id/pick-list', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, z.object({ location_id: z.string().uuid() }));
    const pickList = await generatePickList(id, body.location_id);
    sendSuccess(res, { pickList });
  } catch (err) { next(err); }
});

export default router;

// ─── Material Issue Notes Router ────────────────────────────────────────────────

export const minRouter = Router();

const MIN_VIEW = requirePermission('INVENTORY', 'material_issue', 'view');
const MIN_CREATE = requirePermission('INVENTORY', 'material_issue', 'create');
const MIN_EDIT = requirePermission('INVENTORY', 'material_issue', 'edit');

minRouter.post('/', requireInternal, MIN_CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, z.object({
      mr_id: z.string().uuid(),
      issued_from_location_id: z.string().uuid(),
      issued_to_destination: z.string().nullable().optional(),
      production_job_id: z.string().uuid().nullable().optional(),
      nesting_run_id: z.string().uuid().nullable().optional(),
      line_allocations: z.array(z.object({
        mr_line_id: z.string().uuid(),
        material_id: z.string().uuid(),
        quantity_to_issue: z.number().positive(),
        uom: z.string().optional(),
        bin_id: z.string().uuid().nullable().optional(),
      })).min(1),
    }));
    const min = await createMin({
      mrId: body.mr_id,
      issuedFromLocationId: body.issued_from_location_id,
      issuedToDestination: body.issued_to_destination,
      productionJobId: body.production_job_id,
      nestingRunId: body.nesting_run_id,
      lineAllocations: body.line_allocations.map((l) => ({
        mrLineId: l.mr_line_id,
        materialId: l.material_id,
        quantityToIssue: l.quantity_to_issue,
        uom: l.uom,
        binId: l.bin_id,
      })),
      issuedBy: req.user?.id,
    });
    sendSuccess(res, { min }, { status: 201 });
  } catch (err) { next(err); }
});

minRouter.get('/', requireInternal, MIN_VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, z.object({
      mr_id: z.string().uuid().optional(),
      status: z.string().optional(),
      page: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().positive().max(200).optional(),
    }));
    const result = await listMins(q.mr_id, q.status, q.page, q.limit);
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

minRouter.get('/:id', requireInternal, MIN_VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const min = await getMin(id);
    sendSuccess(res, { min });
  } catch (err) { next(err); }
});

minRouter.post('/:id/issue', requireInternal, MIN_EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const min = await issueMin(id, req.user?.id);
    sendSuccess(res, { min });
  } catch (err) { next(err); }
});

// ─── Material Return Notes Router ───────────────────────────────────────────────

export const mrnRouter = Router();

const MRN_VIEW = requirePermission('INVENTORY', 'material_return', 'view');
const MRN_CREATE = requirePermission('INVENTORY', 'material_return', 'create');

mrnRouter.post('/', requireInternal, MRN_CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, z.object({
      original_min_id: z.string().uuid(),
      received_at_location_id: z.string().uuid(),
      production_job_id: z.string().uuid().nullable().optional(),
      reason: z.enum(['unused', 'damaged', 'wrong_material', 'excess', 'quality_issue']).optional(),
      notes: z.string().nullable().optional(),
      lines: z.array(z.object({
        min_line_id: z.string().uuid(),
        material_id: z.string().uuid(),
        quantity_returned: z.number().positive(),
        uom: z.string().optional(),
        condition: z.enum(['good_back_to_stock', 'damaged_scrap', 'quarantine_for_review']).optional(),
        destination_location_id: z.string().uuid().nullable().optional(),
        destination_bin_id: z.string().uuid().nullable().optional(),
      })).min(1),
    }));
    const mrn = await createMrn({
      originalMinId: body.original_min_id,
      receivedAtLocationId: body.received_at_location_id,
      productionJobId: body.production_job_id,
      reason: body.reason,
      notes: body.notes,
      returnedBy: req.user?.id,
      lines: body.lines.map((l) => ({
        minLineId: l.min_line_id,
        materialId: l.material_id,
        quantityReturned: l.quantity_returned,
        uom: l.uom,
        condition: l.condition,
        destinationLocationId: l.destination_location_id,
        destinationBinId: l.destination_bin_id,
      })),
    });
    sendSuccess(res, { mrn }, { status: 201 });
  } catch (err) { next(err); }
});

mrnRouter.get('/', requireInternal, MRN_VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, z.object({
      min_id: z.string().uuid().optional(),
      page: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().positive().max(200).optional(),
    }));
    const result = await listMrns(q.min_id, q.page, q.limit);
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

mrnRouter.get('/:id', requireInternal, MRN_VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const mrn = await getMrn(id);
    sendSuccess(res, { mrn });
  } catch (err) { next(err); }
});
