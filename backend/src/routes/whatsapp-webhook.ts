/**
 * WhatsApp webhook handler — receives callbacks from BSPs.
 *
 *   POST /api/webhooks/whatsapp
 *   GET  /api/webhooks/whatsapp  (Meta/360dialog verification challenge)
 *
 * No auth middleware — the BSP sends these directly. We verify via HMAC
 * signature when the provider has a webhookSecret configured.
 *
 * Handles:
 *   - Delivery receipts  → update notification_log.status to 'delivered'
 *   - Read receipts      → update notification_log.status to 'read'
 *   - Failed statuses    → update notification_log.status to 'failed'
 *   - Inbound messages   → store in DB (Phase 6 CRM will act on them)
 *   - Inbound media      → download + store in core.documents
 */
import { Router } from 'express';
import { rawPrisma } from '../lib/prisma-base';
import { logger } from '../utils/logger';
import { uploadDocument } from '../services/documents';

const router = Router();

// -- Meta / 360dialog webhook verification (GET challenge) ---------------

router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token && challenge) {
    logger.info('whatsapp webhook verification challenge accepted');
    res.status(200).send(challenge);
    return;
  }
  res.status(403).send('Forbidden');
});

// -- POST handler -------------------------------------------------------

router.post('/', async (req, res, next) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      res.status(200).json({ ok: true });
      return;
    }

    // Cloud API (Meta / 360dialog) format
    if (body.entry) {
      await handleCloudApiPayload(body, req.headers);
      res.status(200).json({ ok: true });
      return;
    }

    // Gupshup format
    if (body.type && body.payload) {
      await handleGupshupPayload(body);
      res.status(200).json({ ok: true });
      return;
    }

    // Interakt format
    if (body.data?.message || body.data?.status) {
      await handleInteraktPayload(body);
      res.status(200).json({ ok: true });
      return;
    }

    // Wati format
    if (body.waId || body.eventType) {
      await handleWatiPayload(body);
      res.status(200).json({ ok: true });
      return;
    }

    logger.debug({ body: JSON.stringify(body).slice(0, 500) }, 'unrecognized whatsapp webhook payload');
    res.status(200).json({ ok: true });
  } catch (err) { next(err); }
});

// -- Cloud API (Meta / 360dialog) handler --------------------------------

interface CloudApiEntry {
  changes?: {
    value?: {
      statuses?: { id: string; status: string; timestamp?: string; errors?: { code: number; title: string }[] }[];
      messages?: {
        from: string;
        id: string;
        timestamp?: string;
        type: string;
        text?: { body: string };
        image?: { id: string; mime_type: string; sha256: string; caption?: string };
        document?: { id: string; mime_type: string; sha256: string; filename?: string; caption?: string };
        video?: { id: string; mime_type: string; sha256: string; caption?: string };
      }[];
    };
  }[];
}

async function handleCloudApiPayload(
  body: { entry?: CloudApiEntry[] },
  _headers: Record<string, unknown>,
): Promise<void> {
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const val = change.value;
      if (!val) continue;

      for (const status of val.statuses ?? []) {
        await updateDeliveryStatus(
          status.id,
          mapCloudStatus(status.status),
          status.errors?.[0]?.title,
        );
      }

      for (const msg of val.messages ?? []) {
        await storeInboundMessage({
          from: msg.from,
          providerMessageId: msg.id,
          body: msg.text?.body ?? msg.image?.caption ?? msg.document?.caption ?? '',
          mediaType: msg.type !== 'text' ? msg.type : undefined,
          mediaId: msg.image?.id ?? msg.document?.id ?? msg.video?.id,
          mediaMime: msg.image?.mime_type ?? msg.document?.mime_type ?? msg.video?.mime_type,
          mediaFilename: msg.document?.filename,
          timestamp: msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date(),
        });
      }
    }
  }
}

function mapCloudStatus(status: string): string {
  switch (status) {
    case 'sent': return 'sent';
    case 'delivered': return 'delivered';
    case 'read': return 'read';
    case 'failed': return 'failed';
    default: return status;
  }
}

// -- Gupshup handler ----------------------------------------------------

async function handleGupshupPayload(body: {
  type?: string;
  payload?: {
    id?: string;
    destination?: string;
    source?: string;
    type?: string;
    payload?: {
      text?: string;
      url?: string;
      contentType?: string;
      caption?: string;
    };
  };
}): Promise<void> {
  const type = body.type;
  const payload = body.payload;
  if (!payload) return;

  if (type === 'message-event') {
    const statusMap: Record<string, string> = {
      delivered: 'delivered', read: 'read', sent: 'sent', failed: 'failed',
      enqueued: 'sent',
    };
    const status = statusMap[payload.type ?? ''];
    if (status && payload.id) {
      await updateDeliveryStatus(payload.id, status);
    }
  } else if (type === 'message') {
    await storeInboundMessage({
      from: payload.source ?? '',
      providerMessageId: payload.id ?? '',
      body: payload.payload?.text ?? payload.payload?.caption ?? '',
      mediaType: payload.type !== 'text' ? payload.type : undefined,
      timestamp: new Date(),
    });
  }
}

