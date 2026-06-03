import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  createBom,
  listBoms,
  getBom,
  updateBom,
  deleteBom,
  createNewVersion,
  listVersions,
  getVersion,
  approveVersion,
  compareVersions,
  addMaterialLine,
  addAlternateMaterial,
  updateMaterialLine,
  deleteMaterialLine,
  addProcessLine,
  updateProcessLine,
  deleteProcessLine,
  addSubassembly,
  deleteSubassembly,
  getExpandedBom,
  getBomChangeLog,
  materialWhereUsedInBoms,
  processWhereUsedInBoms,
} from '../services/boms';

const router = Router();

const VIEW = requirePermission('BOM', 'bom', 'view');
const CREATE = requirePermission('BOM', 'bom', 'create');
const EDIT = requirePermission('BOM', 'bom', 'edit');
const DELETE = requirePermission('BOM', 'bom', 'delete');
const APPROVE = requirePermission('BOM', 'bom', 'approve');

// ─── Zod schemas ────────────────────────────────────────────────────────────────

const idParam = z.object({ id: z.string().uuid() });
const bomVersionParam = z.object({ id: z.string().uuid(), versionId: z.string().uuid() });
const lineParam = z.object({ id: z.string().uuid(), versionId: z.string().uuid(), lineId: z.string().uuid() });
const saParam = z.object({ id: z.string().uuid(), versionId: z.string().uuid(), saId: z.string().uuid() });

const createBody = z.object({
  product_id: z.string().uuid(),
  product_size_variant_id: z.string().uuid().nullable().optional(),
  description: z.string().nullable().optional(),
});

const updateBody = z.object({
  bom_name: z.string().min(1).max(300).optional(),
  description: z.string().nullable().optional(),
});

const listQuery = z.object({
  product_id: z.string().uuid().optional(),
  status: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

const materialLineBody = z.object({
  line_sequence: z.number().int().positive().optional(),
  line_type: z.enum(['primary', 'alternate']).optional(),
  alternate_group_id: z.string().nullable().optional(),
  material_category_id: z.string().uuid().nullable().optional(),
  material_type_id: z.string().uuid().nullable().optional(),
  specific_material_id: z.string().uuid().nullable().optional(),
  is_finish_dependent: z.boolean().optional(),
  quantity_per_unit: z.number().positive(),
  uom: z.string().optional(),
  wastage_percent: z.number().nonnegative().optional(),
  notes: z.string().nullable().optional(),
});

const materialLineUpdateBody = z.object({
  line_sequence: z.number().int().positive().optional(),
  material_category_id: z.string().uuid().nullable().optional(),
  material_type_id: z.string().uuid().nullable().optional(),
  specific_material_id: z.string().uuid().nullable().optional(),
  is_finish_dependent: z.boolean().optional(),
  quantity_per_unit: z.number().positive().optional(),
  uom: z.string().optional(),
  wastage_percent: z.number().nonnegative().optional(),
  notes: z.string().nullable().optional(),
});

const processLineBody = z.object({
  line_sequence: z.number().int().positive().optional(),
  process_id: z.string().uuid(),
  quantity: z.number().positive().optional(),
  time_per_unit_minutes: z.number().nonnegative().nullable().optional(),
  is_outsourced: z.boolean().optional(),
  outsource_vendor_notes: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const processLineUpdateBody = z.object({
  line_sequence: z.number().int().positive().optional(),
  process_id: z.string().uuid().optional(),
  quantity: z.number().positive().optional(),
  time_per_unit_minutes: z.number().nonnegative().nullable().optional(),
  is_outsourced: z.boolean().optional(),
  outsource_vendor_notes: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const subassemblyBody = z.object({
  child_bom_id: z.string().uuid(),
  quantity: z.number().positive().optional(),
  notes: z.string().nullable().optional(),
});

const compareQuery = z.object({
  version1: z.string().uuid(),
  version2: z.string().uuid(),
});

const whereUsedParam = z.object({ materialId: z.string().uuid() });
const processWhereUsedParam = z.object({ processId: z.string().uuid() });

const alternateParam = z.object({
  id: z.string().uuid(),
  versionId: z.string().uuid(),
  lineId: z.string().uuid(),
});

// ─── BOM CRUD ───────────────────────────────────────────────────────────────────

router.post('/', requireInternal, CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, createBody);
    const bom = await createBom({
      productId: body.product_id,
      productSizeVariantId: body.product_size_variant_id,
      description: body.description,
    });
    sendSuccess(res, { bom }, { status: 201 });
  } catch (err) { next(err); }
});

router.get('/', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, listQuery);
    const result = await listBoms({
      productId: q.product_id,
      status: q.status,
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
    const bom = await getBom(id);
    sendSuccess(res, { bom });
  } catch (err) { next(err); }
});

router.put('/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, updateBody);
    const bom = await updateBom(id, {
      bomName: body.bom_name,
      description: body.description,
    });
    sendSuccess(res, { bom });
  } catch (err) { next(err); }
});

