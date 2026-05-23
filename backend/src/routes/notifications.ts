/**
 * In-app notification endpoints for the current authenticated user.
 *
 *   GET  /api/notifications           — list (paginated, optional unreadOnly)
 *   GET  /api/notifications/unread-count
 *   POST /api/notifications/:id/mark-read
 *   POST /api/notifications/mark-all-read
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams } from '../utils/validate';
import {
  getUserNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
} from '../services/notification-orchestrator';
import { NotFoundError } from '../errors';
import { prisma } from '../lib/prisma';

const router = Router();
const idParam = z.object({ id: z.string().uuid() });

router.get('/', requireInternal, async (req, res, next) => {
  try {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;
    const unreadOnly = req.query.unreadOnly === 'true';
    const result = await getUserNotifications(userId, { limit, offset, unreadOnly });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.get('/unread-count', requireInternal, async (req, res, next) => {
  try {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    const count = await getUnreadCount(userId);
    sendSuccess(res, { count });
  } catch (err) { next(err); }
});

router.post('/mark-all-read', requireInternal, async (req, res, next) => {
  try {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    const count = await markAllRead(userId);
    sendSuccess(res, { markedRead: count });
  } catch (err) { next(err); }
});

router.post('/:id/mark-read', requireInternal, async (req, res, next) => {
  try {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    const { id } = parseParams(req, idParam);
    const ok = await markRead(id, userId);
    if (!ok) throw new NotFoundError('Notification not found');
    sendSuccess(res, { ok: true });
  } catch (err) { next(err); }
});

// -- communication preferences ------------------------------------------

const prefsBody = z.object({
  email: z.boolean().optional(),
  sms: z.boolean().optional(),
  whatsapp: z.boolean().optional(),
  inApp: z.boolean().optional(),
});

router.get('/preferences', requireInternal, async (req, res, next) => {
  try {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { communicationPreferences: true },
    });
    const prefs = (user?.communicationPreferences as Record<string, boolean> | null) ?? {
      email: true, sms: true, whatsapp: true, inApp: true,
    };
    sendSuccess(res, { preferences: prefs });
  } catch (err) { next(err); }
});

router.put('/preferences', requireInternal, async (req, res, next) => {
  try {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    const body = parseBody(req, prefsBody);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { communicationPreferences: true },
    });
    const existing = (user?.communicationPreferences as Record<string, boolean> | null) ?? {
      email: true, sms: true, whatsapp: true, inApp: true,
    };
    const merged = { ...existing, ...body };
    await prisma.user.update({
      where: { id: userId },
      data: { communicationPreferences: merged },
    });
    sendSuccess(res, { preferences: merged });
  } catch (err) { next(err); }
});

export default router;
