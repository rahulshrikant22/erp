/**
 * Manufacturer Catalog endpoints — P2-04.
 *
 *   GET    /api/material/manufacturer-catalogs
 *   POST   /api/material/manufacturer-catalogs
 *   GET    /api/material/manufacturer-catalogs/lookup
 *   GET    /api/material/manufacturer-catalogs/search
 *   GET    /api/material/manufacturer-catalogs/import-template
 *   POST   /api/material/manufacturer-catalogs/import
 *   POST   /api/material/manufacturer-catalogs/bulk-deactivate
 *   POST   /api/material/manufacturer-catalogs/merge
 *   GET    /api/material/manufacturer-catalogs/:id
 *   PUT    /api/material/manufacturer-catalogs/:id
 *   DELETE /api/material/manufacturer-catalogs/:id
 *   GET    /api/material/manufacturers/:id/catalog
 */
import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  createCatalogEntry,
  updateCatalogEntry,
  deleteCatalogEntry,
  getCatalogEntry,
  listCatalogEntries,
  searchCatalog,
  lookupCatalogEntry,
  getManufacturerCatalog,
  bulkDeactivate,
  mergeCatalogEntries,
  generateImportTemplate,
  importCatalogCsv,
} from '../services/manufacturer-catalogs';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const VIEW = requirePermission('MATERIAL', 'material', 'view');
const CREATE = requirePermission('MATERIAL', 'material', 'create');
const EDIT = requirePermission('MATERIAL', 'material', 'edit');

// ─── schemas ────────────────────────────────────────────────────────────────────

const idParam = z.object({ id: z.string().uuid() });

const listQuery = z.object({
  manufacturer_id: z.string().uuid().optional(),
  catalog_type: z.string().optional(),
  search: z.string().optional(),
  is_active: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const createBody = z.object({
  manufacturer_id: z.string().uuid(),
  catalog_type: z.string().min(1).max(50),
  code: z.string().min(1).max(100),
  name: z.string().min(1).max(300),
  additional_attributes: z.record(z.string(), z.any()).optional(),
  reference_image_path: z.string().max(500).optional(),
});

const updateBody = z.object({
  name: z.string().min(1).max(300).optional(),
  additional_attributes: z.record(z.string(), z.any()).optional(),
  reference_image_path: z.string().max(500).nullable().optional(),
  is_active: z.boolean().optional(),
}).strict();

const lookupQuery = z.object({
  manufacturer_id: z.string().uuid(),
  catalog_type: z.string().min(1),
  code: z.string().min(1),
});

const searchQuery = z.object({
  manufacturer_id: z.string().uuid(),
  q: z.string().min(1),
});

const templateQuery = z.object({
  catalog_type: z.string().min(1).default('color'),
});

const importQuery = z.object({
  manufacturer_id: z.string().uuid(),
  catalog_type: z.string().min(1),
});

const bulkDeactivateBody = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});

const mergeBody = z.object({
  keep_id: z.string().uuid(),
  merge_ids: z.array(z.string().uuid()).min(1).max(100),
});

const mfrCatalogQuery = z.object({
  catalog_type: z.string().optional(),
});

// ─── static routes first ────────────────────────────────────────────────────────

router.get('/manufacturer-catalogs/lookup', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, lookupQuery);
    const entry = await lookupCatalogEntry(q.manufacturer_id, q.catalog_type, q.code);
    sendSuccess(res, { catalog: entry });
  } catch (err) { next(err); }
});

router.get('/manufacturer-catalogs/search', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, searchQuery);
    const results = await searchCatalog(q.manufacturer_id, q.q);
    sendSuccess(res, { results });
  } catch (err) { next(err); }
});

router.get('/manufacturer-catalogs/import-template', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, templateQuery);
    const csv = generateImportTemplate(q.catalog_type);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${q.catalog_type}-catalog-template.csv"`);
    res.send(csv);
  } catch (err) { next(err); }
});

router.post('/manufacturer-catalogs/import', requireInternal, CREATE, upload.single('file'), async (req, res, next) => {
  try {
    const q = parseQuery(req, importQuery);
    if (!req.file) {
      return sendSuccess(res, { error: 'No file uploaded' }, { status: 400 });
    }
    const result = await importCatalogCsv(
      q.manufacturer_id,
      q.catalog_type,
      req.file.buffer,
      req.user?.id,
    );
    sendSuccess(res, result, { status: 201 });
  } catch (err) { next(err); }
});

router.post('/manufacturer-catalogs/bulk-deactivate', requireInternal, EDIT, async (req, res, next) => {
  try {
    const body = parseBody(req, bulkDeactivateBody);
    const result = await bulkDeactivate(body.ids);
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.post('/manufacturer-catalogs/merge', requireInternal, EDIT, async (req, res, next) => {
  try {
    const body = parseBody(req, mergeBody);
    const result = await mergeCatalogEntries(body.keep_id, body.merge_ids);
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// ─── CRUD ───────────────────────────────────────────────────────────────────────

router.get('/manufacturer-catalogs', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, listQuery);
    const result = await listCatalogEntries({
      manufacturerId: q.manufacturer_id,
      catalogType: q.catalog_type,
      search: q.search,
      isActive: q.is_active === undefined ? undefined : q.is_active === 'true',
      page: q.page,
      limit: q.limit,
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.post('/manufacturer-catalogs', requireInternal, CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, createBody);
    const entry = await createCatalogEntry({
      manufacturerId: body.manufacturer_id,
      catalogType: body.catalog_type,
      code: body.code,
      name: body.name,
      additionalAttributes: body.additional_attributes,
      referenceImagePath: body.reference_image_path,
    });
    sendSuccess(res, { entry }, { status: 201 });
  } catch (err) { next(err); }
});

router.get('/manufacturer-catalogs/:id', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    sendSuccess(res, { entry: await getCatalogEntry(id) });
  } catch (err) { next(err); }
});

router.put('/manufacturer-catalogs/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, updateBody);
    const entry = await updateCatalogEntry(id, {
      name: body.name,
      additionalAttributes: body.additional_attributes,
      referenceImagePath: body.reference_image_path,
      isActive: body.is_active,
    });
    sendSuccess(res, { entry });
  } catch (err) { next(err); }
});

router.delete('/manufacturer-catalogs/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    await deleteCatalogEntry(id);
    sendSuccess(res, { deactivated: true });
  } catch (err) { next(err); }
});

// ─── per-manufacturer view ──────────────────────────────────────────────────────

router.get('/manufacturers/:id/catalog', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const q = parseQuery(req, mfrCatalogQuery);
    sendSuccess(res, await getManufacturerCatalog(id, q.catalog_type));
  } catch (err) { next(err); }
});

export default router;
