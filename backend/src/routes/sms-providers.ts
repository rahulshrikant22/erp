/**
 * SMS-provider admin endpoints. Mirror of /api/admin/email-providers but
 * with senderId required (DLT regulation).
 *
 *   GET    /api/admin/sms-providers
 *   POST   /api/admin/sms-providers
 *   PUT    /api/admin/sms-providers/:id
 *   DELETE /api/admin/sms-providers/:id
 *   PUT    /api/admin/sms-providers/:id/set-primary
 *   POST   /api/admin/sms-providers/:id/test
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
  createSmsProviderRecord,
  deleteSmsProviderRecord,
  listSmsProviders,
  setPrimarySmsProvider,
  testSmsProvider,
  updateSmsProviderRecord,
} from '../services/communication/sms-service';
import {
  isSupportedSmsProvider,
  SUPPORTED_SMS_PROVIDERS,
} from '../services/communication/sms-providers/factory';

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
  // 6 alpha chars is the typical DLT-registered sender ID; we don't enforce
  // the format here so non-Indian providers can use longer/numeric ids.
  senderId: z.string().min(1).max(20),
  isPrimary: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
const updateBody = z.object({
  providerName: z.string().min(1).max(200).optional(),
  configuration: z.record(z.string(), z.unknown()).optional(),
  senderId: z.string().min(1).max(20).optional(),
  isActive: z.boolean().optional(),
});
const testBody = z.object({ to: z.string().min(8) });

router.get('/', requireInternal, VIEW, async (_req, res, next) => {
  try {
    const providers = await listSmsProviders();
    sendSuccess(res, {
      providers: providers.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      supported: SUPPORTED_SMS_PROVIDERS,
    });
  } catch (err) { next(err); }
});

router.post('/', requireInternal, CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, createBody);
    if (!isSupportedSmsProvider(body.providerCode)) {
      throw new ValidationError(
        `Unsupported provider code "${body.providerCode}". Allowed: ${SUPPORTED_SMS_PROVIDERS.join(', ')}`,
        { field: 'providerCode' },
      );
    }
    sendSuccess(res, await createSmsProviderRecord({
      providerName: body.providerName,
      providerCode: body.providerCode,
      configuration: body.configuration as Prisma.InputJsonValue,
      senderId: body.senderId,
      isPrimary: body.isPrimary,
      isActive: body.isActive,
    }));
  } catch (err) { next(err); }
});

router.put('/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, updateBody);
    await updateSmsProviderRecord(id, {
      providerName: body.providerName,
      providerCode: '', // immutable
      configuration: body.configuration as Prisma.InputJsonValue | undefined,
      senderId: body.senderId,
      isActive: body.isActive,
    });
    sendSuccess(res, { ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id', requireInternal, DELETE, async (req, res, next) => {
  try {
    await deleteSmsProviderRecord(parseParams(req, idParam).id);
    sendSuccess(res, { ok: true });
  } catch (err) { next(err); }
});

router.put('/:id/set-primary', requireInternal, EDIT, async (req, res, next) => {
  try {
    await setPrimarySmsProvider(parseParams(req, idParam).id);
    sendSuccess(res, { ok: true });
  } catch (err) { next(err); }
});

router.post('/:id/test', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, testBody);
    sendSuccess(res, await testSmsProvider({ id, to: body.to }));
  } catch (err) { next(err); }
});

export default router;
