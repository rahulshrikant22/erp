import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  createProcess,
  listProcesses,
  getProcess,
  updateProcess,
  deleteProcess,
  addCapability,
  updateCapability,
  deleteCapability,
  calculateProcessCost,
  importProcesses,
} from '../services/processes';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const VIEW = requirePermission('PROCESS', 'process', 'view');
const CREATE = requirePermission('PROCESS', 'process', 'create');
const EDIT = requirePermission('PROCESS', 'process', 'edit');
const DELETE = requirePermission('PROCESS', 'process', 'delete');

// ─── Zod schemas ────────────────────────────────────────────────────────────────

const idParam = z.object({ id: z.string().uuid() });
const capIdParam = z.object({ id: z.string().uuid(), capId: z.string().uuid() });

const createBody = z.object({
  process_code: z.string().min(1).max(50),
  process_name: z.string().min(1).max(200),
  process_category: z.string().min(1),
  standard_time_minutes: z.number().nonnegative().nullable().optional(),
  time_unit: z.string().optional(),
  labor_cost_per_hour: z.number().nonnegative().nullable().optional(),
  machine_cost_per_hour: z.number().nonnegative().nullable().optional(),
  is_outsourced: z.boolean().optional(),
  default_outsource_vendor_notes: z.string().nullable().optional(),
  station_id: z.string().uuid().nullable().optional(),
});

const updateBody = z.object({
  process_name: z.string().min(1).max(200).optional(),
  process_category: z.string().min(1).optional(),
  standard_time_minutes: z.number().nonnegative().nullable().optional(),
  time_unit: z.string().optional(),
  labor_cost_per_hour: z.number().nonnegative().nullable().optional(),
  machine_cost_per_hour: z.number().nonnegative().nullable().optional(),
  is_outsourced: z.boolean().optional(),
  default_outsource_vendor_notes: z.string().nullable().optional(),
  station_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
});

const listQuery = z.object({
  category: z.string().optional(),
  is_outsourced: z.enum(['true', 'false']).optional(),
  is_active: z.enum(['true', 'false']).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

const capBody = z.object({
  capability_key: z.string().min(1).max(100),
  capability_value: z.string().min(1).max(500),
});

const costQuery = z.object({
  quantity: z.coerce.number().positive(),
  time_minutes: z.coerce.number().nonnegative().optional(),
});

// ─── Process CRUD ───────────────────────────────────────────────────────────────

router.post('/', requireInternal, CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, createBody);
    const process = await createProcess({
      processCode: body.process_code,
      processName: body.process_name,
      processCategory: body.process_category,
      standardTimeMinutes: body.standard_time_minutes,
      timeUnit: body.time_unit,
      laborCostPerHour: body.labor_cost_per_hour,
      machineCostPerHour: body.machine_cost_per_hour,
      isOutsourced: body.is_outsourced,
      defaultOutsourceVendorNotes: body.default_outsource_vendor_notes,
      stationId: body.station_id,
    });
    sendSuccess(res, { process }, { status: 201 });
  } catch (err) { next(err); }
});

router.get('/', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, listQuery);
    const result = await listProcesses({
      category: q.category,
      isOutsourced: q.is_outsourced === undefined ? undefined : q.is_outsourced === 'true',
      isActive: q.is_active === undefined ? undefined : q.is_active === 'true',
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
    const process = await getProcess(id);
    sendSuccess(res, { process });
  } catch (err) { next(err); }
});

router.put('/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, updateBody);
    const process = await updateProcess(id, {
      processName: body.process_name,
      processCategory: body.process_category,
      standardTimeMinutes: body.standard_time_minutes,
      timeUnit: body.time_unit,
      laborCostPerHour: body.labor_cost_per_hour,
      machineCostPerHour: body.machine_cost_per_hour,
      isOutsourced: body.is_outsourced,
      defaultOutsourceVendorNotes: body.default_outsource_vendor_notes,
      stationId: body.station_id,
      isActive: body.is_active,
    });
    sendSuccess(res, { process });
  } catch (err) { next(err); }
});

router.delete('/:id', requireInternal, DELETE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    await deleteProcess(id);
    sendSuccess(res, { deleted: true });
  } catch (err) { next(err); }
});

// ─── Capabilities ───────────────────────────────────────────────────────────────

router.post('/:id/capabilities', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, capBody);
    const capability = await addCapability(id, body.capability_key, body.capability_value);
    sendSuccess(res, { capability }, { status: 201 });
  } catch (err) { next(err); }
});

router.put('/:id/capabilities/:capId', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id, capId } = parseParams(req, capIdParam);
    const body = parseBody(req, capBody);
    const capability = await updateCapability(id, capId, body.capability_key, body.capability_value);
    sendSuccess(res, { capability });
  } catch (err) { next(err); }
});

router.delete('/:id/capabilities/:capId', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id, capId } = parseParams(req, capIdParam);
    await deleteCapability(id, capId);
    sendSuccess(res, { deleted: true });
  } catch (err) { next(err); }
});

// ─── Cost Calculation ───────────────────────────────────────────────────────────

router.get('/:id/calculate-cost', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const q = parseQuery(req, costQuery);
    const process = await getProcess(id);
    const cost = calculateProcessCost(process, {
      quantity: q.quantity,
      timeMinutes: q.time_minutes,
    });
    sendSuccess(res, { cost });
  } catch (err) { next(err); }
});

// ─── CSV Import ─────────────────────────────────────────────────────────────────

router.post('/import', requireInternal, CREATE, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return sendSuccess(res, { error: 'No file uploaded' }, { status: 400 });
    }
    const result = await importProcesses(req.file.buffer);
    sendSuccess(res, result, { status: 201 });
  } catch (err) { next(err); }
});

export default router;