router.delete('/:id', requireInternal, DELETE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    await deleteBom(id);
    sendSuccess(res, { deleted: true });
  } catch (err) { next(err); }
});

// ─── Versions ───────────────────────────────────────────────────────────────────

router.post('/:id/versions', requireInternal, CREATE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const version = await createNewVersion(id);
    sendSuccess(res, { version }, { status: 201 });
  } catch (err) { next(err); }
});

router.get('/:id/versions', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const versions = await listVersions(id);
    sendSuccess(res, { versions });
  } catch (err) { next(err); }
});

router.get('/:id/versions/:versionId', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id, versionId } = parseParams(req, bomVersionParam);
    const version = await getVersion(id, versionId);
    sendSuccess(res, { version });
  } catch (err) { next(err); }
});

router.post('/:id/versions/:versionId/approve', requireInternal, APPROVE, async (req, res, next) => {
  try {
    const { id, versionId } = parseParams(req, bomVersionParam);
    const version = await approveVersion(id, versionId, (req as any).user?.id);
    sendSuccess(res, { version });
  } catch (err) { next(err); }
});

router.get('/:id/compare', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const q = parseQuery(req, compareQuery);
    const diff = await compareVersions(id, q.version1, q.version2);
    sendSuccess(res, { diff });
  } catch (err) { next(err); }
});

// ─── Expanded BOM ───────────────────────────────────────────────────────────────

router.get('/:id/versions/:versionId/expanded', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id, versionId } = parseParams(req, bomVersionParam);
    const expanded = await getExpandedBom(id, versionId);
    sendSuccess(res, { expanded });
  } catch (err) { next(err); }
});

// ─── Material Lines ─────────────────────────────────────────────────────────────

router.post('/:id/versions/:versionId/materials', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id, versionId } = parseParams(req, bomVersionParam);
    const body = parseBody(req, materialLineBody);
    const line = await addMaterialLine(id, versionId, {
      lineSequence: body.line_sequence,
      lineType: body.line_type,
      alternateGroupId: body.alternate_group_id,
      materialCategoryId: body.material_category_id,
      materialTypeId: body.material_type_id,
      specificMaterialId: body.specific_material_id,
      isFinishDependent: body.is_finish_dependent,
      quantityPerUnit: body.quantity_per_unit,
      uom: body.uom,
      wastagePercent: body.wastage_percent,
      notes: body.notes,
    });
    sendSuccess(res, { line }, { status: 201 });
  } catch (err) { next(err); }
});

router.post('/:id/versions/:versionId/materials/:lineId/alternates', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id, versionId, lineId } = parseParams(req, alternateParam);
    const body = parseBody(req, materialLineBody);
    const line = await addAlternateMaterial(id, versionId, lineId, {
      materialCategoryId: body.material_category_id,
      materialTypeId: body.material_type_id,
      specificMaterialId: body.specific_material_id,
      isFinishDependent: body.is_finish_dependent,
      quantityPerUnit: body.quantity_per_unit,
      uom: body.uom,
      wastagePercent: body.wastage_percent,
      notes: body.notes,
    });
    sendSuccess(res, { line }, { status: 201 });
  } catch (err) { next(err); }
});

