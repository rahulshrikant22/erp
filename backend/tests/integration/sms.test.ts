/**
 * P0-16 integration tests — SMS provider abstraction.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { rawPrisma } from '../../src/lib/prisma-base';
import {
  _invalidateSmsProviderCache,
  normalizePhone,
  sendSmsRaw,
  sendSmsTemplate,
  SmsRateLimit,
} from '../../src/services/communication/sms-service';
import { SmsLogProvider } from '../../src/services/communication/sms-providers/log';
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
  SmsLogProvider.reset();
  _invalidateSmsProviderCache();
  await rawPrisma.smsProvider.deleteMany({});
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

const auth = (): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

// -- normalize ----------------------------------------------------------

describe('Phone normalization', () => {
  it('+91 prefix added to bare 10-digit Indian numbers', () => {
    expect(normalizePhone('9876543210')).toBe('+919876543210');
  });
  it('passes through already-prefixed E.164 numbers', () => {
    expect(normalizePhone('+12025551234')).toBe('+12025551234');
  });
  it('strips spaces and dashes', () => {
    expect(normalizePhone(' 98765 - 43210 ')).toBe('+919876543210');
  });
});

// -- DLT enforcement ---------------------------------------------------

describe('DLT enforcement', () => {
  it('off (default in tests): missing dltTemplateId is fine', async () => {
    expect(config.env.DLT_ENFORCEMENT_ENABLED).toBe(false);
    const r = await sendSmsRaw({
      to: '+919876543210',
      body: 'Test',
    });
    expect(r.ok).toBe(true);
  });
});

// -- LogProvider fallback ---------------------------------------------

describe('sendSmsTemplate via no-provider fallback', () => {
  it('uses LogProvider, captures the message, writes notification_log', async () => {
    const u = await createInternalUser();
    const phone = `+919${Math.floor(100000000 + Math.random() * 900000000)}`;
    const r = await sendSmsTemplate({
      to: phone,
      templateCode: 'login_otp',
      recipientUserId: u.id,
      variables: { orgName: 'Acme', otp: '123456', ttlMinutes: 5 },
    });
    expect(r.ok).toBe(true);
    expect(r.providerId).toBe('log');
    const captured = SmsLogProvider.getCaptured();
    expect(captured.at(-1)?.body).toContain('Acme');
    expect(captured.at(-1)?.body).toContain('123456');
    expect(captured.at(-1)?.dltTemplateId).toContain('LOGIN_OTP');

    const log = await rawPrisma.notificationLog.findFirst({
      where: { recipientAddress: phone, channel: 'sms', status: 'sent' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).toBeTruthy();
  });

  it('rejects an email template asked through the SMS service', async () => {
    const r = await sendSmsTemplate({
      to: '+919876543210',
      templateCode: 'password_reset', // email template
      variables: {},
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not an SMS template/i);
  });
});

// -- rate limiting ----------------------------------------------------

describe('Rate limiting', () => {
  it(`refuses after SMS_RATE_LIMIT_PER_HOUR (${config.env.SMS_RATE_LIMIT_PER_HOUR}) sends to the same phone`, async () => {
    const phone = `+919${Math.floor(100000000 + Math.random() * 900000000)}`;
    for (let i = 0; i < config.env.SMS_RATE_LIMIT_PER_HOUR; i++) {
      const r = await sendSmsRaw({ to: phone, body: `msg ${i + 1}` });
      expect(r.ok).toBe(true);
    }
    await expect(sendSmsRaw({ to: phone, body: 'one too many' })).rejects.toBeInstanceOf(
      SmsRateLimit,
    );
  });
});

// -- failover ---------------------------------------------------------

describe('Failover', () => {
  it('broken Twilio primary → log fallback succeeds via failure path', async () => {
    // Configure a Twilio provider with bad creds as primary; no other
    // active providers means after the broken try the chain falls through
    // to the in-memory LogProvider (loadChain adds it when zero are
    // configured — but we have one, so we explicitly add a 'log' row too).
    const broken = await rawPrisma.smsProvider.create({
      data: {
        providerName: 'Broken Twilio',
        providerCode: 'twilio',
        configuration: { accountSid: 'AC_bad', authToken: 'bad' },
        senderId: '+15555555555',
        isPrimary: true,
        isActive: true,
      },
    });
    const fallback = await rawPrisma.smsProvider.create({
      data: {
        providerName: 'Fallback log',
        providerCode: 'log',
        configuration: {},
        senderId: 'ERPLOG',
        isPrimary: false,
        isActive: true,
      },
    });
    _invalidateSmsProviderCache();

    try {
      const phone = `+919${Math.floor(100000000 + Math.random() * 900000000)}`;
      const r = await sendSmsRaw({ to: phone, body: 'failover test' });
      expect(r.ok).toBe(true);
      expect(r.providerId).toBe(fallback.id);

      const logs = await rawPrisma.notificationLog.findMany({
        where: { channel: 'sms', recipientAddress: phone },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs.length).toBeGreaterThanOrEqual(2);
      expect(logs.some((l) => l.status === 'failed')).toBe(true);
      expect(logs.some((l) => l.status === 'sent')).toBe(true);
    } finally {
      await rawPrisma.smsProvider.deleteMany({
        where: { id: { in: [broken.id, fallback.id] } },
      });
      _invalidateSmsProviderCache();
    }
  }, 30_000);
});

// -- admin routes -----------------------------------------------------

describe('Admin routes', () => {
  it('full CRUD + set-primary + test', async () => {
    const create = await request(app)
      .post('/api/admin/sms-providers')
      .set(auth())
      .send({
        providerName: 'Test log SMS',
        providerCode: 'log',
        configuration: {},
        senderId: 'TESTER',
        isPrimary: true,
      });
    expect(create.status).toBe(200);
    const id = create.body.data.id;

    const list = await request(app).get('/api/admin/sms-providers').set(auth());
    expect(list.body.data.providers.some((p: { id: string }) => p.id === id)).toBe(true);

    const t = await request(app)
      .post(`/api/admin/sms-providers/${id}/test`)
      .set(auth())
      .send({ to: '9876543210' });
    expect(t.status).toBe(200);
    expect(t.body.data.ok).toBe(true);

    const upd = await request(app)
      .put(`/api/admin/sms-providers/${id}`)
      .set(auth())
      .send({ providerName: 'Renamed' });
    expect(upd.status).toBe(200);

    const del = await request(app)
      .delete(`/api/admin/sms-providers/${id}`)
      .set(auth());
    expect(del.status).toBe(200);
  });

  it('rejects unsupported provider code', async () => {
    const res = await request(app)
      .post('/api/admin/sms-providers')
      .set(auth())
      .send({
        providerName: 'X',
        providerCode: 'pigeon_post',
        configuration: {},
        senderId: 'X',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/unsupported/i);
  });

  it('lists 3 seeded SMS templates', async () => {
    const res = await request(app).get('/api/admin/sms-templates').set(auth());
    expect(res.status).toBe(200);
    const codes = res.body.data.templates.map((t: { templateCode: string }) => t.templateCode);
    expect(codes).toEqual(expect.arrayContaining(['login_otp', 'password_reset_otp', 'mfa_otp']));
  });

  it('FORBIDDEN for users without COMM:comm:view', async () => {
    const customer = await createInternalUser({ roleCode: 'customer' });
    const t = (await loginInternal(app, customer.email, customer.password)).accessToken;
    const res = await request(app)
      .get('/api/admin/sms-providers')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(403);
  });
});
