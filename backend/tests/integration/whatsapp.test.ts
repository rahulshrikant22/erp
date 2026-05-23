/**
 * P0-17 integration tests — WhatsApp Business provider abstraction.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { rawPrisma } from '../../src/lib/prisma-base';
import {
  _invalidateWhatsAppProviderCache,
  normalizeWhatsAppPhone,
  sendWhatsAppSession,
  sendWhatsAppTemplate,
  WhatsAppRateLimit,
} from '../../src/services/communication/whatsapp-service';
import { WhatsAppLogProvider } from '../../src/services/communication/whatsapp-providers/log';
import { createInternalUser, loginInternal } from '../helpers';
import { config } from '../../src/config';

let app: Application;
let token: string;

beforeAll(async () => {
  app = createApp();
  const admin = await createInternalUser({ roleCode: 'super_admin' });
  token = (await loginInternal(app, admin.email, admin.password)).accessToken;
});

beforeEach(async () => {
  WhatsAppLogProvider.reset();
  _invalidateWhatsAppProviderCache();
  await rawPrisma.whatsappProvider.deleteMany({});
  await rawPrisma.communicationTemplate.deleteMany({ where: { channel: 'whatsapp' } });
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

const auth = (): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

// -- phone normalization ------------------------------------------------

describe('WhatsApp phone normalization', () => {
  it('strips + prefix', () => {
    expect(normalizeWhatsAppPhone('+919876543210')).toBe('919876543210');
  });
  it('prefixes 91 for bare 10-digit Indian numbers', () => {
    expect(normalizeWhatsAppPhone('9876543210')).toBe('919876543210');
  });
  it('strips spaces and dashes', () => {
    expect(normalizeWhatsAppPhone(' 98765 - 43210 ')).toBe('919876543210');
  });
  it('passes through already-prefixed international numbers', () => {
    expect(normalizeWhatsAppPhone('12025551234')).toBe('12025551234');
  });
});

// -- session send via log fallback --------------------------------------

describe('sendWhatsAppSession via LogProvider fallback', () => {
  it('sends and captures the message + writes notification_log', async () => {
    const phone = `919${Math.floor(100000000 + Math.random() * 900000000)}`;
    const r = await sendWhatsAppSession({
      to: phone,
      message: 'Hello from ERP test',
    });
    expect(r.ok).toBe(true);
    expect(r.providerId).toBe('log');
    expect(r.toNormalized).toBe(phone);

    const captured = WhatsAppLogProvider.getCaptured();
    expect(captured.at(-1)?.message).toBe('Hello from ERP test');
    expect(captured.at(-1)?.type).toBe('session');

    const log = await rawPrisma.notificationLog.findFirst({
      where: { recipientAddress: phone, channel: 'whatsapp', status: 'sent' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).toBeTruthy();
  });

  it('rejects invalid phone numbers', async () => {
    const r = await sendWhatsAppSession({ to: '123', message: 'test' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Invalid');
  });
});

// -- template send ------------------------------------------------------

describe('sendWhatsAppTemplate', () => {
  it('sends via approved template', async () => {
    await rawPrisma.communicationTemplate.create({
      data: {
        templateCode: 'wa_test_hello',
        name: 'Test Hello',
        channel: 'whatsapp',
        bodyTemplate: 'Hello {{name}}, your order {{orderId}} is confirmed.',
        waApprovalStatus: 'approved',
        isActive: true,
      },
    });

    const phone = `919${Math.floor(100000000 + Math.random() * 900000000)}`;
    const r = await sendWhatsAppTemplate({
      to: phone,
      templateCode: 'wa_test_hello',
      variables: { name: 'Rahul', orderId: 'ORD-001' },
    });
    expect(r.ok).toBe(true);

    const captured = WhatsAppLogProvider.getCaptured();
    expect(captured.at(-1)?.type).toBe('template');
    expect(captured.at(-1)?.templateName).toBe('wa_test_hello');
  });

  it('rejects unapproved template', async () => {
    await rawPrisma.communicationTemplate.create({
      data: {
        templateCode: 'wa_test_pending',
        name: 'Pending Template',
        channel: 'whatsapp',
        bodyTemplate: 'Test',
        waApprovalStatus: 'submitted',
        isActive: true,
      },
    });

    const r = await sendWhatsAppTemplate({
      to: '919876543210',
      templateCode: 'wa_test_pending',
      variables: {},
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('submitted');
  });

  it('rejects non-whatsapp template', async () => {
    const r = await sendWhatsAppTemplate({
      to: '919876543210',
      templateCode: 'password_reset',
      variables: {},
    });
    expect(r.ok).toBe(false);
  });
});

// -- rate limiting ------------------------------------------------------

describe('WhatsApp rate limiting', () => {
  it('throws WhatsAppRateLimit after exceeding per-hour cap', async () => {
    const phone = `919${Math.floor(100000000 + Math.random() * 900000000)}`;
    const limit = config.env.WHATSAPP_RATE_LIMIT_PER_HOUR;

    for (let i = 0; i < limit; i++) {
      await sendWhatsAppSession({ to: phone, message: `msg ${i}` });
    }

    await expect(
      sendWhatsAppSession({ to: phone, message: 'over limit' }),
    ).rejects.toThrow(WhatsAppRateLimit);
  });
});

// -- admin provider CRUD ------------------------------------------------

describe('Admin WhatsApp provider endpoints', () => {
  it('GET /api/admin/whatsapp-providers returns empty list + supported codes', async () => {
    const res = await request(app)
      .get('/api/admin/whatsapp-providers')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.providers).toEqual([]);
    expect(res.body.data.supported).toContain('interakt');
    expect(res.body.data.supported).toContain('wati');
    expect(res.body.data.supported).toContain('360dialog');
    expect(res.body.data.supported).toContain('gupshup_whatsapp');
    expect(res.body.data.supported).toContain('log');
  });

  it('POST + GET + PUT + DELETE lifecycle', async () => {
    const createRes = await request(app)
      .post('/api/admin/whatsapp-providers')
      .set(auth())
      .send({
        providerName: 'Test Interakt',
        providerCode: 'interakt',
        configuration: { apiKey: 'test-key' },
        phoneNumberId: '12345',
        isPrimary: true,
      });
    expect(createRes.status).toBe(200);
    const id = createRes.body.data.id;
    expect(id).toBeTruthy();

    const listRes = await request(app)
      .get('/api/admin/whatsapp-providers')
      .set(auth());
    expect(listRes.body.data.providers.length).toBe(1);
    expect(listRes.body.data.providers[0].providerName).toBe('Test Interakt');
    expect(listRes.body.data.providers[0].isPrimary).toBe(true);

    const updateRes = await request(app)
      .put(`/api/admin/whatsapp-providers/${id}`)
      .set(auth())
      .send({ providerName: 'Updated Interakt' });
    expect(updateRes.status).toBe(200);

    const deleteRes = await request(app)
      .delete(`/api/admin/whatsapp-providers/${id}`)
      .set(auth());
    expect(deleteRes.status).toBe(200);

    const afterDelete = await request(app)
      .get('/api/admin/whatsapp-providers')
      .set(auth());
    expect(afterDelete.body.data.providers.length).toBe(0);
  });

  it('rejects unsupported provider code', async () => {
    const res = await request(app)
      .post('/api/admin/whatsapp-providers')
      .set(auth())
      .send({
        providerName: 'Bad',
        providerCode: 'nonexistent',
        configuration: {},
      });
    expect(res.status).toBe(400);
  });
});

// -- admin WhatsApp template CRUD ----------------------------------------

describe('Admin WhatsApp template endpoints', () => {
  it('full CRUD lifecycle', async () => {
    const createRes = await request(app)
      .post('/api/admin/whatsapp-templates')
      .set(auth())
      .send({
        templateCode: 'wa_order_confirm',
        name: 'Order Confirmation',
        bodyTemplate: 'Hi {{name}}, order {{orderId}} confirmed.',
        waApprovalStatus: 'draft',
        waNamespace: 'test_ns',
        headerTemplate: 'Order Update',
        footerTemplate: 'OutDo Furnishings',
      });
    expect(createRes.status).toBe(200);
    const id = createRes.body.data.id;

    const getRes = await request(app)
      .get(`/api/admin/whatsapp-templates/${id}`)
      .set(auth());
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.waApprovalStatus).toBe('draft');
    expect(getRes.body.data.waNamespace).toBe('test_ns');
    expect(getRes.body.data.headerTemplate).toBe('Order Update');

    const updateRes = await request(app)
      .put(`/api/admin/whatsapp-templates/${id}`)
      .set(auth())
      .send({ waApprovalStatus: 'approved', footerTemplate: null });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.waApprovalStatus).toBe('approved');

    const deleteRes = await request(app)
      .delete(`/api/admin/whatsapp-templates/${id}`)
      .set(auth());
    expect(deleteRes.status).toBe(200);
  });

  it('rejects duplicate template code', async () => {
    await request(app)
      .post('/api/admin/whatsapp-templates')
      .set(auth())
      .send({
        templateCode: 'wa_dup_test',
        name: 'First',
        bodyTemplate: 'body',
      });
    const res = await request(app)
      .post('/api/admin/whatsapp-templates')
      .set(auth())
      .send({
        templateCode: 'wa_dup_test',
        name: 'Second',
        bodyTemplate: 'body',
      });
    expect(res.status).toBe(409);
  });
});

// -- webhook handler -----------------------------------------------------

describe('POST /api/webhooks/whatsapp', () => {
  it('GET verification challenge returns the challenge value', async () => {
    const res = await request(app)
      .get('/api/webhooks/whatsapp')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'my-token',
        'hub.challenge': 'abc123',
      });
    expect(res.status).toBe(200);
    expect(res.text).toBe('abc123');
  });

  it('updates delivery status from Cloud API payload', async () => {
    const msgId = `wamid.test-${Date.now()}`;
    await rawPrisma.notificationLog.create({
      data: {
        channel: 'whatsapp',
        recipientAddress: '919876543210',
        status: 'sent',
        providerMessageId: msgId,
        sentAt: new Date(),
      },
    });

    const res = await request(app)
      .post('/api/webhooks/whatsapp')
      .send({
        entry: [{
          changes: [{
            value: {
              statuses: [{ id: msgId, status: 'delivered' }],
            },
          }],
        }],
      });
    expect(res.status).toBe(200);

    const log = await rawPrisma.notificationLog.findFirst({
      where: { providerMessageId: msgId },
    });
    expect(log?.status).toBe('delivered');
    expect(log?.deliveredAt).toBeTruthy();
  });

  it('stores inbound message from Cloud API payload', async () => {
    const msgId = `wamid.inbound-${Date.now()}`;
    const res = await request(app)
      .post('/api/webhooks/whatsapp')
      .send({
        entry: [{
          changes: [{
            value: {
              messages: [{
                from: '919876543210',
                id: msgId,
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: 'text',
                text: { body: 'Hello from customer' },
              }],
            },
          }],
        }],
      });
    expect(res.status).toBe(200);

    const log = await rawPrisma.notificationLog.findFirst({
      where: { providerMessageId: msgId, channel: 'whatsapp' },
    });
    expect(log).toBeTruthy();
    expect(log?.recipientAddress).toBe('919876543210');
  });

  it('handles read receipt — advances status past delivered', async () => {
    const msgId = `wamid.read-${Date.now()}`;
    await rawPrisma.notificationLog.create({
      data: {
        channel: 'whatsapp',
        recipientAddress: '919876543210',
        status: 'delivered',
        providerMessageId: msgId,
        sentAt: new Date(),
        deliveredAt: new Date(),
      },
    });

    await request(app)
      .post('/api/webhooks/whatsapp')
      .send({
        entry: [{
          changes: [{
            value: {
              statuses: [{ id: msgId, status: 'read' }],
            },
          }],
        }],
      });

    const log = await rawPrisma.notificationLog.findFirst({
      where: { providerMessageId: msgId },
    });
    expect(log?.status).toBe('read');
    expect(log?.readAt).toBeTruthy();
  });

  it('does not regress status (delivered → sent ignored)', async () => {
    const msgId = `wamid.noregress-${Date.now()}`;
    await rawPrisma.notificationLog.create({
      data: {
        channel: 'whatsapp',
        recipientAddress: '919876543210',
        status: 'delivered',
        providerMessageId: msgId,
        sentAt: new Date(),
        deliveredAt: new Date(),
      },
    });

    await request(app)
      .post('/api/webhooks/whatsapp')
      .send({
        entry: [{
          changes: [{
            value: {
              statuses: [{ id: msgId, status: 'sent' }],
            },
          }],
        }],
      });

    const log = await rawPrisma.notificationLog.findFirst({
      where: { providerMessageId: msgId },
    });
    expect(log?.status).toBe('delivered');
  });
});
