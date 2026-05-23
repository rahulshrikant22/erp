/**
 * WhatsApp-provider admin endpoints. Mirror of SMS/email provider patterns.
 *
 *   GET    /api/admin/whatsapp-providers
 *   POST   /api/admin/whatsapp-providers
 *   PUT    /api/admin/whatsapp-providers/:id
 *   DELETE /api/admin/whatsapp-providers/:id
 *   PUT    /api/admin/whatsapp-providers/:id/set-primary
 *   POST   /api/admin/whatsapp-providers/:id/test
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
  createWhatsAppProviderRecord,
  deleteWhatsAppProviderRecord,
  listWhatsAppProviders,
  setPrimaryWhatsAppProvider,
  testWhatsAppProvider,
  updateWhatsAppProviderRecord,
} from '../services/communication/whatsapp-service';
import {
  isSupportedWhatsAppProvider,
  SUPPORTED_WHATSAPP_PROVIDERS,
} from '../services/communication/whatsapp-providers/factory';

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
  phoneNumberId: z.string().max(100).optional(),
  businessAccountId: z.string().max(100).optional(),
  webhookSecret: z.string().max(500).optional(),
  isPrimary: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
const updateBody = z.object({
  providerName: z.string().min(1).max(200).optional(),
  configuration: z.record(z.string(), z.unknown()).optional(),
  phoneNumberId: z.string().max(100).nullable().optional(),
  businessAccountId: z.string().max(100).nullable().optional(),
  webhookSecret: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});
const testBody = z.object({ to: z.string().min(8) });

router.get('/', requireInternal, VIEW, async (_req, res, next) => {
  try {
    const providers = await listWhatsAppProviders();
    sendSuccess(res, {
      providers: providers.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      supported: SUPPORTED_WHATSAPP_PROVIDERS,
    });
  } catch (err) { next(err); }
});

router.post('/', requireInternal, CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, createBody);
    if (!isSupportedWhatsAppProvider(body.providerCode)) {
      throw new ValidationError(
        `Unsupported provider code "${body.providerCode}". Allowed: ${SUPPORTED_WHATSAPP_PROVIDERS.join(', ')}`,
        { field: 'providerCode' },
      );
    }
    sendSuccess(res, await createWhatsAppProviderRecord({
      providerName: body.providerName,
      providerCode: body.providerCode,
      configuration: body.configuration as Prisma.InputJsonValue,
      phoneNumberId: body.phoneNumberId,
      businessAccountId: body.businessAccountId,
      webhookSecret: body.webhookSecret,
      isPrimary: body.isPrimary,
      isActive: body.isActive,
    }));
  } catch (err) { next(err); }
});

router.put('/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, updateBody);
    await updateWhatsAppProviderRecord(id, {
      providerName: body.providerName,
      configuration: body.configuration as Prisma.InputJsonValue | undefined,
      phoneNumberId: body.phoneNumberId ?? undefined,
      businessAccountId: body.businessAccountId ?? undefined,
      webhookSecret: body.webhookSecret ?? undefined,
      isActive: body.isActive,
    });
    sendSuccess(res, { ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id', requireInternal, DELETE, async (req, res, next) => {
  try {
    await deleteWhatsAppProviderRecord(parseParams(req, idParam).id);
    sendSuccess(res, { ok: true });
  } catch (err) { next(err); }
});

router.put('/:id/set-primary', requireInternal, EDIT, async (req, res, next) => {
  try {
    await setPrimaryWhatsAppProvider(parseParams(req, idParam).id);
    sendSuccess(res, { ok: true });
  } catch (err) { next(err); }
});

router.post('/:id/test', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, testBody);
    sendSuccess(res, await testWhatsAppProvider({ id, to: body.to }));
  } catch (err) { next(err); }
});

export default router;
