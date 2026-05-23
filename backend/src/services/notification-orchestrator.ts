/**
 * Multi-channel notification orchestrator (P0-18).
 *
 * Single entry point: notify(recipientId, eventCode, variables, options?)
 *   1. Load user + communication preferences
 *   2. For each enabled channel, look up template by convention:
 *      templateCode = `${eventCode}_${channel}` or fallback to `${eventCode}`
 *   3. Send via the respective channel service
 *   4. Always create an in-app notification
 *   5. Each channel is independent — failure on one doesn't block others
 *   6. Up to 3 retry attempts per channel on transient errors
 */
import { prisma } from '../lib/prisma';
import { rawPrisma } from '../lib/prisma-base';
import { logger } from '../utils/logger';
import { sendTemplate as sendEmailTemplate } from './communication/email-service';
import { sendSmsTemplate } from './communication/sms-service';
import { sendWhatsAppTemplate } from './communication/whatsapp-service';

// -- types --------------------------------------------------------------

export interface NotifyOptions {
  channels?: ('email' | 'sms' | 'whatsapp' | 'inApp')[];
  forceAllChannels?: boolean;
  relatedEntityType?: string;
  relatedEntityId?: string;
  skipInApp?: boolean;
}

export interface NotifyResult {
  inApp: { ok: boolean; notificationId?: string };
  email: ChannelResult;
  sms: ChannelResult;
  whatsapp: ChannelResult;
}

export interface ChannelResult {
  attempted: boolean;
  ok: boolean;
  error?: string;
  skippedReason?: string;
}

export interface CommunicationPreferences {
  email?: boolean;
  sms?: boolean;
  whatsapp?: boolean;
  inApp?: boolean;
}

const DEFAULT_PREFS: CommunicationPreferences = {
  email: true,
  sms: true,
  whatsapp: true,
  inApp: true,
};

const MAX_RETRIES = 3;

// -- main ---------------------------------------------------------------

export async function notify(
  recipientUserId: string,
  eventCode: string,
  variables: Record<string, unknown> = {},
  options: NotifyOptions = {},
): Promise<NotifyResult> {
  const user = await prisma.user.findUnique({
    where: { id: recipientUserId },
    select: {
      id: true,
      email: true,
      phone: true,
      firstName: true,
      lastName: true,
      isActive: true,
      communicationPreferences: true,
    },
  });

  if (!user || !user.isActive) {
    return {
      inApp: { ok: false },
      email: { attempted: false, ok: false, skippedReason: 'user not found or inactive' },
      sms: { attempted: false, ok: false, skippedReason: 'user not found or inactive' },
      whatsapp: { attempted: false, ok: false, skippedReason: 'user not found or inactive' },
    };
  }

  const prefs = resolvePreferences(
    user.communicationPreferences as CommunicationPreferences | null,
    options,
  );

  const vars = { ...variables, firstName: user.firstName, lastName: user.lastName, email: user.email };

  const result: NotifyResult = {
    inApp: { ok: false },
    email: { attempted: false, ok: false },
    sms: { attempted: false, ok: false },
    whatsapp: { attempted: false, ok: false },
  };

  // In-app notification (always, unless explicitly skipped)
  if (!options.skipInApp && prefs.inApp) {
    result.inApp = await createInAppNotification(
      recipientUserId,
      eventCode,
      vars,
      options,
    );
  }

  // Email
  if (prefs.email && user.email) {
    result.email = await sendWithRetry('email', async () => {
      const templateCode = await resolveTemplateCode(eventCode, 'email');
      if (!templateCode) return { attempted: false, ok: false, skippedReason: 'no email template' };
      const r = await sendEmailTemplate({
        to: user.email,
        templateCode,
        variables: vars,
        recipientUserId: user.id,
        notificationType: eventCode,
        relatedEntityType: options.relatedEntityType,
        relatedEntityId: options.relatedEntityId,
      });
      return { attempted: true, ok: r.ok, error: r.ok ? undefined : r.error };
    });
  } else {
    result.email = { attempted: false, ok: false, skippedReason: prefs.email ? 'no email address' : 'opted out' };
  }

  // SMS
  if (prefs.sms && user.phone) {
    result.sms = await sendWithRetry('sms', async () => {
      const templateCode = await resolveTemplateCode(eventCode, 'sms');
      if (!templateCode) return { attempted: false, ok: false, skippedReason: 'no sms template' };
      const r = await sendSmsTemplate({
        to: user.phone!,
        templateCode,
        variables: vars,
        recipientUserId: user.id,
        notificationType: eventCode,
        relatedEntityType: options.relatedEntityType,
        relatedEntityId: options.relatedEntityId,
      });
      return { attempted: true, ok: r.ok, error: r.ok ? undefined : r.error };
    });
  } else {
    result.sms = { attempted: false, ok: false, skippedReason: prefs.sms ? 'no phone number' : 'opted out' };
  }

  // WhatsApp
  if (prefs.whatsapp && user.phone) {
    result.whatsapp = await sendWithRetry('whatsapp', async () => {
      const templateCode = await resolveTemplateCode(eventCode, 'whatsapp');
      if (!templateCode) return { attempted: false, ok: false, skippedReason: 'no whatsapp template' };
      const r = await sendWhatsAppTemplate({
        to: user.phone!,
        templateCode,
        variables: vars,
        recipientUserId: user.id,
        notificationType: eventCode,
        relatedEntityType: options.relatedEntityType,
        relatedEntityId: options.relatedEntityId,
      });
      return { attempted: true, ok: r.ok, error: r.ok ? undefined : r.error };
    });
  } else {
    result.whatsapp = { attempted: false, ok: false, skippedReason: prefs.whatsapp ? 'no phone number' : 'opted out' };
  }

  return result;
}

