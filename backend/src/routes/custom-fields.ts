/**
 * Custom field definitions — admin CRUD.
 *
 *   GET    /api/admin/custom-fields?entity=&isActive=    (CUSTOM_FIELDS:custom_fields:view)
 *   POST   /api/admin/custom-fields                      (CUSTOM_FIELDS:custom_fields:create)
 *   GET    /api/admin/custom-fields/:id                  (CUSTOM_FIELDS:custom_fields:view)
 *   PUT    /api/admin/custom-fields/:id                  (CUSTOM_FIELDS:custom_fields:edit)
 *   DELETE /api/admin/custom-fields/:id?force=true       (CUSTOM_FIELDS:custom_fields:delete)
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  createCustomField,
  deleteCustomField,
  getCustomField,
  listCustomFields,
  updateCustomField,
} from '../services/custom-fields';

const router = Router();
const VIEW   = requirePermission('CUSTOM_FIELDS', 'custom_fields', 'view');
const CREATE = requirePermission('CUSTOM_FIELDS', 'custom_fields', 'create');
const EDIT   = requirePermission('CUSTOM_FIELDS', 'custom_fields', 'edit');
const DELETE = requirePermission('CUSTOM_FIELDS', 'custom_fields', 'delete');

const idParam = z.object({ id: z.string().uuid() });
const listQ = z.object({
  entity: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

const optionSchema = z.object({
  value: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
});

const createBody = z.object({
  targetEntity: z.string().min(1).max(100),
  fieldCode: z.string().min(1).max(50),
  label: z.string().min(1).max(200),
  fieldType: z.string().min(1),
  isRequired: z.boolean().optional(),
  options: z.array(optionSchema).optional(),
  validationRules: z.record(z.string(), z.unknown()).optional(),
  displayOrder: z.number().int().min(0).optional(),
});

const updateBody = z.object({
  label: z.string().min(1).max(200).optional(),
  isRequired: z.boolean().optional(),
  options: z.array(optionSchema).optional(),
  validationRules: z.record(z.string(), z.unknown()).optional(),
  displayOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const deleteQ = z.object({ force: z.enum(['true', 'false']).optional() });

router.get('/', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, listQ);
    sendSuccess(res, {
      fields: await listCustomFields({
        targetEntity: q.entity,
        isActive: q.isActive === undefined ? undefined : q.isActive === 'true',
      }),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireInternal, CREATE, async (req, res, next) => {
  try {
    sendSuccess(res, await createCustomField(parseBody(req, createBody)));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireInternal, VIEW, async (req, res, next) => {
  try {
    sendSuccess(res, await getCustomField(parseParams(req, idParam).id));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    sendSuccess(res, await updateCustomField(
      parseParams(req, idParam).id,
      parseBody(req, updateBody),
    ));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireInternal, DELETE, async (req, res, next) => {
  try {
    const q = parseQuery(req, deleteQ);
    sendSuccess(res, await deleteCustomField({
      id: parseParams(req, idParam).id,
      force: q.force === 'true',
    }));
  } catch (err) {
    next(err);
  }
});

export default router;
