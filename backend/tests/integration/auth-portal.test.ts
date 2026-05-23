/**
 * P0-05 integration tests — customer portal auth (/api/portal/auth/*).
 * Smaller suite than internal auth (no lockout flag on customer users yet);
 * covers the parity-critical paths: login, refresh, logout, reset, /me.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { createCustomerUser } from '../helpers';

let app: Application;

beforeAll(() => {
  app = createApp();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Portal /api/portal/auth/login', () => {
  it('logs in a customer user', async () => {
    const u = await createCustomerUser();
    const res = await request(app).post('/api/portal/auth/login').send({
      email: u.email,
      password: u.password,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(u.id);
    expect(res.body.data.user.customerAccountId).toBe(u.accountId);
  });

  it('rejects wrong passwords', async () => {
    const u = await createCustomerUser();
    const res = await request(app).post('/api/portal/auth/login').send({
      email: u.email,
      password: 'nope',
    });
    expect(res.status).toBe(401);
  });
});

describe('Portal token isolation', () => {
  it('a customer access token cannot reach /api/auth/me (internal only)', async () => {
    const u = await createCustomerUser();
    const login = await request(app).post('/api/portal/auth/login').send({
      email: u.email,
      password: u.password,
    });
    const access = login.body.data.accessToken;
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${access}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('and vice-versa: an internal token cannot reach /api/portal/auth/me', async () => {
    // Create a quick internal login by reaching back into prisma directly.
    const password = 'CorrectHorse!Battery9?Staple';
    const { hashPassword } = await import('../../src/services/password');
    const hash = await hashPassword(password);
    const intUser = await prisma.user.create({
      data: {
        email: `int-${Date.now()}@example.com`,
        firstName: 'X',
        lastName: 'Y',
        passwordHash: hash,
        userType: 'internal',
        isActive: true,
      },
    });
    const login = await request(app).post('/api/auth/login').send({
      email: intUser.email,
      password,
    });
    const res = await request(app)
      .get('/api/portal/auth/me')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);
    expect(res.status).toBe(403);
  });
});

describe('Portal refresh + logout', () => {
  it('refresh issues a new access token', async () => {
    const u = await createCustomerUser();
    const login = await request(app).post('/api/portal/auth/login').send({
      email: u.email,
      password: u.password,
    });
    const res = await request(app).post('/api/portal/auth/refresh').send({
      refreshToken: login.body.data.refreshToken,
    });
    expect(res.status).toBe(200);
    expect(typeof res.body.data.accessToken).toBe('string');
  });

  it('logout revokes the current portal session', async () => {
    const u = await createCustomerUser();
    const login = await request(app).post('/api/portal/auth/login').send({
      email: u.email,
      password: u.password,
    });
    const access = login.body.data.accessToken;

    const lo = await request(app)
      .post('/api/portal/auth/logout')
      .set('Authorization', `Bearer ${access}`);
    expect(lo.status).toBe(200);

    const denied = await request(app)
      .get('/api/portal/auth/me')
      .set('Authorization', `Bearer ${access}`);
    expect(denied.status).toBe(401);
  });
});

describe('Portal forgot/reset', () => {
  it('end-to-end reset works', async () => {
    const u = await createCustomerUser();

    const fp = await request(app).post('/api/portal/auth/forgot-password').send({ email: u.email });
    expect(fp.status).toBe(200);
    expect(typeof fp.body.data.resetUrl).toBe('string');
    const token = new URL(fp.body.data.resetUrl).searchParams.get('token')!;

    const newPassword = 'PortalNew?Pass99!';
    const rs = await request(app).post('/api/portal/auth/reset-password').send({ token, newPassword });
    expect(rs.status).toBe(200);

    const old = await request(app).post('/api/portal/auth/login').send({
      email: u.email,
      password: u.password,
    });
    expect(old.status).toBe(401);

    const ok = await request(app).post('/api/portal/auth/login').send({
      email: u.email,
      password: newPassword,
    });
    expect(ok.status).toBe(200);
  });
});
