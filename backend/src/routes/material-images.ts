/**
 * Material Images endpoints — P2-05.
 *
 *   POST   /api/material/materials/:id/images         — upload images
 *   GET    /api/material/materials/:id/images          — list / gallery
 *   POST   /api/material/materials/:id/clear-pending-image-flag
 *   POST   /api/material/materials/bulk-images         — zip + CSV bulk upload
 *   PUT    /api/material/material-images/:id
 *   DELETE /api/material/material-images/:id
 *   POST   /api/material/material-images/:id/set-primary
 *   GET    /api/admin/material/category-image-rules
 *   PUT    /api/admin/material/category-image-rules/:id
 */
import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  uploadMaterialImages,
  updateMaterialImage,
  deleteMaterialImage,
  setPrimaryImage,
  listMaterialImages,
  listCategoryImageRules,
  updateCategoryImageRule,
  clearPendingImageFlag,
  bulkUploadImages,
} from '../services/material-images';

const materialRouter = Router();
const adminRouter = Router();

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const bulkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

const VIEW = requirePermission('MATERIAL', 'material', 'view');
const CREATE = requirePermission('MATERIAL', 'material', 'create');
const EDIT = requirePermission('MATERIAL', 'material', 'edit');

// ─── schemas ───────────────────────────────────────────────────────────────────

const idParam = z.object({ id: z.string().uuid() });

const uploadQuery = z.object({
  image_type: z.string().min(1),
  is_primary: z.enum(['true', 'false']).optional(),
});

const listImagesQuery = z.object({
  type: z.string().optional(),
});

const updateImageBody = z.object({
  image_type: z.string().min(1).optional(),
  is_primary: z.boolean().optional(),
  display_order: z.number().int().min(0).optional(),
}).strict();

const updateRuleBody = z.object({
  image_requirement: z.string().min(1),
}).strict();

const bulkQuery = z.object({
  image_type: z.string().min(1),
});

// ─── material routes (mounted at /api/material) ────────────────────────────────

// Bulk images — must be before /:id routes
materialRouter.post(
  '/materials/bulk-images',
  requireInternal,
  CREATE,
  bulkUpload.fields([
    { name: 'zip', maxCount: 1 },
    { name: 'mapping', maxCount: 1 },
  ]),
  async (req, res, next) => {
    try {
      const q = parseQuery(req, bulkQuery);
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const zipFile = files?.zip?.[0];
      const mappingFile = files?.mapping?.[0];

      if (!zipFile) return sendSuccess(res, { error: 'No zip file uploaded' }, { status: 400 });
      if (!mappingFile) return sendSuccess(res, { error: 'No mapping CSV uploaded' }, { status: 400 });

      const result = await bulkUploadImages(zipFile.buffer, mappingFile.buffer, q.image_type, req.user?.id);
      sendSuccess(res, result, { status: 201 });
    } catch (err) { next(err); }
  },
);

// Upload images to a material
materialRouter.post('/materials/:id/images', requireInternal, CREATE, imageUpload.array('files', 10), async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const q = parseQuery(req, uploadQuery);
    const files = req.files as Express.Multer.File[] | undefined;

    if (!files || files.length === 0) {
      return sendSuccess(res, { error: 'No files uploaded' }, { status: 400 });
    }

    const images = await uploadMaterialImages({
      materialId: id,
      files: files.map((f) => ({ buffer: f.buffer, originalname: f.originalname, mimetype: f.mimetype })),
      imageType: q.image_type,
      isPrimary: q.is_primary === 'true',
      uploadedBy: req.user?.id,
    });

    sendSuccess(res, { images }, { status: 201 });
  } catch (err) { next(err); }
});

// List images for a material (gallery)
materialRouter.get('/materials/:id/images', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const q = parseQuery(req, listImagesQuery);
    const images = await listMaterialImages(id, q.type);
    sendSuccess(res, { images });
  } catch (err) { next(err); }
});

// Clear pending image flag
materialRouter.post('/materials/:id/clear-pending-image-flag', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const result = await clearPendingImageFlag(id);
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// Update a material image
materialRouter.put('/material-images/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, updateImageBody);
    const result = await updateMaterialImage(id, {
      imageType: body.image_type,
      isPrimary: body.is_primary,
      displayOrder: body.display_order,
    });
    sendSuccess(res, { image: result });
  } catch (err) { next(err); }
});

// Delete a material image
materialRouter.delete('/material-images/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const result = await deleteMaterialImage(id);
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// Set primary image
materialRouter.post('/material-images/:id/set-primary', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const result = await setPrimaryImage(id);
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// ─── admin routes (mounted at /api/admin/material) ─────────────────────────────

adminRouter.get('/category-image-rules', requireInternal, VIEW, async (_req, res, next) => {
  try {
    const rules = await listCategoryImageRules();
    sendSuccess(res, { rules });
  } catch (err) { next(err); }
});

adminRouter.put('/category-image-rules/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, updateRuleBody);
    const rule = await updateCategoryImageRule(id, body.image_requirement);
    sendSuccess(res, { rule });
  } catch (err) { next(err); }
});

export { materialRouter as materialImagesRouter, adminRouter as adminMaterialImagesRouter };
