/**
 * WhatsApp template admin endpoints. Filters CommunicationTemplate by
 * channel='whatsapp'. Adds WhatsApp-specific fields: waApprovalStatus,
 * waNamespace, headerTemplate, footerTemplate, buttonsTemplate.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams } from '../utils/validate';
import { prisma } from '../lib/prisma';
import { ConflictError, NotFoundError } from '../errors';

const router = Router();
const VIEW   = requirePermission('COMM', 'comm', 'view');
const CREATE = requirePermission('COMM', 'comm', 'create');
const EDIT   = requirePermission('COMM', 'comm', 'edit');
const DELETE = requirePermission('COMM', 'comm', 'delete');

const idParam = z.object({ id: z.string().uuid() });
const codePattern = /^[a-z][a-z0-9_]{0,49}$/;
const approvalStatuses = ['draft', 'submitted', 'approved', 'rejected'] as const;

const createBody = z.object({
  templateCode: z.string().regex(codePattern, 'lowercase / digits / _ only'),
  name: z.string().min(1).max(200),
  bodyTemplate: z.string().min(1).max(4096),
  variablesSchema: z.record(z.string(), z.unknown()).optional(),
  waApprovalStatus: z.enum(approvalStatuses).default('draft'),
  waNamespace: z.string().max(200).optional(),
  headerTemplate: z.string().max(1000).optional(),
  footerTemplate: z.string().max(500).optional(),
  buttonsTemplate: z.array(z.record(z.string(), z.unknown())).optional(),
});
const updateBody = z.object({
  name: z.string().min(1).max(200).optional(),
  bodyTemplate: z.string().min(1).max(4096).optional(),
  variablesSchema: z.record(z.string(), z.unknown()).optional(),
  waApprovalStatus: z.enum(approvalStatuses).optional(),
  waNamespace: z.string().max(200).nullable().optional(),
  headerTemplate: z.string().max(1000).nullable().optional(),
  footerTemplate: z.string().max(500).nullable().optional(),
  buttonsTemplate: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
  isActive: z.boolean().optional(),
});

router.get('/', requireInternal, VIEW, async (_req, res, next) => {
  try {
    const rows = await prisma.communicationTemplate.findMany({
      where: { channel: 'whatsapp' },
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
        channel: 'whatsapp',
        bodyTemplate: body.bodyTemplate,
        variablesSchema: body.variablesSchema as Prisma.InputJsonValue | undefined,
        waApprovalStatus: body.waApprovalStatus,
        waNamespace: body.waNamespace,
        headerTemplate: body.headerTemplate,
        footerTemplate: body.footerTemplate,
        buttonsTemplate: body.buttonsTemplate as Prisma.InputJsonValue | undefined,
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
    if (!row || row.channel !== 'whatsapp') throw new NotFoundError('WhatsApp template not found');
    sendSuccess(res, row);
  } catch (err) { next(err); }
});

router.put('/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, updateBody);
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.bodyTemplate !== undefined) data.bodyTemplate = body.bodyTemplate;
    if (body.variablesSchema !== undefined) data.variablesSchema = body.variablesSchema;
    if (body.waApprovalStatus !== undefined) data.waApprovalStatus = body.waApprovalStatus;
    if (body.waNamespace !== undefined) data.waNamespace = body.waNamespace;
    if (body.headerTemplate !== undefined) data.headerTemplate = body.headerTemplate;
    if (body.footerTemplate !== undefined) data.footerTemplate = body.footerTemplate;
    if (body.buttonsTemplate !== undefined) data.buttonsTemplate = body.buttonsTemplate;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    sendSuccess(res, await prisma.communicationTemplate.update({ where: { id }, data }));
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
