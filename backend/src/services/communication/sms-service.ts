/**
 * SMS dispatch service. Same shape as the email service:
 *   sendSmsTemplate(toPhone, templateCode, vars, opts?) → renders, validates
 *   DLT, normalizes the phone number, runs the provider chain with failover,
 *   logs every attempt to notification_log, and enforces a per-recipient
 *   rate limit.
 *
 *   sendSmsRaw(input)  → bypasses templates; same chain.
 *
 * Phone normalization: numbers without `+` are assumed Indian and prefixed
 * with `+91`. Numbers already starting with `+` pass through unchanged.
 *
 * Rate limit: counts notification_log rows in the last hour with
 *   channel='sms' AND recipient_address=<normalized phone>
 * regardless of provider or status. Refuses with a 429-ish error before
 * touching any provider so abuse can't burn budget.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { rawPrisma } from '../../lib/prisma-base';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { renderTemplate } from './templates';
import {
  createSmsProvider,
  isSupportedSmsProvider,
} from './sms-providers/factory';
import { SmsLogProvider } from './sms-providers/log';
import type {
  ISmsProvider,
  SmsProviderContext,
  SmsSendInput,
  SmsSendResult,
} from './sms-providers/types';

// -- chain cache --------------------------------------------------------

interface CachedChain {
  providers: { id: string; provider: ISmsProvider; context: SmsProviderContext }[];
  expiresAt: number;
}
const CHAIN_TTL_MS = 60 * 1000;
let chainCache: CachedChain | null = null;

export function _invalidateSmsProviderCache(): void {
  chainCache = null;
}

async function loadChain(): Promise<CachedChain> {
  if (chainCache && chainCache.expiresAt > Date.now()) return chainCache;
  const rows = await prisma.smsProvider.findMany({
    where: { isActive: true },
    orderBy: [{ isPrimary: 'desc' }, { providerCode: 'asc' }],
  });
  const chain: CachedChain['providers'] = [];
  for (const r of rows) {
    if (!isSupportedSmsProvider(r.providerCode)) {
      logger.warn(
        { providerCode: r.providerCode, id: r.id },
        'skipping sms provider with unknown code',
      );
      continue;
    }
    if (!r.senderId) {
      logger.warn({ id: r.id }, 'sms provider has no senderId; skipping');
      continue;
    }
    try {
      const provider = createSmsProvider(
        r.providerCode,
        (r.configuration ?? {}) as Record<string, unknown>,
      );
      chain.push({ id: r.id, provider, context: { senderId: r.senderId } });
    } catch (err) {
      logger.error({ err, id: r.id }, 'failed to materialise sms provider');
    }
  }
  if (chain.length === 0) {
    chain.push({
      id: 'log',
      provider: new SmsLogProvider(),
      context: { senderId: 'ERPLOG' },
    });
  }
  chainCache = { providers: chain, expiresAt: Date.now() + CHAIN_TTL_MS };
  return chainCache;
}

// -- helpers ------------------------------------------------------------

const E164 = /^\+\d{8,15}$/;

export function normalizePhone(input: string): string {
  const trimmed = input.replace(/\s|-|\(|\)/g, '');
  if (trimmed.startsWith('+')) return trimmed;
  // Heuristic: 10-digit Indian mobile → +91 prefix. Anything else is left
  // raw and the provider's validation surfaces a clearer error than ours.
  if (/^\d{10}$/.test(trimmed)) return `+91${trimmed}`;
  return trimmed;
}

function isValidE164(phone: string): boolean {
  return E164.test(phone);
}

async function recentSendsCount(toPhone: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  return rawPrisma.notificationLog.count({
    where: {
      channel: 'sms',
      recipientAddress: toPhone,
      createdAt: { gte: since },
    },
  });
}

// -- public API ---------------------------------------------------------

export interface SmsRateLimitError extends Error {
  code: 'SMS_RATE_LIMIT';
  recentCount: number;
  limit: number;
}

export class SmsRateLimit extends Error implements SmsRateLimitError {
  readonly code = 'SMS_RATE_LIMIT' as const;
  constructor(
    public readonly recentCount: number,
    public readonly limit: number,
  ) {
    super(`Rate limit exceeded for recipient (${recentCount} / ${limit} in last hour)`);
    this.name = 'SmsRateLimit';
  }
}

export interface SendSmsTemplateInput {
  to: string;
  templateCode: string;
  variables?: Record<string, unknown>;
  recipientUserId?: string;
  notificationType?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

export async function sendSmsTemplate(
  input: SendSmsTemplateInput,
): Promise<SmsSendResult & { providerId: string; toNormalized: string }> {
  const tpl = await prisma.communicationTemplate.findUnique({
    where: { templateCode: input.templateCode },
  });
  if (!tpl) {
    return { ok: false, error: `Template ${input.templateCode} not found`, providerId: 'none', toNormalized: input.to };
  }
  if (tpl.channel !== 'sms') {
    return { ok: false, error: `Template ${input.templateCode} is not an SMS template`, providerId: 'none', toNormalized: input.to };
  }

  const rendered = await renderTemplate(input.templateCode, input.variables ?? {});
  // For SMS we use the rendered HTML body as plain text. The htmlToText
  // converter already strips tags so the result is fine for SMS gateways.
  const body = rendered.text || rendered.html;

  return sendSmsRaw({
    to: input.to,
    body,
    dltTemplateId: tpl.dltTemplateId ?? undefined,
    recipientUserId: input.recipientUserId,
    notificationType: input.notificationType ?? input.templateCode,
    relatedEntityType: input.relatedEntityType,
    relatedEntityId: input.relatedEntityId,
  });
}

export interface SendSmsRawInput {
  to: string;
  body: string;
  dltTemplateId?: string;
  recipientUserId?: string;
  notificationType?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

export async function sendSmsRaw(
  input: SendSmsRawInput,
): Promise<SmsSendResult & { providerId: string; toNormalized: string }> {
  const toNormalized = normalizePhone(input.to);
  if (!isValidE164(toNormalized)) {
    return {
      ok: false,
      error: `Phone number does not look E.164 after normalization: ${toNormalized}`,
      providerId: 'none',
      toNormalized,
    };
  }

  // DLT enforcement.
  if (config.env.DLT_ENFORCEMENT_ENABLED && !input.dltTemplateId) {
    return {
      ok: false,
      error: 'DLT enforcement is on; this send has no dltTemplateId',
      providerId: 'none',
      toNormalized,
    };
  }

  // Rate limit.
  const recent = await recentSendsCount(toNormalized);
  const limit = config.env.SMS_RATE_LIMIT_PER_HOUR;
  if (recent >= limit) {
    throw new SmsRateLimit(recent, limit);
  }

  const chain = await loadChain();

  // Anchor a Notification row (audit chain) when a user id is supplied.
  const notification = input.recipientUserId
    ? await prisma.notification.create({
        data: {
          recipientUserId: input.recipientUserId,
          notificationType: input.notificationType ?? 'sms',
          title: '(sms)',
          body: input.body,
          relatedEntityType: input.relatedEntityType,
          relatedEntityId: input.relatedEntityId,
        },
      })
    : null;

  let lastError: string | undefined;
  let lastProviderId: string | undefined;
  for (const link of chain.providers) {
    lastProviderId = link.id;
    const sendInput: SmsSendInput = {
      to: toNormalized,
      body: input.body,
      dltTemplateId: input.dltTemplateId,
    };
    const result = await link.provider.send(sendInput, link.context);

    await writeNotificationLog({
      notificationId: notification?.id ?? null,
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
      'sms send failed, trying next provider',
    );
  }

  return {
    ok: false,
    error: lastError ?? 'no providers available',
    providerId: lastProviderId ?? 'none',
    toNormalized,
  };
}

interface NotificationLogInput {
  notificationId: string | null;
  recipientAddress: string;
  status: string;
  providerMessageId: string | null;
  errorMessage: string | null;
  sentAt: Date | null;
}

async function writeNotificationLog(input: NotificationLogInput): Promise<void> {
  // notificationId is nullable now — system-emitted SMS without an anchor
  // get a log row regardless, which is what the rate-limit accounting needs.
  await rawPrisma.notificationLog.create({
    data: {
      notificationId: input.notificationId,
      channel: 'sms',
      recipientAddress: input.recipientAddress,
      status: input.status,
      providerMessageId: input.providerMessageId,
      errorMessage: input.errorMessage,
      sentAt: input.sentAt,
    },
  });
}

// -- admin helpers ------------------------------------------------------

export async function listSmsProviders(): Promise<
  {
    id: string;
    providerName: string;
    providerCode: string;
    senderId: string | null;
    isPrimary: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }[]
> {
  return prisma.smsProvider.findMany({
    select: {
      id: true,
      providerName: true,
      providerCode: true,
      senderId: true,
      isPrimary: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  });
}

export async function setPrimarySmsProvider(id: string): Promise<void> {
  await prisma.$transaction([
    rawPrisma.smsProvider.updateMany({ data: { isPrimary: false }, where: {} }),
    rawPrisma.smsProvider.update({ where: { id }, data: { isPrimary: true } }),
  ]);
  _invalidateSmsProviderCache();
}

export async function testSmsProvider(args: {
  id: string;
  to: string;
}): Promise<SmsSendResult & { providerId: string }> {
  const row = await prisma.smsProvider.findUnique({ where: { id: args.id } });
  if (!row) return { ok: false, error: 'provider not found', providerId: args.id };
  if (!isSupportedSmsProvider(row.providerCode)) {
    return { ok: false, error: `unsupported code ${row.providerCode}`, providerId: args.id };
  }
  if (!row.senderId) {
    return { ok: false, error: 'provider has no senderId', providerId: args.id };
  }
  const provider = createSmsProvider(
    row.providerCode,
    (row.configuration ?? {}) as Record<string, unknown>,
  );
  const r = await provider.send(
    {
      to: normalizePhone(args.to),
      body: `Test from ${row.providerName}`,
      // No dltTemplateId on test sends — the provider may reject if its
      // upstream requires DLT. That's the right signal: tests should be
      // run with a real registered template id when DLT applies.
    },
    { senderId: row.senderId },
  );
  return { ...r, providerId: row.id };
}

export type SmsProviderInputData = {
  providerName: string;
  providerCode: string;
  configuration: Prisma.InputJsonValue;
  senderId: string;
  isPrimary?: boolean;
  isActive?: boolean;
};

export async function createSmsProviderRecord(
  input: SmsProviderInputData,
): Promise<{ id: string }> {
  if (!isSupportedSmsProvider(input.providerCode)) {
    throw new Error(`Unsupported provider code: ${input.providerCode}`);
  }
  const created = await prisma.smsProvider.create({
    data: {
      providerName: input.providerName,
      providerCode: input.providerCode,
      configuration: input.configuration,
      senderId: input.senderId,
      isPrimary: input.isPrimary ?? false,
      isActive: input.isActive ?? true,
    },
  });
  if (input.isPrimary) await setPrimarySmsProvider(created.id);
  _invalidateSmsProviderCache();
  return { id: created.id };
}

export async function updateSmsProviderRecord(
  id: string,
  patch: Partial<SmsProviderInputData>,
): Promise<void> {
  const data: Record<string, unknown> = {};
  if (patch.providerName !== undefined) data.providerName = patch.providerName;
  if (patch.senderId !== undefined) data.senderId = patch.senderId;
  if (patch.configuration !== undefined) data.configuration = patch.configuration;
  if (patch.isActive !== undefined) data.isActive = patch.isActive;
  await prisma.smsProvider.update({ where: { id }, data });
  _invalidateSmsProviderCache();
}

export async function deleteSmsProviderRecord(id: string): Promise<void> {
  await prisma.smsProvider.delete({ where: { id } });
  _invalidateSmsProviderCache();
}
