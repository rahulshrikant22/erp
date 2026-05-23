/**
 * WhatsApp dispatch service. Same shape as email + SMS services:
 *   sendWhatsAppTemplate() → loads template, builds params, runs provider
 *     chain with failover, logs every attempt to notification_log.
 *   sendWhatsAppSession() → session messaging within 24-hour window.
 *
 * Phone format: international without '+'. Indian 10-digit numbers are
 * prefixed with '91'. Numbers starting with '+' have the '+' stripped.
 *
 * Rate limit: counts notification_log rows in the last hour with
 *   channel='whatsapp' AND recipient_address=<normalized phone>
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { rawPrisma } from '../../lib/prisma-base';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { renderTemplate } from './templates';
import {
  createWhatsAppProvider,
  isSupportedWhatsAppProvider,
} from './whatsapp-providers/factory';
import { WhatsAppLogProvider } from './whatsapp-providers/log';
import type {
  IWhatsAppProvider,
  WhatsAppProviderContext,
  WhatsAppSendResult,
  WhatsAppTemplateSendInput,
  WhatsAppSessionSendInput,
} from './whatsapp-providers/types';

// -- chain cache --------------------------------------------------------

interface CachedChain {
  providers: {
    id: string;
    provider: IWhatsAppProvider;
    context: WhatsAppProviderContext;
  }[];
  expiresAt: number;
}
const CHAIN_TTL_MS = 60 * 1000;
let chainCache: CachedChain | null = null;

export function _invalidateWhatsAppProviderCache(): void {
  chainCache = null;
}

async function loadChain(): Promise<CachedChain> {
  if (chainCache && chainCache.expiresAt > Date.now()) return chainCache;
  const rows = await prisma.whatsappProvider.findMany({
    where: { isActive: true },
    orderBy: [{ isPrimary: 'desc' }, { providerCode: 'asc' }],
  });
  const chain: CachedChain['providers'] = [];
  for (const r of rows) {
    if (!isSupportedWhatsAppProvider(r.providerCode)) {
      logger.warn(
        { providerCode: r.providerCode, id: r.id },
        'skipping whatsapp provider with unknown code',
      );
      continue;
    }
    try {
      const provider = createWhatsAppProvider(
        r.providerCode,
        (r.configuration ?? {}) as Record<string, unknown>,
      );
      chain.push({
        id: r.id,
        provider,
        context: {
          phoneNumberId: r.phoneNumberId ?? undefined,
          businessAccountId: r.businessAccountId ?? undefined,
        },
      });
    } catch (err) {
      logger.error({ err, id: r.id }, 'failed to materialise whatsapp provider');
    }
  }
  if (chain.length === 0) {
    chain.push({
      id: 'log',
      provider: new WhatsAppLogProvider(),
      context: {},
    });
  }
  chainCache = { providers: chain, expiresAt: Date.now() + CHAIN_TTL_MS };
  return chainCache;
}

// -- helpers ------------------------------------------------------------

export function normalizeWhatsAppPhone(input: string): string {
  const trimmed = input.replace(/\s|-|\(|\)/g, '');
  const stripped = trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
  if (/^\d{10}$/.test(stripped)) return `91${stripped}`;
  return stripped;
}

function isValidWhatsAppPhone(phone: string): boolean {
  return /^\d{8,15}$/.test(phone);
}

async function recentSendsCount(toPhone: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  return rawPrisma.notificationLog.count({
    where: {
      channel: 'whatsapp',
      recipientAddress: toPhone,
      createdAt: { gte: since },
    },
  });
}

// -- public API ---------------------------------------------------------

export class WhatsAppRateLimit extends Error {
  readonly code = 'WHATSAPP_RATE_LIMIT' as const;
  constructor(
    public readonly recentCount: number,
    public readonly limit: number,
  ) {
    super(`Rate limit exceeded for recipient (${recentCount} / ${limit} in last hour)`);
    this.name = 'WhatsAppRateLimit';
  }
}

// -- template send ------------------------------------------------------

export interface SendWhatsAppTemplateInput {
  to: string;
  templateCode: string;
  variables?: Record<string, unknown>;
  mediaUrl?: string;
  recipientUserId?: string;
  notificationType?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

export async function sendWhatsAppTemplate(
  input: SendWhatsAppTemplateInput,
): Promise<WhatsAppSendResult & { providerId: string; toNormalized: string }> {
  const tpl = await prisma.communicationTemplate.findUnique({
    where: { templateCode: input.templateCode },
  });
  if (!tpl) {
    return { ok: false, error: `Template ${input.templateCode} not found`, providerId: 'none', toNormalized: input.to };
  }
  if (tpl.channel !== 'whatsapp') {
    return { ok: false, error: `Template ${input.templateCode} is not a WhatsApp template`, providerId: 'none', toNormalized: input.to };
  }
  if (tpl.waApprovalStatus && tpl.waApprovalStatus !== 'approved') {
    return { ok: false, error: `Template ${input.templateCode} approval status is ${tpl.waApprovalStatus}`, providerId: 'none', toNormalized: input.to };
  }

  const rendered = await renderTemplate(input.templateCode, input.variables ?? {});
  const bodyParams = extractParams(rendered.text || rendered.html);

  const toNormalized = normalizeWhatsAppPhone(input.to);
  if (!isValidWhatsAppPhone(toNormalized)) {
    return { ok: false, error: `Invalid WhatsApp phone: ${toNormalized}`, providerId: 'none', toNormalized };
  }

  const recent = await recentSendsCount(toNormalized);
  const limit = config.env.WHATSAPP_RATE_LIMIT_PER_HOUR;
  if (recent >= limit) {
    throw new WhatsAppRateLimit(recent, limit);
  }

  const chain = await loadChain();

  const notification = input.recipientUserId
    ? await prisma.notification.create({
        data: {
          recipientUserId: input.recipientUserId,
          notificationType: input.notificationType ?? 'whatsapp',
          title: `WhatsApp: ${tpl.name}`,
          body: rendered.text || rendered.html,
          relatedEntityType: input.relatedEntityType,
          relatedEntityId: input.relatedEntityId,
        },
      })
    : null;

  const templateInput: WhatsAppTemplateSendInput = {
    to: toNormalized,
    templateName: tpl.templateCode,
    languageCode: 'en',
    namespace: tpl.waNamespace ?? undefined,
    bodyParams,
    mediaUrl: input.mediaUrl,
  };

  return runChain('template', templateInput, null, chain, notification?.id ?? null, toNormalized);
}

// -- session send -------------------------------------------------------

export interface SendWhatsAppSessionInput {
  to: string;
  message: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'document' | 'video';
  recipientUserId?: string;
  notificationType?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

export async function sendWhatsAppSession(
  input: SendWhatsAppSessionInput,
): Promise<WhatsAppSendResult & { providerId: string; toNormalized: string }> {
  const toNormalized = normalizeWhatsAppPhone(input.to);
  if (!isValidWhatsAppPhone(toNormalized)) {
    return { ok: false, error: `Invalid WhatsApp phone: ${toNormalized}`, providerId: 'none', toNormalized };
  }

  const recent = await recentSendsCount(toNormalized);
  const limit = config.env.WHATSAPP_RATE_LIMIT_PER_HOUR;
  if (recent >= limit) {
    throw new WhatsAppRateLimit(recent, limit);
  }

  const chain = await loadChain();

  const notification = input.recipientUserId
    ? await prisma.notification.create({
        data: {
          recipientUserId: input.recipientUserId,
          notificationType: input.notificationType ?? 'whatsapp',
          title: '(whatsapp session)',
          body: input.message,
          relatedEntityType: input.relatedEntityType,
          relatedEntityId: input.relatedEntityId,
        },
      })
    : null;

  const sessionInput: WhatsAppSessionSendInput = {
    to: toNormalized,
    message: input.message,
    mediaUrl: input.mediaUrl,
    mediaType: input.mediaType,
  };

  return runChain('session', null, sessionInput, chain, notification?.id ?? null, toNormalized);
}

// -- chain runner -------------------------------------------------------

async function runChain(
  mode: 'template' | 'session',
  templateInput: WhatsAppTemplateSendInput | null,
  sessionInput: WhatsAppSessionSendInput | null,
  chain: CachedChain,
  notificationId: string | null,
  toNormalized: string,
): Promise<WhatsAppSendResult & { providerId: string; toNormalized: string }> {
  let lastError: string | undefined;
  let lastProviderId: string | undefined;
  for (const link of chain.providers) {
    lastProviderId = link.id;
    const result =
      mode === 'template'
        ? await link.provider.sendTemplate(templateInput!, link.context)
        : await link.provider.sendSession(sessionInput!, link.context);

    await writeNotificationLog({
      notificationId,
      whatsappProviderId: link.id === 'log' ? null : link.id,
      recipientAddress: toNormalized,
      status: result.ok ? 'sent' : 'failed',
      providerMessageId: result.providerMessageId ?? null,
      errorMessage: result.error ?? null,
      sentAt: result.ok ? new Date() : null,
    });

    if (result.ok) {
      return { ...result, providerId: link.id, toNormalized };
    }
    lastError = result.error;
    logger.warn(
      { providerCode: link.provider.providerCode, error: result.error, to: toNormalized },
      'whatsapp send failed, trying next provider',
    );
  }

  return {
    ok: false,
    error: lastError ?? 'no providers available',
    providerId: lastProviderId ?? 'none',
    toNormalized,
  };
}

// -- notification log ---------------------------------------------------

interface NotificationLogInput {
  notificationId: string | null;
  whatsappProviderId: string | null;
  recipientAddress: string;
  status: string;
  providerMessageId: string | null;
  errorMessage: string | null;
  sentAt: Date | null;
}

async function writeNotificationLog(input: NotificationLogInput): Promise<void> {
  await rawPrisma.notificationLog.create({
    data: {
      notificationId: input.notificationId,
      channel: 'whatsapp',
      whatsappProviderId: input.whatsappProviderId,
      recipientAddress: input.recipientAddress,
      status: input.status,
      providerMessageId: input.providerMessageId,
      errorMessage: input.errorMessage,
      sentAt: input.sentAt,
    },
  });
}

// -- admin helpers ------------------------------------------------------

export async function listWhatsAppProviders(): Promise<
  {
    id: string;
    providerName: string;
    providerCode: string;
    phoneNumberId: string | null;
    businessAccountId: string | null;
    isPrimary: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }[]
> {
  return prisma.whatsappProvider.findMany({
    select: {
      id: true,
      providerName: true,
      providerCode: true,
      phoneNumberId: true,
      businessAccountId: true,
      isPrimary: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  });
}

export async function setPrimaryWhatsAppProvider(id: string): Promise<void> {
  await prisma.$transaction([
    rawPrisma.whatsappProvider.updateMany({ data: { isPrimary: false }, where: {} }),
    rawPrisma.whatsappProvider.update({ where: { id }, data: { isPrimary: true } }),
  ]);
  _invalidateWhatsAppProviderCache();
}

export async function testWhatsAppProvider(args: {
  id: string;
  to: string;
}): Promise<WhatsAppSendResult & { providerId: string }> {
  const row = await prisma.whatsappProvider.findUnique({ where: { id: args.id } });
  if (!row) return { ok: false, error: 'provider not found', providerId: args.id };
  if (!isSupportedWhatsAppProvider(row.providerCode)) {
    return { ok: false, error: `unsupported code ${row.providerCode}`, providerId: args.id };
  }
  const provider = createWhatsAppProvider(
    row.providerCode,
    (row.configuration ?? {}) as Record<string, unknown>,
  );
  const r = await provider.sendSession(
    { to: normalizeWhatsAppPhone(args.to), message: `Test from ${row.providerName}` },
    {
      phoneNumberId: row.phoneNumberId ?? undefined,
      businessAccountId: row.businessAccountId ?? undefined,
    },
  );
  return { ...r, providerId: row.id };
}

export type WhatsAppProviderInputData = {
  providerName: string;
  providerCode: string;
  configuration: Prisma.InputJsonValue;
  phoneNumberId?: string;
  businessAccountId?: string;
  webhookSecret?: string;
  isPrimary?: boolean;
  isActive?: boolean;
};

export async function createWhatsAppProviderRecord(
  input: WhatsAppProviderInputData,
): Promise<{ id: string }> {
  if (!isSupportedWhatsAppProvider(input.providerCode)) {
    throw new Error(`Unsupported provider code: ${input.providerCode}`);
  }
  const created = await prisma.whatsappProvider.create({
    data: {
      providerName: input.providerName,
      providerCode: input.providerCode,
      configuration: input.configuration,
      phoneNumberId: input.phoneNumberId,
      businessAccountId: input.businessAccountId,
      webhookSecret: input.webhookSecret,
      isPrimary: input.isPrimary ?? false,
      isActive: input.isActive ?? true,
    },
  });
  if (input.isPrimary) await setPrimaryWhatsAppProvider(created.id);
  _invalidateWhatsAppProviderCache();
  return { id: created.id };
}

export async function updateWhatsAppProviderRecord(
  id: string,
  patch: Partial<WhatsAppProviderInputData>,
): Promise<void> {
  const data: Record<string, unknown> = {};
  if (patch.providerName !== undefined) data.providerName = patch.providerName;
  if (patch.configuration !== undefined) data.configuration = patch.configuration;
  if (patch.phoneNumberId !== undefined) data.phoneNumberId = patch.phoneNumberId;
  if (patch.businessAccountId !== undefined) data.businessAccountId = patch.businessAccountId;
  if (patch.webhookSecret !== undefined) data.webhookSecret = patch.webhookSecret;
  if (patch.isActive !== undefined) data.isActive = patch.isActive;
  await prisma.whatsappProvider.update({ where: { id }, data });
  _invalidateWhatsAppProviderCache();
}

export async function deleteWhatsAppProviderRecord(id: string): Promise<void> {
  await prisma.whatsappProvider.delete({ where: { id } });
  _invalidateWhatsAppProviderCache();
}

// -- internal helpers ---------------------------------------------------

function extractParams(body: string): string[] {
  const matches = body.match(/{{\s*[\w.]+\s*}}/g);
  if (!matches) return [];
  return matches.map((m) => m.replace(/[{}]/g, '').trim());
}
