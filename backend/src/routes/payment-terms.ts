import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams } from '../utils/validate';
import {
  createPaymentTermsTemplate,
  getPaymentTermsTemplate,
  listPaymentTermsTemplates,
  updatePaymentTermsTemplate,
} from '../services/payment-terms';

const router = Router();
const VIEW = requirePermission('ORDER', 'order', 'view');
const MANAGE = requirePermission('ORDER', 'order', 'create');

const idParam = z.object({ id: z.string().uuid() });

const createBody = z.object({
  templateCode: z.string().min(1),
  templateName: z.string().min(1),
  description: z.string().optional(),
  milestones: z.array(z.object({
    milestoneName: z.string().min(1),
    percentage: z.number().min(0).max(100),
    triggerEvent: z.enum(['on_order', 'before_dispatch', 'on_delivery', 'after_installation', 'fixed_days']),
    triggerDays: z.number().int().positive().optional(),
    notes: z.string().optional(),
  })).min(1),
});

const updateBody = z.object({
  templateName: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

router.get('/', requireInternal, VIEW, async (_req, res, next) => {
  try {
    sendSuccess(res, await listPaymentTermsTemplates());
  } catch (err) { next(err); }
});

router.post('/', requireInternal, MANAGE, async (req, res, next) => {
  try {
    sendSuccess(res, await createPaymentTermsTemplate(parseBody(req, createBody)), { status: 201 });
  } catch (err) { next(err); }
});

router.get('/:id', requireInternal, VIEW, async (req, res, next) => {
  try {
    sendSuccess(res, await getPaymentTermsTemplate(parseParams(req, idParam).id));
  } catch (err) { next(err); }
});

router.put('/:id', requireInternal, MANAGE, async (req, res, next) => {
  try {
    sendSuccess(res, await updatePaymentTermsTemplate(parseParams(req, idParam).id, parseBody(req, updateBody)));
  } catch (err) { next(err); }
});

export default router;
