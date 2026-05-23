/**
 * Module registry endpoints.
 *
 *   GET  /api/modules                          (MOD_MGMT:mod_mgmt:view)
 *   GET  /api/modules/growth-path              (MOD_MGMT:mod_mgmt:view)
 *   GET  /api/modules/:code                    (MOD_MGMT:mod_mgmt:view)
 *   GET  /api/modules/:code/dependents         (MOD_MGMT:mod_mgmt:view)
 *   POST /api/modules/:code/activate           (MOD_MGMT:mod_mgmt:edit)
 *   POST /api/modules/:code/deactivate         (MOD_MGMT:mod_mgmt:edit)
 *
 * IMPORTANT: `/growth-path` must be registered BEFORE the parameterised
 * `/:code` routes — otherwise Express matches it as `:code = "growth-path"`.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  activateModule,
  deactivateModule,
  getDependents,
  getGrowthPath,
  getModule,
  listModules,
} from '../services/modules';

const router = Router();

const codeParam = z.object({ code: z.string().min(1).regex(/^[A-Z][A-Z0-9_]*$/) });
const listQuery = z.object({
  active: z.enum(['true', 'false']).optional(),
  category: z.string().optional(),
});
const toggleBody = z
  .object({
    reason: z.string().max(500).optional(),
  })
  .strict();

const VIEW = requirePermission('MOD_MGMT', 'mod_mgmt', 'view');
const EDIT = requirePermission('MOD_MGMT', 'mod_mgmt', 'edit');

router.get('/', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, listQuery);
    const out = await listModules({
      active: q.active === undefined ? undefined : q.active === 'true',
      category: q.category,
    });
    sendSuccess(res, {
      modules: out.map((m) => ({
        ...m,
        activatedAt: m.activatedAt?.toISOString() ?? null,
        deactivatedAt: m.deactivatedAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/growth-path', requireInternal, VIEW, async (_req, res, next) => {
  try {
    sendSuccess(res, { stages: await getGrowthPath() });
  } catch (err) {
    next(err);
  }
});

router.get('/:code', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { code } = parseParams(req, codeParam);
    const m = await getModule(code);
    sendSuccess(res, {
      ...m,
      activatedAt: m.activatedAt?.toISOString() ?? null,
      deactivatedAt: m.deactivatedAt?.toISOString() ?? null,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:code/dependents', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { code } = parseParams(req, codeParam);
    sendSuccess(res, { dependents: await getDependents(code) });
  } catch (err) {
    next(err);
  }
});

router.post('/:code/activate', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { code } = parseParams(req, codeParam);
    const body = parseBody(req, toggleBody);
    const r = await activateModule({
      moduleCode: code,
      actorUserId: req.user!.id,
      reason: body.reason,
    });
    sendSuccess(res, r);
  } catch (err) {
    next(err);
  }
});

router.post('/:code/deactivate', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { code } = parseParams(req, codeParam);
    const body = parseBody(req, toggleBody);
    const r = await deactivateModule({
      moduleCode: code,
      actorUserId: req.user!.id,
      reason: body.reason,
    });
    sendSuccess(res, r);
  } catch (err) {
    next(err);
  }
});

export default router;
