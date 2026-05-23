/**
 * Designations CRUD.
 *   GET    /api/designations
 *   POST   /api/designations
 *   GET    /api/designations/:id
 *   PUT    /api/designations/:id
 *   DELETE /api/designations/:id
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  createDesignation,
  deleteDesignation,
  getDesignation,
  listDesignations,
  updateDesignation,
} from '../services/designations';

const router = Router();
const VIEW   = requirePermission('MASTER_DATA', 'master_data', 'view');
const CREATE = requirePermission('MASTER_DATA', 'master_data', 'create');
const EDIT   = requirePermission('MASTER_DATA', 'master_data', 'edit');
const DELETE = requirePermission('MASTER_DATA', 'master_data', 'delete');

const idParam = z.object({ id: z.string().uuid() });
const listQ = z.object({
  departmentId: z.string().uuid().optional(),
  isActive: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
const createBody = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  departmentId: z.string().uuid().optional(),
  level: z.number().int().min(0).max(20).optional(),
});
const updateBody = z.object({
  name: z.string().min(1).max(200).optional(),
  departmentId: z.string().uuid().nullable().optional(),
  level: z.number().int().min(0).max(20).nullable().optional(),
  isActive: z.boolean().optional(),
});

router.get('/', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, listQ);
    sendSuccess(res, await listDesignations({
      departmentId: q.departmentId,
      isActive: q.isActive === undefined ? undefined : q.isActive === 'true',
      page: q.page,
      limit: q.limit,
    }));
  } catch (err) { next(err); }
});

router.post('/', requireInternal, CREATE, async (req, res, next) => {
  try {
    sendSuccess(res, await createDesignation(parseBody(req, createBody)));
  } catch (err) { next(err); }
});

router.get('/:id', requireInternal, VIEW, async (req, res, next) => {
  try {
    sendSuccess(res, await getDesignation(parseParams(req, idParam).id));
  } catch (err) { next(err); }
});

router.put('/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    sendSuccess(res, await updateDesignation(
      parseParams(req, idParam).id,
      parseBody(req, updateBody),
    ));
  } catch (err) { next(err); }
});

router.delete('/:id', requireInternal, DELETE, async (req, res, next) => {
  try {
    await deleteDesignation(parseParams(req, idParam).id);
    sendSuccess(res, { ok: true });
  } catch (err) { next(err); }
});

export default router;
