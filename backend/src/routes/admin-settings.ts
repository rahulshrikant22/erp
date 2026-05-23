/**
 * Admin system settings routes.
 *
 *   GET    /api/admin/settings
 *   GET    /api/admin/settings/categories
 *   GET    /api/admin/settings/:key
 *   PUT    /api/admin/settings/:key
 *   POST   /api/admin/settings
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  createSetting,
  getSetting,
  listCategories,
  listSettings,
  setSetting,
} from '../services/settings';
import { sendSuccess } from '../utils/response';
import { parseBody } from '../utils/validate';
import { requireInternal } from '../middleware/auth';

const router = Router();

const updateSchema = z.object({
  value: z.unknown(),
});

const createSchema = z.object({
  settingKey: z.string().min(1),
  settingValue: z.unknown().optional(),
  dataType: z.enum(['string', 'integer', 'boolean', 'json']),
  category: z.string().optional(),
  description: z.string().optional(),
  isUserEditable: z.boolean().default(true),
});

router.get('/settings', requireInternal, async (req, res, next) => {
  try {
    const { category, search } = req.query;
    const settings = await listSettings({
      category: category as string | undefined,
      search: search as string | undefined,
    });
    sendSuccess(res, { settings });
  } catch (err) { next(err); }
});

router.get('/settings/categories', requireInternal, async (_req, res, next) => {
  try {
    const categories = await listCategories();
    sendSuccess(res, { categories });
  } catch (err) { next(err); }
});

router.get('/settings/:key', requireInternal, async (req, res, next) => {
  try {
    const value = await getSetting(req.params.key);
    sendSuccess(res, { key: req.params.key, value });
  } catch (err) { next(err); }
});

router.put('/settings/:key', requireInternal, async (req, res, next) => {
  try {
    const { value } = parseBody(req, updateSchema);
    const setting = await setSetting(req.params.key, value, req.user!.id);
    sendSuccess(res, setting);
  } catch (err) { next(err); }
});

router.post('/settings', requireInternal, async (req, res, next) => {
  try {
    const input = parseBody(req, createSchema);
    const setting = await createSetting({ ...input, createdById: req.user!.id });
    sendSuccess(res, setting, { status: 201 });
  } catch (err) { next(err); }
});

export default router;
