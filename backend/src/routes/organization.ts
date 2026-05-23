/**
 * Organization (singleton) + logo upload.
 *
 *   GET   /api/organization                  (MASTER_DATA:master_data:view)
 *   PUT   /api/organization                  (MASTER_DATA:master_data:edit)
 *   POST  /api/organization/logo  multipart  (MASTER_DATA:master_data:edit)
 */
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody } from '../utils/validate';
import { ValidationError } from '../errors';
import {
  getOrganization,
  updateOrganization,
  uploadLogo,
} from '../services/organization';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB cap for logos
});

const VIEW = requirePermission('MASTER_DATA', 'master_data', 'view');
const EDIT = requirePermission('MASTER_DATA', 'master_data', 'edit');

const updateBody = z.object({
  name: z.string().min(1).max(200).optional(),
  legalName: z.string().max(200).nullable().optional(),
  gstin: z.string().max(20).nullable().optional(),
  pan: z.string().max(20).nullable().optional(),
  registeredAddress: z.record(z.string(), z.unknown()).nullable().optional(),
  billingAddress: z.record(z.string(), z.unknown()).nullable().optional(),
  primaryEmail: z.string().email().nullable().optional(),
  primaryPhone: z.string().max(20).nullable().optional(),
  financialYearStartMonth: z.number().int().min(1).max(12).optional(),
  defaultCurrency: z.string().length(3).optional(),
  timezone: z.string().min(1).max(64).optional(),
});

router.get('/', requireInternal, VIEW, async (_req, res, next) => {
  try {
    const org = await getOrganization();
    sendSuccess(res, {
      ...org,
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

router.put('/', requireInternal, EDIT, async (req, res, next) => {
  try {
    const body = parseBody(req, updateBody);
    const updated = await updateOrganization(body);
    sendSuccess(res, {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/logo',
  requireInternal,
  EDIT,
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new ValidationError(
          'No file uploaded — expected multipart/form-data with field "file"',
        );
      }
      const result = await uploadLogo({
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname,
        uploadedById: req.user!.id,
      });
      sendSuccess(res, {
        ...result,
        createdAt: result.createdAt.toISOString(),
        updatedAt: result.updatedAt.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
