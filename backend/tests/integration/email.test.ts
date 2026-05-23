/**
 * P0-15 integration tests — provider abstraction, templating, failover,
 * notification_log, admin routes.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { rawPrisma } from '../../src/lib/prisma-base';
import {
  _renderRaw,
  renderTemplate,
} from '../../src/services/communication/templates';
import {
  _invalidateProviderCache,
  sendTemplate,
} from '../../src/services/communication/email-service';
import { LogProvider } from '../../src/services/communication/providers/log';
import { createInternalUser, loginInternal } from '../helpers';

let app: Application;
let token: string;

beforeAll(async () => {
  app = createApp();
  const admin = await createInternalUser({ roleCode: 'super_admin' });
  token = (await loginInternal(app, admin.email, admin.password)).accessToken;
});

beforeEach(async () => {
  LogProvider.reset();
  _invalidateProviderCache();
  // Wipe any email_providers left behind by prior test runs so the
  // "no provider configured → falls back to LogProvider" path is reliable.
  await rawPrisma.emailProvider.deleteMany({});
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

const auth = (): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

// -- pure renderer ---------------------------------------------------

describe('Template renderer', () => {
  it('substitutes flat and nested variables', () => {
    const r = _renderRaw(
      'Hi {{user.firstName}}',
      '<p>Welcome to {{org.name}}, your code is {{code}}</p>',
      { user: { firstName: 'Sam' }, org: { name: 'Acme' }, code: 'X1' },
    );
    expect(r.subject).toBe('Hi Sam');
    expect(r.html).toContain('Welcome to Acme');
    expect(r.text).toContain('Welcome to Acme');
  });

  it('missing variables render as empty', () => {
    const r = _renderRaw('{{a}} {{missing}} {{b}}', '<p>{{x}}</p>', { a: 1, b: 2 });
    expect(r.subject).toBe('1  2');
    expect(r.html).toBe('<p></p>');
  });

  it('htmlToText strips tags + handles entities', () => {
    const r = _renderRaw('s', '<p>Hello <b>world</b></p><p>Line two</p>', {});
    expect(r.text.replace(/\s+/g, ' ').trim()).toBe('Hello world Line two');
  });
});

describe('renderTemplate (DB)', () => {
  it('loads a seeded template by code', async () => {
    const r = await renderTemplate('password_reset', {
      firstName: 'A',
      orgName: 'X',
      resetUrl: 'https://example.com/r',
      ttlMinutes: 60,
    });
    expect(r.subject).toContain('X');
    expect(r.html).toContain('https://example.com/r');
  });

  it('throws NotFoundError on unknown code', async () => {
    await expect(renderTemplate('does_not_exist', {})).rejects.toThrowError(/not found/i);
  });
});

// -- send + log + failover ------------------------------------------

describe('sendTemplate via no-provider fallback (LogProvider)', () => {
  it('captures the email and writes a notification_log row', async () => {
    const u = await createInternalUser();
    const r = await sendTemplate({
      to: 'someone@example.com',
      templateCode: 'password_reset',
      recipientUserId: u.id,
      variables: {
        firstName: 'Sam',
        orgName: 'Acme',
        resetUrl: 'https://acme.example/r',
        ttlMinutes: 60,
      },
    });
    expect(r.ok).toBe(true);
    const captured = LogProvider.getCaptured();
    expect(captured.at(-1)?.subject).toContain('Acme');
    expect(captured.at(-1)?.html).toContain('https://acme.example/r');

    // notification_log row exists.
    const log = await rawPrisma.notificationLog.findFirst({
      where: { recipientAddress: 'someone@example.com', status: 'sent' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).toBeTruthy();
    expect(log?.providerMessageId).toMatch(/^log-/);
  });
});

describe('Provider failover', () => {
  it('tries primary first; on failure falls through to next active provider', async () => {
    // Create a "broken" provider primary + a working SMTP fallback (no host
    // → jsonTransport → always succeeds).
    const broken = await rawPrisma.emailProvider.create({
      data: {
        providerName: 'Broken SMTP',
        providerCode: 'smtp',
        // host points at an unreachable address; nodemailer will time out.
        configuration: { host: '127.0.0.1', port: 1, user: 'x', pass: 'y' },
        fromEmail: 'noreply@example.com',
        isPrimary: true,
        isActive: true,
      },
    });
    const working = await rawPrisma.emailProvider.create({
      data: {
        providerName: 'Working',
        providerCode: 'smtp',
        configuration: {}, // no host → jsonTransport
        fromEmail: 'noreply2@example.com',
        isPrimary: false,
        isActive: true,
      },
    });
    _invalidateProviderCache();

    try {
      const u = await createInternalUser();
      const r = await sendTemplate({
        to: 'failover@example.com',
        templateCode: 'password_reset',
        recipientUserId: u.id,
        variables: {
          firstName: 'F',
          orgName: 'X',
          resetUrl: 'https://x',
          ttlMinutes: 60,
        },
      });
      expect(r.ok).toBe(true);
      // The successful providerId should be the working one, not the broken one.
      expect(r.providerId).toBe(working.id);

      // notification_log shows both attempts — one failed, one sent.
      // (We don't assert exact emailProviderId values; the chain order +
      // returned providerId already proves the failover behaviour, and the
      // log table is a separate concern.)
      const logs = await rawPrisma.notificationLog.findMany({
        where: { recipientAddress: 'failover@example.com' },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs.length).toBeGreaterThanOrEqual(2);
      expect(logs.some((l) => l.status === 'failed')).toBe(true);
      expect(logs.some((l) => l.status === 'sent')).toBe(true);
    } finally {
      await rawPrisma.emailProvider.deleteMany({
        where: { id: { in: [broken.id, working.id] } },
      });
      _invalidateProviderCache();
    }
  }, 30_000);
});

// -- admin routes ----------------------------------------------------

describe('Email-provider admin routes', () => {
  it('full CRUD + set-primary + test', async () => {
    const create = await request(app)
      .post('/api/admin/email-providers')
      .set(auth())
      .send({
        providerName: 'Local SMTP',
        providerCode: 'smtp',
        configuration: {}, // jsonTransport
        fromEmail: 'noreply@example.com',
        fromName: 'Modular ERP',
        isPrimary: true,
      });
    expect(create.status).toBe(200);
    const id = create.body.data.id;

    const list = await request(app).get('/api/admin/email-providers').set(auth());
    expect(list.body.data.providers.some((p: { id: string }) => p.id === id)).toBe(true);

    const t = await request(app)
      .post(`/api/admin/email-providers/${id}/test`)
      .set(auth())
      .send({ to: 'tester@example.com' });
    expect(t.status).toBe(200);
    expect(t.body.data.ok).toBe(true);

    const upd = await request(app)
      .put(`/api/admin/email-providers/${id}`)
      .set(auth())
      .send({ providerName: 'Local SMTP v2', isActive: false });
    expect(upd.status).toBe(200);

    const del = await request(app)
      .delete(`/api/admin/email-providers/${id}`)
      .set(auth());
    expect(del.status).toBe(200);
  });

  it('rejects unsupported provider code', async () => {
    const res = await request(app)
      .post('/api/admin/email-providers')
      .set(auth())
      .send({
        providerName: 'X',
        providerCode: 'pigeon_post',
        configuration: {},
        fromEmail: 'a@b.com',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/unsupported/i);
  });
});

describe('Email-template admin routes', () => {
  it('lists seeded templates + supports CRUD', async () => {
    const list = await request(app).get('/api/admin/email-templates').set(auth());
    expect(list.status).toBe(200);
    const codes = list.body.data.templates.map((t: { templateCode: string }) => t.templateCode);
    expect(codes).toEqual(expect.arrayContaining([
      'welcome_user', 'password_reset', 'account_locked', 'login_alert',
    ]));

    const code = `tpl_${randomUUID().slice(0, 6)}`;
    const create = await request(app)
      .post('/api/admin/email-templates')
      .set(auth())
      .send({
        templateCode: code,
        name: 'Custom',
        subjectTemplate: 'Hi {{firstName}}',
        bodyTemplate: '<p>Body for {{firstName}}</p>',
      });
    expect(create.status).toBe(200);

    const upd = await request(app)
      .put(`/api/admin/email-templates/${create.body.data.id}`)
      .set(auth())
      .send({ subjectTemplate: 'Hello again {{firstName}}' });
    expect(upd.body.data.subjectTemplate).toContain('Hello again');

    const del = await request(app)
      .delete(`/api/admin/email-templates/${create.body.data.id}`)
      .set(auth());
    expect(del.status).toBe(200);
  });
});

describe('Permission gating', () => {
  it('FORBIDDEN for users without COMM:comm:view', async () => {
    const customer = await createInternalUser({ roleCode: 'customer' });
    const t = (await loginInternal(app, customer.email, customer.password)).accessToken;
    const res = await request(app)
      .get('/api/admin/email-providers')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(403);
  });
});
