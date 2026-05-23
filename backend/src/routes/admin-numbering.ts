/**
 * Admin numbering series routes.
 *
 *   GET    /api/admin/numbering-series
 *   POST   /api/admin/numbering-series
 *   PUT    /api/admin/numbering-series/:id
 *   POST   /api/admin/numbering-series/:id/reset
 *   GET    /api/admin/numbering-series/:code/preview
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  createNumberingSeries,
  listNumberingSeries,
  previewNextNumber,
  resetNumberingSeries,
  updateNumberingSeries,
} from '../services/numbering';
import { sendSuccess } from '../utils/response';
import { parseBody } from '../utils/validate';
import { requireInternal } from '../middleware/auth';

const router = Router();

const createSchema = z.object({
  seriesCode: z.string().min(1).max(20),
  name: z.string().min(1),
  prefix: z.string().optional(),
  yearFormat: z.enum(['YYYY', 'YY', 'FY', 'FYSHORT', 'none']).default('YYYY'),
  separator: z.string().max(3).default('/'),
  paddingLength: z.number().int().min(1).max(10).default(4),
  resetYearly: z.boolean().default(true),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  prefix: z.string().optional(),
  yearFormat: z.enum(['YYYY', 'YY', 'FY', 'FYSHORT', 'none']).optional(),
  separator: z.string().max(3).optional(),
  paddingLength: z.number().int().min(1).max(10).optional(),
  resetYearly: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

router.get('/numbering-series', requireInternal, async (_req, res, next) => {
  try {
    const series = await listNumberingSeries();
    sendSuccess(res, { series });
  } catch (err) { next(err); }
});

router.post('/numbering-series', requireInternal, async (req, res, next) => {
  try {
    const input = parseBody(req, createSchema);
    const series = await createNumberingSeries({ ...input, createdById: req.user!.id });
    sendSuccess(res, series, { status: 201 });
  } catch (err) { next(err); }
});

router.put('/numbering-series/:id', requireInternal, async (req, res, next) => {
  try {
    const input = parseBody(req, updateSchema);
    const series = await updateNumberingSeries(req.params.id, { ...input, updatedById: req.user!.id });
    sendSuccess(res, series);
  } catch (err) { next(err); }
});

router.post('/numbering-series/:id/reset', requireInternal, async (req, res, next) => {
  try {
    const series = await resetNumberingSeries(req.params.id, req.user!.id);
    sendSuccess(res, series);
  } catch (err) { next(err); }
});

router.get('/numbering-series/:code/preview', requireInternal, async (req, res, next) => {
  try {
    const preview = await previewNextNumber(req.params.code);
    sendSuccess(res, { preview });
  } catch (err) { next(err); }
});

export default router;
