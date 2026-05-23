/**
 * Role & permission admin endpoints.
 *
 *   GET    /api/roles                              (RBAC:rbac:view)
 *   POST   /api/roles                              (RBAC:rbac:create)
 *   GET    /api/roles/:id                          (RBAC:rbac:view)
 *   PUT    /api/roles/:id                          (RBAC:rbac:edit)
 *   DELETE /api/roles/:id                          (RBAC:rbac:delete)
 *   GET    /api/roles/:id/permissions              (RBAC:rbac:view)
 *   POST   /api/roles/:id/permissions              (RBAC:rbac:edit)
 *   GET    /api/roles/:id/users                    (RBAC:rbac:view)
 *
 *   GET    /api/permissions                        (RBAC:rbac:view) — registry
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  createRole,
  getRole,
  getRolePermissions,
  getRoleUsers,
  listRoles,
  setRolePermissions,
  softDeleteRole,
  updateRole,
} from '../services/roles';

const router = Router();
const VIEW   = requirePermission('RBAC', 'rbac', 'view');
const CREATE = requirePermission('RBAC', 'rbac', 'create');
const EDIT   = requirePermission('RBAC', 'rbac', 'edit');
const DELETE = requirePermission('RBAC', 'rbac', 'delete');

const idParam = z.object({ id: z.string().uuid() });
const listQ = z.object({
  isActive: z.enum(['true', 'false']).optional(),
  isSystemRole: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
const usersListQ = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const createBody = z.object({
  roleCode: z.string().min(1).max(50).regex(/^[a-z][a-z0-9_]*$/, 'lowercase, digits, _ only'),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
});
const updateBody = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  isActive: z.boolean().optional(),
});

const assignmentsBody = z.object({
  assignments: z.array(
    z
      .object({
        permissionId: z.string().uuid().optional(),
        permissionCode: z.string().min(1).optional(),
        scopeFilter: z.record(z.string(), z.unknown()).nullable().optional(),
      })
      .refine((v) => v.permissionId || v.permissionCode, {
        message: 'permissionId or permissionCode required',
      }),
  ),
});

router.get('/', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, listQ);
    sendSuccess(res, await listRoles({
      isActive: q.isActive === undefined ? undefined : q.isActive === 'true',
      isSystemRole: q.isSystemRole === undefined ? undefined : q.isSystemRole === 'true',
      page: q.page,
      limit: q.limit,
    }));
  } catch (err) { next(err); }
});

router.post('/', requireInternal, CREATE, async (req, res, next) => {
  try {
    sendSuccess(res, await createRole(parseBody(req, createBody)));
  } catch (err) { next(err); }
});

router.get('/:id', requireInternal, VIEW, async (req, res, next) => {
  try {
    sendSuccess(res, await getRole(parseParams(req, idParam).id));
  } catch (err) { next(err); }
});

router.put('/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    sendSuccess(res, await updateRole(
      parseParams(req, idParam).id,
      parseBody(req, updateBody),
    ));
  } catch (err) { next(err); }
});

router.delete('/:id', requireInternal, DELETE, async (req, res, next) => {
  try {
    await softDeleteRole(parseParams(req, idParam).id);
    sendSuccess(res, { ok: true });
  } catch (err) { next(err); }
});

router.get('/:id/permissions', requireInternal, VIEW, async (req, res, next) => {
  try {
    sendSuccess(res, {
      permissions: await getRolePermissions(parseParams(req, idParam).id),
    });
  } catch (err) { next(err); }
});

router.post('/:id/permissions', requireInternal, EDIT, async (req, res, next) => {
  try {
    const body = parseBody(req, assignmentsBody);
    sendSuccess(res, {
      permissions: await setRolePermissions(parseParams(req, idParam).id, body.assignments),
    });
  } catch (err) { next(err); }
});

router.get('/:id/users', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, usersListQ);
    sendSuccess(res, await getRoleUsers(parseParams(req, idParam).id, q.page, q.limit));
  } catch (err) { next(err); }
});

export default router;
