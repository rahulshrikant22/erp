/**
 * Email-provider admin endpoints.
 *
 *   GET    /api/admin/email-providers
 *   POST   /api/admin/email-providers                    (configure)
 *   PUT    /api/admin/email-providers/:id
 *   DELETE /api/admin/email-providers/:id
 *   PUT    /api/admin/email-providers/:id/set-primary
 *   POST   /api/admin/email-providers/:id/test           (sends a test email)
 *
 * Permission: COMM:comm:view / create / edit / delete (already seeded).
 */
import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams } from '../utils/validate';
import { ValidationError } from '../errors';
import {
  createProvider,
  deleteProvider,
  listProviders,
  setPrimaryProvider,
  testProvider,
  updateProvider,
} from '../services/communication/email-service';
import { isSupportedProvider, SUPPORTED_PROVIDERS } from '../services/communication/providers/factory';

const router = Router();
const VIEW   = requirePermission('COMM', 'comm', 'view');
const CREATE = requirePermission('COMM', 'comm', 'create');
const EDIT   = requirePermission('COMM', 'comm', 'edit');
const DELETE = requirePermission('COMM', 'comm', 'delete');

const idParam = z.object({ id: z.string().uuid() });
const createBody = z.object({
  providerName: z.string().min(1).max(200),
  providerCode: z.string().min(1).max(50),
  configuration: z.record(z.string(), z.unknown()).default({}),
  fromEmail: z.string().email(),
  fromName: z.string().max(200).optional(),
  isPrimary: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
const updateBody = z.object({
  providerName: z.string().min(1).max(200).optional(),
  configuration: z.record(z.string(), z.unknown()).optional(),
  fromEmail: z.string().email().optional(),
  fromName: z.string().max(200).nullable().optional(),
  isActive: z.boolean().optional(),
});
const testBody = z.object({ to: z.string().email() });

router.get('/', requireInternal, VIEW, async (_req, res, next) => {
  try {
    sendSuccess(res, {
      providers: (await listProviders()).map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      supported: SUPPORTED_PROVIDERS,
    });
  } catch (err) { next(err); }
});

router.post('/', requireInternal, CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, createBody);
    if (!isSupportedProvider(body.providerCode)) {
      throw new ValidationError(
        `Unsupported provider code "${body.providerCode}". Allowed: ${SUPPORTED_PROVIDERS.join(', ')}`,
        { field: 'providerCode' },
      );
    }
    const r = await createProvider({
      providerName: body.providerName,
      providerCode: body.providerCode,
      configuration: body.configuration as Prisma.InputJsonValue,
      fromEmail: body.fromEmail,
      fromName: body.fromName,
      isPrimary: body.isPrimary,
      isActive: body.isActive,
    });
    sendSuccess(res, r);
  } catch (err) { next(err); }
});

router.put('/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, updateBody);
    await updateProvider(id, {
      providerName: body.providerName,
      providerCode: '', // ignored by service; field is immutable
      configuration: body.configuration as Prisma.InputJsonValue | undefined,
      fromEmail: body.fromEmail ?? '',
      fromName: body.fromName,
      isActive: body.isActive,
    });
    sendSuccess(res, { ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id', requireInternal, DELETE, async (req, res, next) => {
  try {
    await deleteProvider(parseParams(req, idParam).id);
    sendSuccess(res, { ok: true });
  } catch (err) { next(err); }
});

router.put('/:id/set-primary', requireInternal, EDIT, async (req, res, next) => {
  try {
    await setPrimaryProvider(parseParams(req, idParam).id);
    sendSuccess(res, { ok: true });
  } catch (err) { next(err); }
});

router.post('/:id/test', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, testBody);
    sendSuccess(res, await testProvider({ id, to: body.to }));
  } catch (err) { next(err); }
});

export default router;