router.put('/:id/versions/:versionId/materials/:lineId', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id, versionId, lineId } = parseParams(req, lineParam);
    const body = parseBody(req, materialLineUpdateBody);
    const line = await updateMaterialLine(id, versionId, lineId, {
      lineSequence: body.line_sequence,
      materialCategoryId: body.material_category_id,
      materialTypeId: body.material_type_id,
      specificMaterialId: body.specific_material_id,
      isFinishDependent: body.is_finish_dependent,
      quantityPerUnit: body.quantity_per_unit,
      uom: body.uom,
      wastagePercent: body.wastage_percent,
      notes: body.notes,
    });
    sendSuccess(res, { line });
  } catch (err) { next(err); }
});

router.delete('/:id/versions/:versionId/materials/:lineId', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id, versionId, lineId } = parseParams(req, lineParam);
    await deleteMaterialLine(id, versionId, lineId);
    sendSuccess(res, { deleted: true });
  } catch (err) { next(err); }
});

// ─── Process Lines ──────────────────────────────────────────────────────────────

router.post('/:id/versions/:versionId/processes', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id, versionId } = parseParams(req, bomVersionParam);
    const body = parseBody(req, processLineBody);
    const line = await addProcessLine(id, versionId, {
      lineSequence: body.line_sequence,
      processId: body.process_id,
      quantity: body.quantity,
      timePerUnitMinutes: body.time_per_unit_minutes,
      isOutsourced: body.is_outsourced,
      outsourceVendorNotes: body.outsource_vendor_notes,
      notes: body.notes,
    });
    sendSuccess(res, { line }, { status: 201 });
  } catch (err) { next(err); }
});

router.put('/:id/versions/:versionId/processes/:lineId', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id, versionId, lineId } = parseParams(req, lineParam);
    const body = parseBody(req, processLineUpdateBody);
    const line = await updateProcessLine(id, versionId, lineId, {
      lineSequence: body.line_sequence,
      processId: body.process_id,
      quantity: body.quantity,
      timePerUnitMinutes: body.time_per_unit_minutes,
      isOutsourced: body.is_outsourced,
      outsourceVendorNotes: body.outsource_vendor_notes,
      notes: body.notes,
    });
    sendSuccess(res, { line });
  } catch (err) { next(err); }
});

router.delete('/:id/versions/:versionId/processes/:lineId', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id, versionId, lineId } = parseParams(req, lineParam);
    await deleteProcessLine(id, versionId, lineId);
    sendSuccess(res, { deleted: true });
  } catch (err) { next(err); }
});

// ─── Subassemblies ──────────────────────────────────────────────────────────────

router.post('/:id/versions/:versionId/subassemblies', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id, versionId } = parseParams(req, bomVersionParam);
    const body = parseBody(req, subassemblyBody);
    const sa = await addSubassembly(id, versionId, {
      childBomId: body.child_bom_id,
      quantity: body.quantity,
      notes: body.notes,
    });
    sendSuccess(res, { subassembly: sa }, { status: 201 });
  } catch (err) { next(err); }
});

router.delete('/:id/versions/:versionId/subassemblies/:saId', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id, versionId, saId } = parseParams(req, saParam);
    await deleteSubassembly(id, versionId, saId);
    sendSuccess(res, { deleted: true });
  } catch (err) { next(err); }
});

// ─── Change Log ─────────────────────────────────────────────────────────────────

router.get('/:id/changelog', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const changelog = await getBomChangeLog(id);
    sendSuccess(res, { changelog });
  } catch (err) { next(err); }
});

// ─── Where-used ─────────────────────────────────────────────────────────────────

router.get('/where-used/materials/:materialId', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { materialId } = parseParams(req, whereUsedParam);
    const usages = await materialWhereUsedInBoms(materialId);
    sendSuccess(res, { usages });
  } catch (err) { next(err); }
});

router.get('/where-used/processes/:processId', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { processId } = parseParams(req, processWhereUsedParam);
    const usages = await processWhereUsedInBoms(processId);
    sendSuccess(res, { usages });
  } catch (err) { next(err); }
});

export default router;
