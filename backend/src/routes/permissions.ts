/**
 * Permission registry — read-only.
 *
 *   GET /api/permissions?module=ORDER         (RBAC:rbac:view)
 *
 * Lists every permission in core.permissions. The frontend uses this to
 * power the role-permissions-editor picker.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseQuery } from '../utils/validate';
import { listAllPermissions } from '../services/roles';

const router = Router();

const listQ = z.object({ module: z.string().optional() });

router.get(
  '/',
  requireInternal,
  requirePermission('RBAC', 'rbac', 'view'),
  async (req, res, next) => {
    try {
      const q = parseQuery(req, listQ);
      sendSuccess(res, await listAllPermissions({ module: q.module }));
    } catch (err) {
      next(err);
    }
  },
);

export default router;
