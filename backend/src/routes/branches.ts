/**
 * Branches CRUD.
 *   GET    /api/branches                  view
 *   POST   /api/branches                  create
 *   GET    /api/branches/:id              view
 *   PUT    /api/branches/:id              edit
 *   DELETE /api/branches/:id              delete  (soft)
 *   POST   /api/branches/:id/reactivate   edit
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  createBranch,
  getBranch,
  listBranches,
  reactivateBranch,
  softDeleteBranch,
  updateBranch,
} from '../services/branches';

const router = Router();
const VIEW   = requirePermission('MASTER_DATA', 'master_data', 'view');
const CREATE = requirePermission('MASTER_DATA', 'master_data', 'create');
const EDIT   = requirePermission('MASTER_DATA', 'master_data', 'edit');
const DELETE = requirePermission('MASTER_DATA', 'master_data', 'delete');

const idParam = z.object({ id: z.string().uuid() });
const listQ = z.object({
  branchType: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
const createBody = z.object({
  branchCode: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  branchType: z.string().min(1),
  gstin: z.string().max(20).optional(),
  addressLine1: z.string().max(255).optional(),
  addressLine2: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().max(100).optional(),
});
const updateBody = z.object({
  name: z.string().min(1).max(200).optional(),
  branchType: z.string().min(1).optional(),
  gstin: z.string().max(20).nullable().optional(),
  addressLine1: z.string().max(255).nullable().optional(),
  addressLine2: z.string().max(255).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  state: z.string().max(100).nullable().optional(),
  postalCode: z.string().max(20).nullable().optional(),
  country: z.string().max(100).optional(),
  isActive: z.boolean().optional(),
});

router.get('/', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, listQ);
    sendSuccess(res, await listBranches({
      branchType: q.branchType,
      isActive: q.isActive === undefined ? undefined : q.isActive === 'true',
      page: q.page,
      limit: q.limit,
    }));
  } catch (err) { next(err); }
});

router.post('/', requireInternal, CREATE, async (req, res, next) => {
  try {
    sendSuccess(res, await createBranch(parseBody(req, createBody)));
  } catch (err) { next(err); }
});

router.get('/:id', requireInternal, VIEW, async (req, res, next) => {
  try {
    sendSuccess(res, await getBranch(parseParams(req, idParam).id));
  } catch (err) { next(err); }
});

router.put('/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    sendSuccess(res, await updateBranch(
      parseParams(req, idParam).id,
      parseBody(req, updateBody),
    ));
  } catch (err) { next(err); }
});

router.delete('/:id', requireInternal, DELETE, async (req, res, next) => {
  try {
    await softDeleteBranch({
      id: parseParams(req, idParam).id,
      actorUserId: req.user!.id,
    });
    sendSuccess(res, { ok: true });
  } catch (err) { next(err); }
});

router.post('/:id/reactivate', requireInternal, EDIT, async (req, res, next) => {
  try {
    sendSuccess(res, await reactivateBranch(parseParams(req, idParam).id));
  } catch (err) { next(err); }
});

export default router;
