/**
 * Field visibility admin endpoints.
 *
 *   GET    /api/admin/field-visibility?entity=&role=    (CUSTOM_FIELDS:custom_fields:view)
 *   POST   /api/admin/field-visibility/bulk             (CUSTOM_FIELDS:custom_fields:edit)
 *   PUT    /api/admin/field-visibility/:id              (CUSTOM_FIELDS:custom_fields:edit)
 *   DELETE /api/admin/field-visibility/:id              (CUSTOM_FIELDS:custom_fields:delete)
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  bulkUpsertVisibility,
  deleteVisibility,
  listFieldVisibility,
  updateVisibility,
} from '../services/field-visibility';

const router = Router();
const VIEW   = requirePermission('CUSTOM_FIELDS', 'custom_fields', 'view');
const EDIT   = requirePermission('CUSTOM_FIELDS', 'custom_fields', 'edit');
const DELETE = requirePermission('CUSTOM_FIELDS', 'custom_fields', 'delete');

const listQ = z.object({
  entity: z.string().optional(),
  role: z.string().uuid().optional(),
});
const idParam = z.object({ id: z.string().uuid() });
const bulkBody = z.object({
  roleId: z.string().uuid(),
  targetEntity: z.string().min(1).max(100),
  entries: z.array(
    z.object({
      fieldCode: z.string().min(1).max(100),
      visibility: z.enum(['visible', 'readonly', 'hidden']),
      displayOrder: z.number().int().min(0).optional(),
    }),
  ),
});
const updateBody = z.object({
  visibility: z.enum(['visible', 'readonly', 'hidden']).optional(),
  displayOrder: z.number().int().min(0).optional(),
});

router.get('/', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, listQ);
    sendSuccess(res, {
      rows: await listFieldVisibility({ targetEntity: q.entity, roleId: q.role }),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/bulk', requireInternal, EDIT, async (req, res, next) => {
  try {
    const body = parseBody(req, bulkBody);
    sendSuccess(res, { rows: await bulkUpsertVisibility(body) });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    sendSuccess(res, await updateVisibility({
      id: parseParams(req, idParam).id,
      ...parseBody(req, updateBody),
    }));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireInternal, DELETE, async (req, res, next) => {
  try {
    await deleteVisibility(parseParams(req, idParam).id);
    sendSuccess(res, { ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
