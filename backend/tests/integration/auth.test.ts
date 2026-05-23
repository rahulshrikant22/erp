/**
 * P0-05 integration tests — internal user auth (/api/auth/*).
 * Uses the live `erp_dev` database. Each test creates a unique user so the
 * suite stays parallel-safe and doesn't depend on order.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { createInternalUser, uniqueEmail } from '../helpers';

let app: Application;

beforeAll(() => {
  app = createApp();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/auth/login', () => {
  it('logs in successfully with valid credentials', async () => {
    const u = await createInternalUser();
    const res = await request(app).post('/api/auth/login').send({
      email: u.email,
      password: u.password,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(u.email);
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(typeof res.body.data.refreshToken).toBe('string');
    expect(typeof res.body.data.sessionId).toBe('string');
  });

  it('returns 401 on wrong password (no enumeration)', async () => {
    const u = await createInternalUser();
    const res = await request(app).post('/api/auth/login').send({
      email: u.email,
      password: 'definitely-not-the-password',
    });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('AUTH_ERROR');
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('returns the same generic error for unknown emails', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: uniqueEmail('nobody'),
      password: 'CorrectHorse!Battery9?Staple',
    });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password');
  });

  it('locks the account after 5 consecutive failures', async () => {
    const u = await createInternalUser();

    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/auth/login').send({
        email: u.email,
        password: 'wrong-password',
      });
      expect(res.status).toBe(401);
    }

    // 6th attempt — even with the *correct* password — must be locked.
    const res = await request(app).post('/api/auth/login').send({
      email: u.email,
      password: u.password,
    });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/locked/i);

    // DB confirms the lock.
    const dbUser = await prisma.user.findUnique({ where: { id: u.id } });
    expect(dbUser?.isLocked).toBe(true);
    expect(dbUser?.lockedUntil).toBeTruthy();
  });
});

describe('POST /api/auth/refresh', () => {
  it('issues a new access token from a valid refresh token', async () => {
    const u = await createInternalUser();
    const login = await request(app).post('/api/auth/login').send({
      email: u.email,
      password: u.password,
    });
    const refreshToken = login.body.data.refreshToken;

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(res.body.data.accessToken).not.toBe(login.body.data.accessToken);
  });

  it('rejects a tampered refresh token', async () => {
    const u = await createInternalUser();
    const login = await request(app).post('/api/auth/login').send({
      email: u.email,
      password: u.password,
    });
    const tampered = login.body.data.refreshToken.slice(0, -2) + 'xx';
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: tampered });
    expect(res.status).toBe(401);
  });
});

describe('Logout flows', () => {
  it('logout revokes the current session — subsequent /me fails', async () => {
    const u = await createInternalUser();
    const login = await request(app).post('/api/auth/login').send({
      email: u.email,
      password: u.password,
    });
    const access = login.body.data.accessToken;

    // Pre-logout: /me works.
    const ok = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${access}`);
    expect(ok.status).toBe(200);

    const lo = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${access}`);
    expect(lo.status).toBe(200);
    expect(lo.body.data.ok).toBe(true);

    // Post-logout: /me fails because the session row is revoked.
    const denied = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${access}`);
    expect(denied.status).toBe(401);
  });

  it('logout-all revokes every active session for the user', async () => {
    const u = await createInternalUser();
    const a = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
    const b = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
    const c = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });

    const all = await request(app)
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${a.body.data.accessToken}`);
    expect(all.status).toBe(200);
    expect(all.body.data.revokedCount).toBeGreaterThanOrEqual(3);

    for (const t of [a, b, c]) {
      const r = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${t.body.data.accessToken}`);
      expect(r.status).toBe(401);
    }
  });
});

describe('Forgot + reset password', () => {
  it('returns ok=true even for unknown emails (no enumeration)', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: uniqueEmail('nobody') });
    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);
  });

  it('end-to-end: request reset → use token → log in with new password', async () => {
    const u = await createInternalUser();

    const fp = await request(app).post('/api/auth/forgot-password').send({ email: u.email });
    expect(fp.status).toBe(200);
    expect(typeof fp.body.data.resetUrl).toBe('string'); // present in non-prod

    const url = new URL(fp.body.data.resetUrl);
    const token = url.searchParams.get('token')!;
    expect(token.length).toBeGreaterThan(20);

    const newPassword = 'BrandNew?Pa55word#Yes';
    const rs = await request(app).post('/api/auth/reset-password').send({ token, newPassword });
    expect(rs.status).toBe(200);

    // Old password no longer works.
    const oldFails = await request(app).post('/api/auth/login').send({
      email: u.email,
      password: u.password,
    });
    expect(oldFails.status).toBe(401);

    // New password works.
    const ok = await request(app).post('/api/auth/login').send({
      email: u.email,
      password: newPassword,
    });
    expect(ok.status).toBe(200);
  });
});

describe('Password policy', () => {
  it('rejects passwords below 12 chars', async () => {
    const u = await createInternalUser();
    const fp = await request(app).post('/api/auth/forgot-password').send({ email: u.email });
    const token = new URL(fp.body.data.resetUrl).searchParams.get('token')!;
    const res = await request(app).post('/api/auth/reset-password').send({
      token,
      newPassword: 'Short1!',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects passwords missing a character class', async () => {
    const u = await createInternalUser();
    const fp = await request(app).post('/api/auth/forgot-password').send({ email: u.email });
    const token = new URL(fp.body.data.resetUrl).searchParams.get('token')!;
    const res = await request(app).post('/api/auth/reset-password').send({
      token,
      newPassword: 'alllowercaselongbutweakk', // no upper, no digit, no symbol
    });
    expect(res.status).toBe(400);
  });

  it('rejects passwords containing the email or name', async () => {
    // Use a uniquely-suffixed email but a stable firstName so we can craft a
    // password that contains the forbidden substring deterministically.
    const u = await createInternalUser({
      email: uniqueEmail('jane'),
      firstName: 'Jane',
      lastName: 'Doe',
    });
    const fp = await request(app).post('/api/auth/forgot-password').send({ email: u.email });
    const token = new URL(fp.body.data.resetUrl).searchParams.get('token')!;
    const res = await request(app).post('/api/auth/reset-password').send({
      token,
      newPassword: 'janeStrong?Pa55word!',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/email or name/i);
  });

  it('rejects reuse of any of the last 5 passwords', async () => {
    const u = await createInternalUser();
    // Force a reset to the original password — should fail history check.
    const fp = await request(app).post('/api/auth/forgot-password').send({ email: u.email });
    const token = new URL(fp.body.data.resetUrl).searchParams.get('token')!;
    const res = await request(app).post('/api/auth/reset-password').send({
      token,
      newPassword: u.password,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/last 5/i);
  });
});

describe('Sessions listing', () => {
  it('lists active sessions and marks the current one', async () => {
    const u = await createInternalUser();
    const a = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
    await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });

    const res = await request(app)
      .get('/api/auth/sessions')
      .set('Authorization', `Bearer ${a.body.data.accessToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.sessions)).toBe(true);
    expect(res.body.data.sessions.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data.sessions.some((s: { isCurrent: boolean }) => s.isCurrent)).toBe(true);
  });
});