// -- helpers ------------------------------------------------------------

function resolvePreferences(
  stored: CommunicationPreferences | null,
  options: NotifyOptions,
): CommunicationPreferences {
  if (options.forceAllChannels) return { email: true, sms: true, whatsapp: true, inApp: true };
  const base = { ...DEFAULT_PREFS, ...(stored ?? {}) };
  if (options.channels) {
    return {
      email: options.channels.includes('email') && base.email,
      sms: options.channels.includes('sms') && base.sms,
      whatsapp: options.channels.includes('whatsapp') && base.whatsapp,
      inApp: options.channels.includes('inApp') && base.inApp,
    };
  }
  return base;
}

async function resolveTemplateCode(
  eventCode: string,
  channel: string,
): Promise<string | null> {
  // Convention: try `event_channel` first, then plain `event`
  const specific = `${eventCode}_${channel}`;
  const tpl = await rawPrisma.communicationTemplate.findFirst({
    where: {
      OR: [
        { templateCode: specific, channel, isActive: true },
        { templateCode: eventCode, channel, isActive: true },
      ],
    },
    select: { templateCode: true },
  });
  return tpl?.templateCode ?? null;
}

async function createInAppNotification(
  recipientUserId: string,
  eventCode: string,
  variables: Record<string, unknown>,
  options: NotifyOptions,
): Promise<{ ok: boolean; notificationId?: string }> {
  try {
    const title = buildTitle(eventCode, variables);
    const body = buildBody(eventCode, variables);
    const n = await prisma.notification.create({
      data: {
        recipientUserId,
        notificationType: eventCode,
        title,
        body,
        relatedEntityType: options.relatedEntityType,
        relatedEntityId: options.relatedEntityId,
      },
    });
    return { ok: true, notificationId: n.id };
  } catch (err) {
    logger.error({ err, recipientUserId, eventCode }, 'failed to create in-app notification');
    return { ok: false };
  }
}

