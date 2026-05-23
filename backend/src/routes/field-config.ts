/**
 * Combined field metadata for a single entity, scoped to the calling user.
 *
 *   GET /api/entities/:entityType/field-config
 *
 * Returns:
 *   - customFields: definitions admins have added for this entity
 *   - visibility:   per-field visibility for the calling user (most-permissive
 *                   merge across the user's active roles)
 *
 * The frontend calls this once per form-render to know which fields to show
 * and whether each is editable.
 *
 * Auth required (any internal user). No additional permission gate — every
 * authenticated user needs to know their own visibility map to render forms;
 * we don't leak other users' rules here.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { sendSuccess } from '../utils/response';
import { parseParams } from '../utils/validate';
import { listCustomFields } from '../services/custom-fields';
import { computeVisibilityForUser } from '../services/field-visibility';

const router = Router();

const params = z.object({
  entityType: z.string().min(1).max(100),
});

router.get('/:entityType/field-config', requireInternal, async (req, res, next) => {
  try {
    const { entityType } = parseParams(req, params);
    const [fields, visibility] = await Promise.all([
      listCustomFields({ targetEntity: entityType, isActive: true }),
      computeVisibilityForUser(req.user!.id, entityType),
    ]);
    sendSuccess(res, {
      entityType,
      customFields: fields,
      visibility,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
