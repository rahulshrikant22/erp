/**
 * Material Master endpoints — P2-03.
 *
 *   GET    /api/material/categories
 *   GET    /api/material/material-types
 *   GET    /api/material/category-type-profiles
 *   GET    /api/material/attributes
 *   GET    /api/material/attribute-values
 *   GET    /api/material/visibility-rules
 *   GET    /api/material/value-dependencies
 *   GET    /api/material/manufacturers
 *   GET    /api/material/manufacturer-catalog
 *   GET    /api/material/materials
 *   GET    /api/material/materials/:id
 *   GET    /api/material/materials/:id/where-used
 *   POST   /api/material/materials
 *   PUT    /api/material/materials/:id
 *   DELETE /api/material/materials/:id
 *   POST   /api/material/materials/check-duplicate
 *   POST   /api/material/materials/preview-name-and-code
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  listCategories,
  listMaterialTypes,
  getProfile,
  listAttributes,
  listAttributeValues,
  listVisibilityRules,
  listValueDependencies,
  listManufacturers,
  lookupCatalog,
  listMaterials,
  getMaterial,
  getMaterialWhereUsed,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  checkDuplicate,
  previewNameAndCode,
} from '../services/materials';

const router = Router();

const VIEW = requirePermission('MATERIAL', 'material', 'view');
const CREATE = requirePermission('MATERIAL', 'material', 'create');
const EDIT = requirePermission('MATERIAL', 'material', 'edit');
const DELETE = requirePermission('MATERIAL', 'material', 'delete');

// ─── zod schemas ────────────────────────────────────────────────────────────────

const idParam = z.object({ id: z.string().uuid() });

const profileQuery = z.object({
  category_id: z.string().uuid().optional(),
  material_type_id: z.string().uuid().optional(),
});

const attrQuery = z.object({
  profile_id: z.string().uuid(),
});

const attrValQuery = z.object({
  attribute_id: z.string().uuid(),
  manufacturer_id: z.string().uuid().optional(),
});

const visQuery = z.object({ profile_id: z.string().uuid() });
const depQuery = z.object({ profile_id: z.string().uuid() });

const mfrQuery = z.object({ category_id: z.string().uuid().optional() });

const catalogQuery = z.object({
  manufacturer_id: z.string().uuid(),
  catalog_type: z.string().min(1),
  code: z.string().min(1),
});

const listMaterialQuery = z.object({
  category: z.string().optional(),
  material_type: z.string().optional(),
  manufacturer: z.string().optional(),
  search: z.string().optional(),
  is_active: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const attrValueItem = z.object({
  attribute_id: z.string().uuid(),
  attribute_value_id: z.string().uuid().nullable().optional(),
  raw_value: z.string().nullable().optional(),
});

const createBody = z.object({
  category_id: z.string().uuid(),
  material_type_id: z.string().uuid(),
  attribute_values: z.array(attrValueItem).min(1),
  purchase_uom: z.string().min(1).max(10),
  consumption_uom: z.string().min(1).max(10),
  conversion_factor: z.number().positive().optional(),
  min_stock_level: z.number().nonnegative().optional(),
  reorder_level: z.number().nonnegative().optional(),
  max_stock_level: z.number().nonnegative().optional(),
  primary_image_path: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

const updateBody = z.object({
  notes: z.string().max(2000).optional(),
  min_stock_level: z.number().nonnegative().optional(),
  reorder_level: z.number().nonnegative().optional(),
  max_stock_level: z.number().nonnegative().optional(),
  purchase_uom: z.string().min(1).max(10).optional(),
  consumption_uom: z.string().min(1).max(10).optional(),
  conversion_factor: z.number().positive().optional(),
  is_active: z.boolean().optional(),
}).strict();

const dupCheckBody = z.object({
  category_id: z.string().uuid(),
  material_type_id: z.string().uuid(),
  attribute_values: z.array(attrValueItem).min(1),
});

// ─── lookup routes (used by creation form) ──────────────────────────────────────

router.get('/categories', requireInternal, VIEW, async (_req, res, next) => {
  try {
    sendSuccess(res, { categories: await listCategories() });
  } catch (err) { next(err); }
});

router.get('/material-types', requireInternal, VIEW, async (_req, res, next) => {
  try {
    sendSuccess(res, { materialTypes: await listMaterialTypes() });
  } catch (err) { next(err); }
});

router.get('/category-type-profiles', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, profileQuery);
    sendSuccess(res, {
      profiles: await getProfile({ categoryId: q.category_id, materialTypeId: q.material_type_id }),
    });
  } catch (err) { next(err); }
});

router.get('/attributes', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, attrQuery);
    sendSuccess(res, { attributes: await listAttributes(q.profile_id) });
  } catch (err) { next(err); }
});

router.get('/attribute-values', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, attrValQuery);
    sendSuccess(res, { values: await listAttributeValues(q.attribute_id, q.manufacturer_id) });
  } catch (err) { next(err); }
});

router.get('/visibility-rules', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, visQuery);
    sendSuccess(res, { rules: await listVisibilityRules(q.profile_id) });
  } catch (err) { next(err); }
});

router.get('/value-dependencies', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, depQuery);
    sendSuccess(res, { dependencies: await listValueDependencies(q.profile_id) });
  } catch (err) { next(err); }
});

router.get('/manufacturers', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, mfrQuery);
    sendSuccess(res, { manufacturers: await listManufacturers(q.category_id) });
  } catch (err) { next(err); }
});

router.get('/manufacturer-catalog', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, catalogQuery);
    const entry = await lookupCatalog(q.manufacturer_id, q.catalog_type, q.code);
    sendSuccess(res, { catalog: entry });
  } catch (err) { next(err); }
});

// ─── material CRUD ──────────────────────────────────────────────────────────────

// Static sub-routes MUST be before /:id param route
router.post('/materials/check-duplicate', requireInternal, VIEW, async (req, res, next) => {
  try {
    const body = parseBody(req, dupCheckBody);
    const result = await checkDuplicate({
      categoryId: body.category_id,
      materialTypeId: body.material_type_id,
      attributeValues: body.attribute_values.map((av) => ({
        attributeId: av.attribute_id,
        attributeValueId: av.attribute_value_id ?? undefined,
        rawValue: av.raw_value ?? undefined,
      })),
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.post('/materials/preview-name-and-code', requireInternal, VIEW, async (req, res, next) => {
  try {
    const body = parseBody(req, dupCheckBody);
    const result = await previewNameAndCode({
      categoryId: body.category_id,
      materialTypeId: body.material_type_id,
      attributeValues: body.attribute_values.map((av) => ({
        attributeId: av.attribute_id,
        attributeValueId: av.attribute_value_id ?? undefined,
        rawValue: av.raw_value ?? undefined,
      })),
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.get('/materials', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, listMaterialQuery);
    const result = await listMaterials({
      category: q.category,
      materialType: q.material_type,
      manufacturer: q.manufacturer,
      search: q.search,
      isActive: q.is_active === undefined ? undefined : q.is_active === 'true',
      page: q.page,
      limit: q.limit,
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.get('/materials/:id', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    sendSuccess(res, { material: await getMaterial(id) });
  } catch (err) { next(err); }
});

router.get('/materials/:id/where-used', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    sendSuccess(res, await getMaterialWhereUsed(id));
  } catch (err) { next(err); }
});

router.post('/materials', requireInternal, CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, createBody);
    const material = await createMaterial({
      categoryId: body.category_id,
      materialTypeId: body.material_type_id,
      attributeValues: body.attribute_values.map((av) => ({
        attributeId: av.attribute_id,
        attributeValueId: av.attribute_value_id ?? undefined,
        rawValue: av.raw_value ?? undefined,
      })),
      purchaseUom: body.purchase_uom,
      consumptionUom: body.consumption_uom,
      conversionFactor: body.conversion_factor,
      minStockLevel: body.min_stock_level,
      reorderLevel: body.reorder_level,
      maxStockLevel: body.max_stock_level,
      primaryImagePath: body.primary_image_path,
      notes: body.notes,
    });
    sendSuccess(res, { material }, { status: 201 });
  } catch (err) { next(err); }
});

router.put('/materials/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, updateBody);
    const material = await updateMaterial(id, {
      notes: body.notes,
      minStockLevel: body.min_stock_level,
      reorderLevel: body.reorder_level,
      maxStockLevel: body.max_stock_level,
      purchaseUom: body.purchase_uom,
      consumptionUom: body.consumption_uom,
      conversionFactor: body.conversion_factor,
      isActive: body.is_active,
    });
    sendSuccess(res, { material });
  } catch (err) { next(err); }
});

router.delete('/materials/:id', requireInternal, DELETE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    await deleteMaterial(id);
    sendSuccess(res, { deleted: true });
  } catch (err) { next(err); }
});

export default router;
