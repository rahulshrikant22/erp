/**
 * Material Import endpoints — P2-06.
 *
 *   GET    /api/material/materials/import-template
 *   POST   /api/material/materials/import
 *   GET    /api/material/import-batches/:id/errors
 *   PATCH  /api/material/import-batches/:id/errors/:errorId
 *   POST   /api/material/import-batches/:id/retry-errors
 *   GET    /api/material/import-batches/:id/export-errors
 */
import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  generateImportTemplate,
  importMaterials,
  getBatchErrors,
  updateImportError,
  retryBatchErrors,
  exportBatchErrorsCsv,
} from '../services/material-import';
import type { OnDuplicate } from '../services/material-import';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const VIEW = requirePermission('MATERIAL', 'material', 'view');
const CREATE = requirePermission('MATERIAL', 'material', 'create');
const EDIT = requirePermission('MATERIAL', 'material', 'edit');

// ─── schemas ───────────────────────────────────────────────────────────────────

const templateQuery = z.object({
  category_id: z.string().uuid(),
  material_type_id: z.string().uuid(),
});

const importQuery = z.object({
  category_id: z.string().uuid(),
  material_type_id: z.string().uuid(),
  on_duplicate: z.enum(['skip', 'fail', 'update_existing']).default('skip'),
});

const batchIdParam = z.object({ id: z.string().uuid() });
const batchErrorParam = z.object({ id: z.string().uuid(), errorId: z.string().uuid() });

const errorsQuery = z.object({
  include_resolved: z.enum(['true', 'false']).optional(),
});

const correctBody = z.object({
  corrected_data: z.record(z.string(), z.string()),
}).strict();

// ─── template ──────────────────────────────────────────────────────────────────

router.get('/materials/import-template', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, templateQuery);
    const { csv, columns } = await generateImportTemplate(q.category_id, q.material_type_id);

    if (req.query.format === 'json') {
      sendSuccess(res, { columns });
      return;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="material-import-template.csv"');
    res.send(csv);
  } catch (err) { next(err); }
});

// ─── import ────────────────────────────────────────────────────────────────────

router.post('/materials/import', requireInternal, CREATE, upload.single('file'), async (req, res, next) => {
  try {
    const q = parseQuery(req, importQuery);
    if (!req.file) {
      return sendSuccess(res, { error: 'No file uploaded' }, { status: 400 });
    }
    const result = await importMaterials({
      categoryId: q.category_id,
      materialTypeId: q.material_type_id,
      csvBuffer: req.file.buffer,
      onDuplicate: q.on_duplicate as OnDuplicate,
      sourceFilename: req.file.originalname,
      importedBy: req.user?.id,
    });
    sendSuccess(res, result, { status: 201 });
  } catch (err) { next(err); }
});

// ─── batch errors ──────────────────────────────────────────────────────────────

router.get('/import-batches/:id/errors', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, batchIdParam);
    const q = parseQuery(req, errorsQuery);
    const result = await getBatchErrors(id, q.include_resolved === 'true');
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.patch('/import-batches/:id/errors/:errorId', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { errorId } = parseParams(req, batchErrorParam);
    const body = parseBody(req, correctBody);
    const result = await updateImportError(errorId, body.corrected_data);
    sendSuccess(res, { error: result });
  } catch (err) { next(err); }
});

router.post('/import-batches/:id/retry-errors', requireInternal, CREATE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, batchIdParam);
    const result = await retryBatchErrors(id);
    sendSuccess(res, result, { status: 201 });
  } catch (err) { next(err); }
});

router.get('/import-batches/:id/export-errors', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, batchIdParam);
    const csv = await exportBatchErrorsCsv(id);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="import-errors.csv"');
    res.send(csv);
  } catch (err) { next(err); }
});

export default router;
