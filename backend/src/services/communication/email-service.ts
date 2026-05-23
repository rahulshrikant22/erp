/**
 * High-level email service.
 *
 *   sendTemplate(toEmail, templateCode, variables, options?)
 *       → loads active providers ordered by primary-first
 *       → renders the template
 *       → tries each provider until one succeeds (or all fail)
 *       → writes a Notification + NotificationLog row per attempt
 *       → returns the SendResult of the winning attempt
 *
 *   sendRaw(input, options?)  — bypasses templates; same provider chain.
 *
 * If NO email providers are configured at all, falls back to the in-memory
 * `LogProvider` so dev/test sends never silently fail. The LogProvider
 * captures messages so tests can introspect.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { rawPrisma } from '../../lib/prisma-base';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { renderTemplate } from './templates';
import {
  createEmailProvider,
  isSupportedProvider,
} from './providers/factory';
import { LogProvider } from './providers/log';
import type {
  IEmailProvider,
  ProviderContext,
  SendInput,
  SendResult,
} from './providers/types';

// In-process cache of materialised providers — avoids re-reading the DB
// and re-instantiating SDKs on every send. Invalidated when admin routes
// mutate the EmailProvider table (we expose `_invalidateProviderCache`).
interface CachedChain {
  providers: { id: string; provider: IEmailProvider; context: ProviderContext }[];
  expiresAt: number;
}
const CHAIN_TTL_MS = 60 * 1000;
let chainCache: CachedChain | null = null;

export function _invalidateProviderCache(): void {
  chainCache = null;
}

async function loadChain(): Promise<CachedChain> {
  if (chainCache && chainCache.expiresAt > Date.now()) return chainCache;
  const rows = await prisma.emailProvider.findMany({
    where: { isActive: true },
    orderBy: [{ isPrimary: 'desc' }, { providerCode: 'asc' }],
  });

  const chain: { id: string; provider: IEmailProvider; context: ProviderContext }[] = [];
  for (const r of rows) {
    if (!isSupportedProvider(r.providerCode)) {
      logger.warn(
        { providerCode: r.providerCode, id: r.id },
        'skipping email provider with unknown code',
      );
      continue;
    }
    try {
      const provider = createEmailProvider(
        r.providerCode,
        (r.configuration ?? {}) as Record<string, unknown>,
      );
      chain.push({
        id: r.id,
        provider,
        context: { fromEmail: r.fromEmail, fromName: r.fromName ?? undefined },
      });
    } catch (err) {
      logger.error({ err, id: r.id, providerCode: r.providerCode }, 'failed to materialise provider');
    }
  }

  // No active providers configured? Fall back to LogProvider so callers
  // never silently fail. This matches how P0-05 behaved with jsonTransport.
  if (chain.length === 0) {
    chain.push({
      id: 'log',
      provider: new LogProvider(),
      context: { fromEmail: config.env.SMTP_FROM, fromName: config.env.SMTP_FROM_NAME },
    });
  }

  chainCache = { providers: chain, expiresAt: Date.now() + CHAIN_TTL_MS };
  return chainCache;
}

// -- public surface ------------------------------------------------------

export interface SendTemplateInput {
  to: string;
  templateCode: string;
  variables?: Record<string, unknown>;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  /** Anchor the resulting Notification + NotificationLog rows. */
  recipientUserId?: string;
  notificationType?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

export async function sendTemplate(
  input: SendTemplateInput,
): Promise<SendResult & { providerId: string }> {
  const rendered = await renderTemplate(input.templateCode, input.variables ?? {});
  return sendRaw({
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    replyTo: input.replyTo,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    notificationType: input.notificationType ?? input.templateCode,
    recipientUserId: input.recipientUserId,
    relatedEntityType: input.relatedEntityType,
    relatedEntityId: input.relatedEntityId,
  });
}

