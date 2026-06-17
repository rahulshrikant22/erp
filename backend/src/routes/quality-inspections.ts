import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  createInspection, triggerInspectionsForGrn,
  listInspections, getInspection,
  addParameter, updateParameter,
  addPhoto, deletePhoto,
  completeInspection, createReInspection,
  isQcModuleActive,
} from '../services/quality-inspections';

const router = Router();

const VIEW = requirePermission('INVENTORY', 'quality_inspection', 'view');
const CREATE = requirePermission('INVENTORY', 'quality_inspection', 'create');
const EDIT = requirePermission('INVENTORY', 'quality_inspection', 'edit');

const idParam = z.object({ id: z.string().uuid() });
const paramIdParam = z.object({ id: z.string().uuid(), paramId: z.string().uuid() });
const photoIdParam = z.object({ id: z.string().uuid(), photoId: z.string().uuid() });

const listQuery = z.object({
  grn_id: z.string().uuid().optional(),
  material_id: z.string().uuid().optional(),
  overall_result: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

// ─── Module check ───────────────────────────────────────────────────────────────

router.get('/module-status', requireInternal, VIEW, async (_req, res, next) => {
  try {
    const active = await isQcModuleActive();
    sendSuccess(res, { active });
  } catch (err) { next(err); }
});

// ─── CRUD ───────────────────────────────────────────────────────────────────────

router.post('/', requireInternal, CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, z.object({
      grn_id: z.string().uuid(),
      grn_line_id: z.string().uuid().nullable().optional(),
      material_id: z.string().uuid(),
      inspection_type: z.enum(['incoming', 'periodic', 'pre_dispatch']).optional(),
    }));
    const inspection = await createInspection({
      grnId: body.grn_id,
      grnLineId: body.grn_line_id,
      materialId: body.material_id,
      inspectionType: body.inspection_type,
      inspectorUserId: req.user?.id,
    });
    sendSuccess(res, { inspection }, { status: 201 });
  } catch (err) { next(err); }
});

router.post('/trigger-for-grn', requireInternal, CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, z.object({ grn_id: z.string().uuid() }));
    const inspections = await triggerInspectionsForGrn(body.grn_id, req.user?.id);
    sendSuccess(res, { inspections }, { status: 201 });
  } catch (err) { next(err); }
});

router.get('/', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, listQuery);
    const result = await listInspections({
      grnId: q.grn_id,
      materialId: q.material_id,
      overallResult: q.overall_result,
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
    const inspection = await getInspection(id);
    sendSuccess(res, { inspection });
  } catch (err) { next(err); }
});

// ─── Parameters ─────────────────────────────────────────────────────────────────

router.post('/:id/parameters', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, z.object({
      parameter_name: z.string().min(1),
      expected_value: z.string().nullable().optional(),
      actual_value: z.string().nullable().optional(),
      tolerance: z.string().nullable().optional(),
      result: z.enum(['pass', 'fail']).nullable().optional(),
      notes: z.string().nullable().optional(),
    }));
    const parameter = await addParameter(id, {
      parameterName: body.parameter_name,
      expectedValue: body.expected_value,
      actualValue: body.actual_value,
      tolerance: body.tolerance,
      result: body.result,
      notes: body.notes,
    });
    sendSuccess(res, { parameter }, { status: 201 });
  } catch (err) { next(err); }
});

router.put('/:id/parameters/:paramId', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { paramId } = parseParams(req, paramIdParam);
    const body = parseBody(req, z.object({
      parameter_name: z.string().min(1).optional(),
      expected_value: z.string().nullable().optional(),
      actual_value: z.string().nullable().optional(),
      tolerance: z.string().nullable().optional(),
      result: z.enum(['pass', 'fail']).nullable().optional(),
      notes: z.string().nullable().optional(),
    }));
    const parameter = await updateParameter(paramId, {
      parameterName: body.parameter_name,
      expectedValue: body.expected_value,
      actualValue: body.actual_value,
      tolerance: body.tolerance,
      result: body.result,
      notes: body.notes,
    });
    sendSuccess(res, { parameter });
  } catch (err) { next(err); }
});

// ─── Photos ─────────────────────────────────────────────────────────────────────

router.post('/:id/photos', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, z.object({
      photo_type: z.enum(['defect', 'sample', 'spec_doc']),
      photo_path: z.string().min(1),
      caption: z.string().optional(),
    }));
    const photo = await addPhoto(id, body.photo_type, body.photo_path, body.caption);
    sendSuccess(res, { photo }, { status: 201 });
  } catch (err) { next(err); }
});

router.delete('/:id/photos/:photoId', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id, photoId } = parseParams(req, photoIdParam);
    await deletePhoto(id, photoId);
    sendSuccess(res, { deleted: true });
  } catch (err) { next(err); }
});

// ─── Complete / Re-inspect ──────────────────────────────────────────────────────

router.post('/:id/complete', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, z.object({
      overall_result: z.enum(['accepted', 'rejected', 'accepted_with_deviation']),
      deviation_notes: z.string().nullable().optional(),
      approved_by_for_deviation: z.string().uuid().nullable().optional(),
    }));
    const inspection = await completeInspection(id, {
      overallResult: body.overall_result,
      deviationNotes: body.deviation_notes,
      approvedByForDeviation: body.approved_by_for_deviation,
    });
    sendSuccess(res, { inspection });
  } catch (err) { next(err); }
});

router.post('/:id/re-inspect', requireInternal, CREATE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const inspection = await createReInspection(id, req.user?.id);
    sendSuccess(res, { inspection }, { status: 201 });
  } catch (err) { next(err); }
});

export default router;
