/**
 * Admin user-management routes.
 *
 *   POST   /api/users                                 (AUTH:users:create)
 *   GET    /api/users                                 (AUTH:users:view)
 *   GET    /api/users/:id                             (AUTH:users:view)
 *   PUT    /api/users/:id                             (AUTH:users:edit)
 *   DELETE /api/users/:id                             (AUTH:users:delete)
 *   POST   /api/users/:id/reactivate                  (AUTH:users:edit)
 *   POST   /api/users/:id/lock                        (AUTH:users:edit)
 *   POST   /api/users/:id/unlock                      (AUTH:users:edit)
 *   POST   /api/users/:id/reset-password              (AUTH:users:reset_password)
 *   POST   /api/users/:id/force-logout                (AUTH:users:edit)
 *   POST   /api/users/:id/roles                       (AUTH:users:manage_roles)
 *   POST   /api/users/:id/permission-overrides        (AUTH:users:manage_permissions)
 *           — alias for /api/rbac/users/:id/permission-overrides
 *   GET    /api/users/:id/audit-trail                 (AUTH:users:view)
 *   POST   /api/users/import                          (AUTH:users:create) — multipart CSV
 */
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  adminResetPassword,
  assignRoles,
  createUser,
  forceLogout,
  getUser,
  getUserAuditTrail,
  importUsersCsv,
  listUsers,
  lockUser,
  reactivateUser,
  softDeleteUser,
  unlockUser,
  updateUser,
} from '../services/users';
import { invalidateUser as invalidateRbacCache } from '../services/permissions';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';

const router = Router();

// Multer: in-memory only — CSV is parsed inline. 5 MB cap is plenty for
// onboarding-scale imports.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const idParam = z.object({ id: z.string().uuid() });

const createBody = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  employeeCode: z.string().min(1).max(50).optional(),
  phone: z.string().min(1).max(20).optional(),
  branchId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  designationId: z.string().uuid().optional(),
  roleCodes: z.array(z.string().min(1)).optional(),
});

const updateBody = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().min(1).max(20).nullable().optional(),
  branchId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  designationId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