function buildTitle(eventCode: string, _variables: Record<string, unknown>): string {
  const parts = eventCode.split('.');
  const action = parts.pop() ?? eventCode;
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildBody(eventCode: string, variables: Record<string, unknown>): string {
  const name = variables.firstName ? `${variables.firstName}` : 'User';
  return `${buildTitle(eventCode, variables)} for ${name}`;
}

async function sendWithRetry(
  channel: string,
  fn: () => Promise<ChannelResult>,
): Promise<ChannelResult> {
  let lastResult: ChannelResult = { attempted: false, ok: false };
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      lastResult = await fn();
      if (lastResult.ok || !lastResult.attempted) return lastResult;
      if (attempt < MAX_RETRIES) {
        logger.warn(
          { channel, attempt, error: lastResult.error },
          'notification channel send failed, retrying',
        );
      }
    } catch (err) {
      lastResult = { attempted: true, ok: false, error: (err as Error).message };
      if (attempt < MAX_RETRIES) {
        logger.warn({ channel, attempt, err }, 'notification channel threw, retrying');
      }
    }
  }
  logger.error({ channel, error: lastResult.error }, 'notification channel exhausted retries');
  return lastResult;
}

// -- in-app query helpers (used by routes) ------------------------------

export async function getUserNotifications(
  userId: string,
  opts: { limit?: number; offset?: number; unreadOnly?: boolean } = {},
): Promise<{ notifications: InAppNotification[]; total: number; unread: number }> {
  const where: Record<string, unknown> = { recipientUserId: userId };
  if (opts.unreadOnly) where.isRead = false;

  const [rows, total, unread] = await Promise.all([
    rawPrisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: opts.limit ?? 20,
      skip: opts.offset ?? 0,
    }),
    rawPrisma.notification.count({ where }),
    rawPrisma.notification.count({ where: { recipientUserId: userId, isRead: false } }),
  ]);

  return {
    notifications: rows.map(toInAppView),
    total,
    unread,
  };
}

export async function getUnreadCount(userId: string): Promise<number> {
  return rawPrisma.notification.count({
    where: { recipientUserId: userId, isRead: false },
  });
}

export async function markRead(notificationId: string, userId: string): Promise<boolean> {
  const n = await rawPrisma.notification.findFirst({
    where: { id: notificationId, recipientUserId: userId },
  });
  if (!n) return false;
  await rawPrisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true, readAt: new Date() },
  });
  return true;
}

export async function markAllRead(userId: string): Promise<number> {
  const result = await rawPrisma.notification.updateMany({
    where: { recipientUserId: userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return result.count;
}

// -- admin helpers ------------------------------------------------------

export interface NotificationLogFilter {
  channel?: string;
  status?: string;
  recipientAddress?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}

export async function getNotificationLog(filter: NotificationLogFilter) {
  const where: Record<string, unknown> = {};
  if (filter.channel) where.channel = filter.channel;
  if (filter.status) where.status = filter.status;
  if (filter.recipientAddress) where.recipientAddress = { contains: filter.recipientAddress };
  if (filter.dateFrom || filter.dateTo) {
    where.createdAt = {};
    if (filter.dateFrom) (where.createdAt as Record<string, unknown>).gte = filter.dateFrom;
    if (filter.dateTo) (where.createdAt as Record<string, unknown>).lte = filter.dateTo;
  }

  const [rows, total] = await Promise.all([
    rawPrisma.notificationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filter.limit ?? 50,
      skip: filter.offset ?? 0,
    }),
    rawPrisma.notificationLog.count({ where }),
  ]);

  return { logs: rows, total };
}

// -- view types ---------------------------------------------------------

export interface InAppNotification {
  id: string;
  notificationType: string;
  title: string;
  body: string;
  isRead: boolean;
  readAt: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  createdAt: string;
}

function toInAppView(row: {
  id: string;
  notificationType: string;
  title: string;
  body: string;
  isRead: boolean;
  readAt: Date | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  createdAt: Date;
}): InAppNotification {
  return {
    id: row.id,
    notificationType: row.notificationType,
    title: row.title,
    body: row.body,
    isRead: row.isRead,
    readAt: row.readAt?.toISOString() ?? null,
    relatedEntityType: row.relatedEntityType,
    relatedEntityId: row.relatedEntityId,
    createdAt: row.createdAt.toISOString(),
  };
}
