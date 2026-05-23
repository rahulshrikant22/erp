/**
 * RBAC admin endpoints (internal users only, gated by RBAC:rbac:view/edit).
 *
 *   GET  /api/rbac/users/:id/permissions
 *        → effective permission set + active/inactive modules + principal context
 *
 *   GET  /api/rbac/users/:id/permissions/check
 *        ?module=ORDER&feature=order&action=approve&targetEntity=order
 *        → { allowed, reason, dataFilter, fieldRestrictions }
 *
 *   POST /api/rbac/users/:id/permission-overrides
 *        body: { permissionCode, grantType: 'allow'|'deny', reason?, expiresAt? }
 *        → upserts; invalidates the user's cache
 *
 *   DELETE /api/rbac/users/:id/permission-overrides/:permissionCode
 *        → removes the override; invalidates cache
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import { NotFoundError, ValidationError } from '../errors';
import {
  getEffectivePermissions,
  invalidateUser,
  resolvePermission,
} from '../services/permissions';

const router = Router();

const idParam = z.object({ id: z.string().uuid() });
const overrideKeyParam = z.object({
  id: z.string().uuid(),
  permissionCode: z.string().min(1),
});

const checkQuery = z.object({
  module: z.string().min(1),
  feature: z.string().min(1),
  action: z.string().min(1),
  targetEntity: z.string().optional(),
});

const overrideBody = z.object({
  permissionCode: z.string().min(1),
  grantType: z.enum(['allow', 'deny']),
  reason: z.string().max(500).optional(),
  expiresAt: z.string().datetime().optional(),
});

router.get(
  '/users/:id/permissions',
  requireInternal,
  requirePermission('RBAC', 'rbac', 'view'),
  async (req, res, next) => {
    try {
      const { id } = parseParams(req, idParam);
      const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new NotFoundError('User not found');

      const summary = await getEffectivePermissions(id);
      sendSuccess(res, summary);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/users/:id/permissions/check',
  requireInternal,
  requirePermission('RBAC', 'rbac', 'view'),
  async (req, res, next) => {
    try {
      const { id } = parseParams(req, idParam);
      const q = parseQuery(req, checkQuery);

      const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new NotFoundError('User not found');

      const result = await resolvePermission({
        userId: id,
        moduleCode: q.module,
        feature: q.feature,
        action: q.action,
        targetEntity: q.targetEntity,
      });
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/users/:id/permission-overrides',
  requireInternal,
  requirePermission('RBAC', 'rbac', 'edit'),
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

      invalidateUser(id);
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

router.delete(
  '/users/:id/permission-overrides/:permissionCode',
  requireInternal,
  requirePermission('RBAC', 'rbac', 'edit'),
  async (req, res, next) => {
    try {
      const { id, permissionCode } = parseParams(req, overrideKeyParam);

      const permission = await prisma.permission.findUnique({
        where: { permissionCode },
        select: { id: true },
      });
      if (!permission) {
        throw new NotFoundError('Permission code not found');
      }

      await prisma.userPermissionOverride.deleteMany({
        where: { userId: id, permissionId: permission.id },
      });
      invalidateUser(id);
      sendSuccess(res, { ok: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