const listQuery = z.object({
  search: z.string().optional(),
  branchId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  roleId: z.string().uuid().optional(),
  isActive: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const lockBody = z
  .object({
    durationMinutes: z.coerce.number().int().positive().optional(),
    reason: z.string().max(500).optional(),
  })
  .strict();

const rolesBody = z.object({
  roleCodes: z.array(z.string().min(1)),
});

const overrideBody = z.object({
  permissionCode: z.string().min(1),
  grantType: z.enum(['allow', 'deny']),
  reason: z.string().max(500).optional(),
  expiresAt: z.string().datetime().optional(),
});

// -- routes --------------------------------------------------------------

router.post(
  '/',
  requireInternal,
  requirePermission('AUTH', 'users', 'create'),
  async (req, res, next) => {
    try {
      const body = parseBody(req, createBody);
      const result = await createUser(body);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/',
  requireInternal,
  requirePermission('AUTH', 'users', 'view'),
  async (req, res, next) => {
    try {
      const q = parseQuery(req, listQuery);
      const result = await listUsers({
        search: q.search,
        branchId: q.branchId,
        departmentId: q.departmentId,
        roleId: q.roleId,
        isActive: q.isActive === undefined ? undefined : q.isActive === 'true',
        page: q.page,
        limit: q.limit,
      });
      sendSuccess(res, {
        ...result,
        users: result.users.map((u) => ({
          ...u,
          lockedUntil: u.lockedUntil?.toISOString() ?? null,
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
          createdAt: u.createdAt.toISOString(),
          updatedAt: u.updatedAt.toISOString(),
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// `import` is a fixed path that must be registered BEFORE the parameterised
// `/:id` routes — otherwise Express matches it as `:id = "import"`.
router.post(
  '/import',
  requireInternal,
  requirePermission('AUTH', 'users', 'create'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      const file = req.file;
      if (!file) {
        throw new ValidationError(
          'No file uploaded — expected multipart/form-data with field "file"',
        );
      }
      const result = await importUsersCsv(file.buffer);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id',
  requireInternal,
  requirePermission('AUTH', 'users', 'view'),
  async (req, res, next) => {
    try {
      const { id } = parseParams(req, idParam);
      const u = await getUser(id);
      sendSuccess(res, {
        ...u,
        lockedUntil: u.lockedUntil?.toISOString() ?? null,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/:id',
  requireInternal,
  requirePermission('AUTH', 'users', 'edit'),
  async (req, res, next) => {
    try {
      const { id } = parseParams(req, idParam);
      const body = parseBody(req, updateBody);
      const u = await updateUser(id, body);
      sendSuccess(res, u);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:id',
  requireInternal,
  requirePermission('AUTH', 'users', 'delete'),
  async (req, res, next) => {
    try {
      const { id } = parseParams(req, idParam);
      await softDeleteUser({ userId: id, actorUserId: req.user!.id });
      sendSuccess(res, { ok: true });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/reactivate',
  requireInternal,
  requirePermission('AUTH', 'users', 'edit'),
  async (req, res, next) => {
    try {
      const { id } = parseParams(req, idParam);
      sendSuccess(res, await reactivateUser(id));
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/lock',
  requireInternal,
  requirePermission('AUTH', 'users', 'edit'),
  async (req, res, next) => {
    try {
      const { id } = parseParams(req, idParam);
      const body = parseBody(req, lockBody);
      sendSuccess(res, await lockUser({ userId: id, ...body }));
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/unlock',
  requireInternal,
  requirePermission('AUTH', 'users', 'edit'),
  async (req, res, next) => {
    try {
      const { id } = parseParams(req, idParam);
      sendSuccess(res, await unlockUser(id));
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/reset-password',
  requireInternal,
  requirePermission('AUTH', 'users', 'reset_password'),
  async (req, res, next) => {
    try {
      const { id } = parseParams(req, idParam);
      sendSuccess(res, await adminResetPassword(id));
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/force-logout',
  requireInternal,
  requirePermission('AUTH', 'users', 'edit'),
  async (req, res, next) => {
    try {
      const { id } = parseParams(req, idParam);
      sendSuccess(res, await forceLogout(id));
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/roles',
  requireInternal,
  requirePermission('AUTH', 'users', 'manage_roles'),
  async (req, res, next) => {
    try {
      const { id } = parseParams(req, idParam);
      const body = parseBody(req, rolesBody);
      sendSuccess(res, await assignRoles({ userId: id, roleCodes: body.roleCodes }));
    } catch (err) {
      next(err);
    }
  },
);

// Alias of the RBAC route, behind the more restrictive AUTH:users:manage_permissions
// permission so admins (who have RBAC:rbac:edit) cannot grant overrides via this
// path — only super_admins can. Permission spec for spec parity.
router.post(
  '/:id/permission-overrides',
  requireInternal,
  requirePermission('AUTH', 'users', 'manage_permissions'),
  async (req, res, next) => {
    try {
      const { id } = parseParams(req, idParam);
      const body = parseBody(req, overrideBody);

      const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
      if (!user) throw new NotFoundError('User not found');

      const permission = await prisma.permission.findUnique({
        where: { permissionCode: body.permissionCode },
        select: { id: true, permissionCode: true },
      });
      if (!permission) {
        throw new ValidationError('Unknown permission code', {
          field: 'permissionCode',
          value: body.permissionCode,
        });
      }

      const created = await prisma.userPermissionOverride.upsert({
        where: { userId_permissionId: { userId: id, permissionId: permission.id } },
        update: {
          grantType: body.grantType,
          reason: body.reason,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          createdById: req.user!.id,
        },
        create: {
          userId: id,
          permissionId: permission.id,
          grantType: body.grantType,
          reason: body.reason,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          createdById: req.user!.id,
        },
      });

      invalidateRbacCache(id);
      sendSuccess(res, {
        id: created.id,
        userId: id,
        permissionCode: permission.permissionCode,
        grantType: created.grantType,
        reason: created.reason,
        expiresAt: created.expiresAt?.toISOString() ?? null,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id/audit-trail',
  requireInternal,
  requirePermission('AUTH', 'users', 'view'),
  async (req, res, next) => {
    try {
      const { id } = parseParams(req, idParam);
      const result = await getUserAuditTrail(id);
      sendSuccess(res, {
        logs: result.logs.map((l) => ({ ...l, actionAt: l.actionAt.toISOString() })),
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
