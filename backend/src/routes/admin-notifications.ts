/**
 * Admin notification endpoints.
 *
 *   GET  /api/admin/notifications/log  — filterable log of all sent notifications
 *   POST /api/admin/notifications/test — admin triggers any event for testing
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody } from '../utils/validate';
import {
  getNotificationLog,
  notify,
} from '../services/notification-orchestrator';

const router = Router();
const VIEW = requirePermission('COMM', 'comm', 'view');
const EDIT = requirePermission('COMM', 'comm', 'edit');

router.get('/log', requireInternal, VIEW, async (req, res, next) => {
  try {
    const channel = req.query.channel as string | undefined;
    const status = req.query.status as string | undefined;
    const recipientAddress = req.query.recipientAddress as string | undefined;
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
    const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const result = await getNotificationLog({
      channel,
      status,
      recipientAddress,
      dateFrom,
      dateTo,
      limit,
      offset,
    });
    sendSuccess(res, {
      logs: result.logs.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
        sentAt: l.sentAt?.toISOString() ?? null,
        deliveredAt: l.deliveredAt?.toISOString() ?? null,
        readAt: l.readAt?.toISOString() ?? null,
      })),
      total: result.total,
    });
  } catch (err) { next(err); }
});

const testBody = z.object({
  recipientUserId: z.string().uuid(),
  eventCode: z.string().min(1).max(100),
  variables: z.record(z.string(), z.unknown()).default({}),
  channels: z.array(z.enum(['email', 'sms', 'whatsapp', 'inApp'])).optional(),
});

router.post('/test', requireInternal, EDIT, async (req, res, next) => {
  try {
    const body = parseBody(req, testBody);
    const result = await notify(
      body.recipientUserId,
      body.eventCode,
      body.variables,
      { channels: body.channels, forceAllChannels: !body.channels },
    );
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

export default router;
