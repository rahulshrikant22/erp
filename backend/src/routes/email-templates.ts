/**
 * Communication template admin endpoints. Currently only filters channel='email';
 * SMS / WhatsApp share the same table and will surface in P0-16 / P0-17.
 *
 *   GET    /api/admin/email-templates
 *   POST   /api/admin/email-templates
 *   GET    /api/admin/email-templates/:id
 *   PUT    /api/admin/email-templates/:id
 *   DELETE /api/admin/email-templates/:id
 */
import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams } from '../utils/validate';
import { prisma } from '../lib/prisma';
import { NotFoundError, ConflictError } from '../errors';

const router = Router();
const VIEW   = requirePermission('COMM', 'comm', 'view');
const CREATE = requirePermission('COMM', 'comm', 'create');
const EDIT   = requirePermission('COMM', 'comm', 'edit');
const DELETE = requirePermission('COMM', 'comm', 'delete');

const idParam = z.object({ id: z.string().uuid() });
const codePattern = /^[a-z][a-z0-9_]{0,49}$/;
const createBody = z.object({
  templateCode: z.string().regex(codePattern, 'lowercase / digits / _ only'),
  name: z.string().min(1).max(200),
  channel: z.enum(['email', 'sms', 'whatsapp']).default('email'),
  subjectTemplate: z.string().max(500).optional(),
  bodyTemplate: z.string().min(1),
  variablesSchema: z.record(z.string(), z.unknown()).optional(),
});
const updateBody = z.object({
  name: z.string().min(1).max(200).optional(),
  subjectTemplate: z.string().max(500).nullable().optional(),
  bodyTemplate: z.string().min(1).optional(),
  variablesSchema: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

router.get('/', requireInternal, VIEW, async (_req, res, next) => {
  try {
    const rows = await prisma.communicationTemplate.findMany({
      where: { channel: 'email' },
      orderBy: { templateCode: 'asc' },
    });
    sendSuccess(res, {
      templates: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  } catch (err) { next(err); }
});

router.post('/', requireInternal, CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, createBody);
    const dup = await prisma.communicationTemplate.findUnique({
      where: { templateCode: body.templateCode },
    });
    if (dup) throw new ConflictError('Template code already exists', { field: 'templateCode' });

    const created = await prisma.communicationTemplate.create({
      data: {
        templateCode: body.templateCode,
        name: body.name,
        channel: body.channel,
        subjectTemplate: body.subjectTemplate,
        bodyTemplate: body.bodyTemplate,
        variablesSchema:
          body.variablesSchema as Prisma.InputJsonValue | undefined,
        isActive: true,
      },
    });
    sendSuccess(res, created);
  } catch (err) { next(err); }
});

router.get('/:id', requireInternal, VIEW, async (req, res, next) => {
  try {
    const row = await prisma.communicationTemplate.findUnique({
      where: { id: parseParams(req, idParam).id },
    });
    if (!row) throw new NotFoundError('Template not found');
    sendSuccess(res, row);
  } catch (err) { next(err); }
});

router.put('/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, updateBody);
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.subjectTemplate !== undefined) data.subjectTemplate = body.subjectTemplate;
    if (body.bodyTemplate !== undefined) data.bodyTemplate = body.bodyTemplate;
    if (body.variablesSchema !== undefined) data.variablesSchema = body.variablesSchema;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    const updated = await prisma.communicationTemplate.update({ where: { id }, data });
    sendSuccess(res, updated);
  } catch (err) { next(err); }
});

router.delete('/:id', requireInternal, DELETE, async (req, res, next) => {
  try {
    await prisma.communicationTemplate.delete({
      where: { id: parseParams(req, idParam).id },
    });
    sendSuccess(res, { ok: true });
  } catch (err) { next(err); }
});

export default router;
