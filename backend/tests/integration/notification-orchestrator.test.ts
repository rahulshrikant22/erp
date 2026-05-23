/**
 * P0-18 integration tests — Multi-channel notification orchestrator.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { rawPrisma } from '../../src/lib/prisma-base';
import { prisma } from '../../src/lib/prisma';
import { notify } from '../../src/services/notification-orchestrator';
import { WhatsAppLogProvider } from '../../src/services/communication/whatsapp-providers/log';
import { SmsLogProvider } from '../../src/services/communication/sms-providers/log';
import { _invalidateWhatsAppProviderCache } from '../../src/services/communication/whatsapp-service';
import { _invalidateSmsProviderCache } from '../../src/services/communication/sms-service';
import { _invalidateProviderCache as _invalidateEmailProviderCache } from '../../src/services/communication/email-service';
import { createInternalUser, loginInternal } from '../helpers';
import { randomUUID } from 'node:crypto';

let app: Application;
let token: string;
let adminUserId: string;
function uid() { return randomUUID().slice(0, 8).replace(/-/g, ''); }

beforeAll(async () => {
  app = createApp();
  const admin = await createInternalUser({ roleCode: 'super_admin' });
  adminUserId = admin.id;
  token = (await loginInternal(app, admin.email, admin.password)).accessToken;
});

beforeEach(async () => {
  WhatsAppLogProvider.reset();
  SmsLogProvider.reset();
  _invalidateWhatsAppProviderCache();
  _invalidateSmsProviderCache();
  _invalidateEmailProviderCache();
  await rawPrisma.whatsappProvider.deleteMany({});
  await rawPrisma.smsProvider.deleteMany({});
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

const auth = (): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

// -- notify() multi-channel dispatch ------------------------------------

describe('notify() orchestrator', () => {
  it('creates in-app notification even with no external templates', async () => {
    const user = await createInternalUser();
    const result = await notify(user.id, 'test.event', { foo: 'bar' });
    expect(result.inApp.ok).toBe(true);
    expect(result.inApp.notificationId).toBeTruthy();

    const n = await rawPrisma.notification.findUnique({
      where: { id: result.inApp.notificationId! },
    });
    expect(n?.recipientUserId).toBe(user.id);
    expect(n?.notificationType).toBe('test.event');
  });

  it('sends email when template exists and user has email', async () => {
    const user = await createInternalUser();
    const code = `welcome_${uid()}`;
    await rawPrisma.communicationTemplate.create({
      data: {
        templateCode: `${code}_email`,
        name: 'Welcome Email',
        channel: 'email',
        subjectTemplate: 'Welcome {{firstName}}',
        bodyTemplate: 'Hello {{firstName}}, welcome!',
        isActive: true,
      },
    });

    const result = await notify(user.id, code, { greeting: 'hi' });
    expect(result.email.attempted).toBe(true);
    expect(result.email.ok).toBe(true);
  });

  it('sends SMS when template exists and user has phone', async () => {
    const phone = `+919${Math.floor(100000000 + Math.random() * 900000000)}`;
    const user = await createInternalUser();
    await prisma.user.update({ where: { id: user.id }, data: { phone } });
    const code = `otp_${uid()}`;
    await rawPrisma.communicationTemplate.create({
      data: {
        templateCode: `${code}_sms`,
        name: 'OTP SMS',
        channel: 'sms',
        bodyTemplate: 'Your OTP is {{otp}}',
        isActive: true,
      },
    });

    const result = await notify(user.id, code, { otp: '123456' });
    expect(result.sms.attempted).toBe(true);
    expect(result.sms.ok).toBe(true);
    expect(SmsLogProvider.getCaptured().length).toBeGreaterThan(0);
  });

  it('respects user opt-out of SMS channel', async () => {
    const phone = `+919${Math.floor(100000000 + Math.random() * 900000000)}`;
    const user = await createInternalUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { phone, communicationPreferences: { email: true, sms: false, whatsapp: true, inApp: true } },
    });
    const code = `prefs_${uid()}`;
    await rawPrisma.communicationTemplate.create({
      data: {
        templateCode: `${code}_sms`,
        name: 'Prefs Test SMS',
        channel: 'sms',
        bodyTemplate: 'Test {{firstName}}',
        isActive: true,
      },
    });

    const result = await notify(user.id, code, {});
    expect(result.sms.attempted).toBe(false);
    expect(result.sms.skippedReason).toBe('opted out');
  });

  it('handles failure on one channel without blocking others', async () => {
    const user = await createInternalUser();
    const code = `isolation_${uid()}`;
    // Only email template exists; SMS/WhatsApp will be skipped (no template)
    await rawPrisma.communicationTemplate.create({
      data: {
        templateCode: `${code}_email`,
        name: 'Isolation Email',
        channel: 'email',
        subjectTemplate: 'Test',
        bodyTemplate: 'Test body',
        isActive: true,
      },
    });

    const result = await notify(user.id, code, {});
    expect(result.inApp.ok).toBe(true);
    expect(result.email.ok).toBe(true);
    expect(result.sms.attempted).toBe(false);
    expect(result.whatsapp.attempted).toBe(false);
  });

  it('returns user-not-found gracefully', async () => {
    const result = await notify('00000000-0000-0000-0000-000000000000', 'test.event', {});
    expect(result.inApp.ok).toBe(false);
    expect(result.email.skippedReason).toContain('not found');
  });
});

// -- in-app notification endpoints --------------------------------------

describe('GET /api/notifications', () => {
  it('lists notifications for the current user', async () => {
    await prisma.notification.create({
      data: {
        recipientUserId: adminUserId,
        notificationType: 'test',
        title: 'Test Notification',
        body: 'Hello admin',
      },
    });

    const res = await request(app).get('/api/notifications').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.notifications.length).toBeGreaterThan(0);
    expect(res.body.data.unread).toBeGreaterThan(0);
  });
});

describe('GET /api/notifications/unread-count', () => {
  it('returns the unread count', async () => {
    const res = await request(app).get('/api/notifications/unread-count').set(auth());
    expect(res.status).toBe(200);
    expect(typeof res.body.data.count).toBe('number');
  });
});

describe('POST /api/notifications/:id/mark-read', () => {
  it('marks a specific notification as read', async () => {
    const n = await prisma.notification.create({
      data: {
        recipientUserId: adminUserId,
        notificationType: 'test.mark',
        title: 'Mark Me',
        body: 'Read test',
      },
    });

    const res = await request(app)
      .post(`/api/notifications/${n.id}/mark-read`)
      .set(auth());
    expect(res.status).toBe(200);

    const updated = await rawPrisma.notification.findUnique({ where: { id: n.id } });
    expect(updated?.isRead).toBe(true);
    expect(updated?.readAt).toBeTruthy();
  });

  it('returns 404 for non-existent or other users notification', async () => {
    const res = await request(app)
      .post('/api/notifications/00000000-0000-0000-0000-000000000000/mark-read')
      .set(auth());
    expect(res.status).toBe(404);
  });
});

describe('POST /api/notifications/mark-all-read', () => {
  it('marks all unread as read', async () => {
    await prisma.notification.createMany({
      data: [
        { recipientUserId: adminUserId, notificationType: 'bulk1', title: 'A', body: 'A' },
        { recipientUserId: adminUserId, notificationType: 'bulk2', title: 'B', body: 'B' },
      ],
    });

    const res = await request(app)
      .post('/api/notifications/mark-all-read')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.markedRead).toBeGreaterThanOrEqual(2);

    const countRes = await request(app).get('/api/notifications/unread-count').set(auth());
    expect(countRes.body.data.count).toBe(0);
  });
});

// -- communication preferences ------------------------------------------

describe('GET/PUT /api/notifications/preferences', () => {
  it('returns defaults when user has no prefs set', async () => {
    const res = await request(app).get('/api/notifications/preferences').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.preferences.email).toBe(true);
    expect(res.body.data.preferences.sms).toBe(true);
  });

  it('updates preferences partially', async () => {
    const putRes = await request(app)
      .put('/api/notifications/preferences')
      .set(auth())
      .send({ sms: false });
    expect(putRes.status).toBe(200);
    expect(putRes.body.data.preferences.sms).toBe(false);
    expect(putRes.body.data.preferences.email).toBe(true);

    const getRes = await request(app).get('/api/notifications/preferences').set(auth());
    expect(getRes.body.data.preferences.sms).toBe(false);
  });
});

// -- admin notification log ---------------------------------------------

describe('GET /api/admin/notifications/log', () => {
  it('returns notification log entries', async () => {
    const res = await request(app)
      .get('/api/admin/notifications/log')
      .set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.logs)).toBe(true);
    expect(typeof res.body.data.total).toBe('number');
  });

  it('filters by channel', async () => {
    const res = await request(app)
      .get('/api/admin/notifications/log?channel=whatsapp')
      .set(auth());
    expect(res.status).toBe(200);
    for (const log of res.body.data.logs) {
      expect(log.channel).toBe('whatsapp');
    }
  });
});

describe('POST /api/admin/notifications/test', () => {
  it('triggers a test notification for a user', async () => {
    const user = await createInternalUser();
    const res = await request(app)
      .post('/api/admin/notifications/test')
      .set(auth())
      .send({
        recipientUserId: user.id,
        eventCode: 'admin.test_fire',
        variables: { note: 'testing' },
      });
    expect(res.status).toBe(200);
    expect(res.body.data.inApp.ok).toBe(true);
  });
});
