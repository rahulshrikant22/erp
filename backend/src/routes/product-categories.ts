import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams } from '../utils/validate';
import {
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  updateCategory,
} from '../services/products';

const router = Router();
const VIEW   = requirePermission('PRODUCT', 'product', 'view');
const CREATE = requirePermission('PRODUCT', 'product', 'create');
const EDIT   = requirePermission('PRODUCT', 'product', 'edit');
const DELETE = requirePermission('PRODUCT', 'product', 'delete');

const idParam = z.object({ id: z.string().uuid() });

const createBody = z.object({
  categoryCode: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  parentCategoryId: z.string().uuid().optional(),
  description: z.string().optional(),
  displayOrder: z.number().int().nonnegative().optional(),
});

const updateBody = z.object({
  name: z.string().min(1).max(200).optional(),
  parentCategoryId: z.string().uuid().nullable().optional(),
  description: z.string().nullable().optional(),
  displayOrder: z.number().int().nonnegative().optional(),
});

router.get('/', requireInternal, VIEW, async (_req, res, next) => {
  try {
    sendSuccess(res, await listCategories());
  } catch (err) { next(err); }
});

router.post('/', requireInternal, CREATE, async (req, res, next) => {
  try {
    sendSuccess(res, await createCategory(parseBody(req, createBody)), { status: 201 });
  } catch (err) { next(err); }
});

router.get('/:id', requireInternal, VIEW, async (req, res, next) => {
  try {
    sendSuccess(res, await getCategory(parseParams(req, idParam).id));
  } catch (err) { next(err); }
});

router.put('/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    sendSuccess(res, await updateCategory(parseParams(req, idParam).id, parseBody(req, updateBody)));
  } catch (err) { next(err); }
});

router.delete('/:id', requireInternal, DELETE, async (req, res, next) => {
  try {
    await deleteCategory(parseParams(req, idParam).id);
    sendSuccess(res, { ok: true });
  } catch (err) { next(err); }
});

export default router;