export interface SendRawInput {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  recipientUserId?: string;
  notificationType?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

export async function sendRaw(
  input: SendRawInput,
): Promise<SendResult & { providerId: string }> {
  const chain = await loadChain();

  const notification = input.recipientUserId
    ? await prisma.notification.create({
        data: {
          recipientUserId: input.recipientUserId,
          notificationType: input.notificationType ?? 'email',
          title: input.subject,
          body: input.text ?? input.html ?? '',
          relatedEntityType: input.relatedEntityType,
          relatedEntityId: input.relatedEntityId,
        },
      })
    : null;

  let lastError: string | undefined;
  let lastProviderId: string | undefined;
  for (const link of chain.providers) {
    lastProviderId = link.id;
    const sendInput: SendInput = {
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      cc: input.cc,
      bcc: input.bcc,
      replyTo: input.replyTo,
      externalId: notification?.id,
    };
    const result = await link.provider.send(sendInput, link.context);

    await writeNotificationLog({
      notificationId: notification?.id,
      emailProviderId: link.id === 'log' ? null : link.id,
      recipientAddress: input.to,
      status: result.ok ? 'sent' : 'failed',
      providerMessageId: result.providerMessageId ?? null,
      errorMessage: result.error ?? null,
      sentAt: result.ok ? new Date() : null,
    });

    if (result.ok) {
      return { ...result, providerId: link.id };
    }
    lastError = result.error;
    logger.warn(
      { providerCode: link.provider.providerCode, error: result.error },
      'email send failed, trying next provider',
    );
  }

  return {
    ok: false,
    error: lastError ?? 'no providers available',
    providerId: lastProviderId ?? 'none',
  };
}

interface NotificationLogInput {
  notificationId?: string | null;
  emailProviderId?: string | null;
  recipientAddress: string;
  status: string;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  sentAt?: Date | null;
}

async function writeNotificationLog(input: NotificationLogInput): Promise<void> {
  // notificationId is nullable as of P0-16 — log rows for system-emitted
  // messages no longer need a synthetic Notification anchor.
  await rawPrisma.notificationLog.create({
    data: {
      notificationId: input.notificationId ?? null,
      channel: 'email',
      emailProviderId: input.emailProviderId,
      recipientAddress: input.recipientAddress,
      status: input.status,
      providerMessageId: input.providerMessageId,
      errorMessage: input.errorMessage,
      sentAt: input.sentAt,
    },
  });
}

// -- admin helpers ------------------------------------------------------

export async function listProviders(): Promise<
  {
    id: string;
    providerName: string;
    providerCode: string;
    fromEmail: string;
    fromName: string | null;
    isPrimary: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }[]
> {
  return prisma.emailProvider.findMany({
    select: {
      id: true,
      providerName: true,
      providerCode: true,
      fromEmail: true,
      fromName: true,
      isPrimary: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  });
}

export async function setPrimaryProvider(id: string): Promise<void> {
  // Atomic single-primary: clear flag on every other row in a transaction.
  await prisma.$transaction([
    rawPrisma.emailProvider.updateMany({ data: { isPrimary: false }, where: {} }),
    rawPrisma.emailProvider.update({ where: { id }, data: { isPrimary: true } }),
  ]);
  _invalidateProviderCache();
}

export async function testProvider(args: {
  id: string;
  to: string;
}): Promise<SendResult & { providerId: string }> {
  const row = await prisma.emailProvider.findUnique({ where: { id: args.id } });
  if (!row) {
    return { ok: false, error: 'provider not found', providerId: args.id };
  }
  if (!isSupportedProvider(row.providerCode)) {
    return { ok: false, error: `unsupported provider code ${row.providerCode}`, providerId: args.id };
  }
  const provider = createEmailProvider(
    row.providerCode,
    (row.configuration ?? {}) as Record<string, unknown>,
  );
  const ctx: ProviderContext = { fromEmail: row.fromEmail, fromName: row.fromName ?? undefined };
  const r = await provider.send(
    {
      to: args.to,
      subject: `Test send from ${row.providerName}`,
      text: `If you can read this, ${row.providerCode} is working.`,
      html: `<p>If you can read this, <strong>${row.providerCode}</strong> is working.</p>`,
    },
    ctx,
  );
  return { ...r, providerId: row.id };
}

export type EmailProviderInputData = {
  providerName: string;
  providerCode: string;
  configuration: Prisma.InputJsonValue;
  fromEmail: string;
  fromName?: string | null;
  isPrimary?: boolean;
  isActive?: boolean;
};

export async function createProvider(input: EmailProviderInputData): Promise<{ id: string }> {
  if (!isSupportedProvider(input.providerCode)) {
    throw new Error(`Unsupported provider code: ${input.providerCode}`);
  }
  const created = await prisma.emailProvider.create({
    data: {
      providerName: input.providerName,
      providerCode: input.providerCode,
      configuration: input.configuration,
      fromEmail: input.fromEmail,
      fromName: input.fromName ?? null,
      isPrimary: input.isPrimary ?? false,
      isActive: input.isActive ?? true,
    },
  });
  if (input.isPrimary) await setPrimaryProvider(created.id);
  _invalidateProviderCache();
  return { id: created.id };
}

export async function updateProvider(
  id: string,
  patch: Partial<EmailProviderInputData>,
): Promise<void> {
  const data: Record<string, unknown> = {};
  if (patch.providerName !== undefined) data.providerName = patch.providerName;
  if (patch.fromEmail !== undefined) data.fromEmail = patch.fromEmail;
  if (patch.fromName !== undefined) data.fromName = patch.fromName;
  if (patch.configuration !== undefined) data.configuration = patch.configuration;
  if (patch.isActive !== undefined) data.isActive = patch.isActive;
  // providerCode is intentionally immutable — switching the provider type
  // would require new configuration anyway; better to delete and recreate.
  await prisma.emailProvider.update({ where: { id }, data });
  _invalidateProviderCache();
}

export async function deleteProvider(id: string): Promise<void> {
  await prisma.emailProvider.delete({ where: { id } });
  _invalidateProviderCache();
}