// -- Interakt handler ---------------------------------------------------

async function handleInteraktPayload(body: {
  data?: {
    message?: { id?: string; from?: string; text?: string; type?: string };
    status?: { id?: string; status?: string };
  };
}): Promise<void> {
  const data = body.data;
  if (!data) return;

  if (data.status?.id) {
    const statusMap: Record<string, string> = {
      sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed',
    };
    const mapped = statusMap[data.status.status ?? ''];
    if (mapped) await updateDeliveryStatus(data.status.id, mapped);
  }

  if (data.message?.from) {
    await storeInboundMessage({
      from: data.message.from,
      providerMessageId: data.message.id ?? '',
      body: data.message.text ?? '',
      mediaType: data.message.type !== 'text' ? data.message.type : undefined,
      timestamp: new Date(),
    });
  }
}

// -- Wati handler -------------------------------------------------------

async function handleWatiPayload(body: {
  waId?: string;
  eventType?: string;
  text?: string;
  type?: string;
  id?: string;
  statusString?: string;
  timestamp?: string;
}): Promise<void> {
  if (body.eventType === 'message') {
    await storeInboundMessage({
      from: body.waId ?? '',
      providerMessageId: body.id ?? '',
      body: body.text ?? '',
      mediaType: body.type !== 'text' ? body.type : undefined,
      timestamp: body.timestamp ? new Date(body.timestamp) : new Date(),
    });
  } else if (body.eventType === 'status') {
    const statusMap: Record<string, string> = {
      sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed',
    };
    const mapped = statusMap[body.statusString ?? ''];
    if (mapped && body.id) await updateDeliveryStatus(body.id, mapped);
  }
}

// -- shared helpers -----------------------------------------------------

async function updateDeliveryStatus(
  providerMessageId: string,
  newStatus: string,
  errorMessage?: string,
): Promise<void> {
  const rows = await rawPrisma.notificationLog.findMany({
    where: { providerMessageId, channel: 'whatsapp' },
    select: { id: true, status: true },
  });
  if (rows.length === 0) {
    logger.debug({ providerMessageId, newStatus }, 'whatsapp status update for unknown message');
    return;
  }

  const statusOrder: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 };
  for (const row of rows) {
    const currentRank = statusOrder[row.status] ?? -1;
    const newRank = statusOrder[newStatus] ?? -1;
    // 'failed' always applies; otherwise only advance forward
    if (newStatus !== 'failed' && newRank <= currentRank) continue;

    const data: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'delivered') data.deliveredAt = new Date();
    if (newStatus === 'read') {
      data.readAt = new Date();
      if (!row.status || row.status === 'sent') data.deliveredAt = new Date();
    }
    if (errorMessage) data.errorMessage = errorMessage;
    await rawPrisma.notificationLog.update({ where: { id: row.id }, data });
  }

  logger.info({ providerMessageId, newStatus }, 'whatsapp delivery status updated');
}

interface InboundMessageInput {
  from: string;
  providerMessageId: string;
  body: string;
  mediaType?: string;
  mediaId?: string;
  mediaMime?: string;
  mediaFilename?: string;
  mediaUrl?: string;
  timestamp: Date;
}

async function storeInboundMessage(input: InboundMessageInput): Promise<void> {
  const log = await rawPrisma.notificationLog.create({
    data: {
      channel: 'whatsapp',
      recipientAddress: input.from,
      status: 'delivered',
      providerMessageId: input.providerMessageId,
      sentAt: input.timestamp,
      deliveredAt: input.timestamp,
    },
  });

  if (input.mediaUrl && input.mediaMime) {
    try {
      const res = await fetch(input.mediaUrl);
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        await uploadDocument({
          buffer,
          mimeType: input.mediaMime,
          originalName: input.mediaFilename ?? `wa-media-${input.providerMessageId}`,
          documentType: 'whatsapp_inbound',
          relatedEntityType: 'notification_log',
          relatedEntityId: log.id,
        });
      }
    } catch (err) {
      logger.warn({ err, mediaUrl: input.mediaUrl }, 'failed to download inbound whatsapp media');
    }
  }

  logger.info(
    { from: input.from, providerMessageId: input.providerMessageId, hasMedia: !!input.mediaType },
    'inbound whatsapp message stored',
  );
}

export default router;
