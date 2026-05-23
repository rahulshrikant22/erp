/**
 * P0-19 integration tests — MFA, DPDP, security headers.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import * as OTPAuth from 'otpauth';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { rawPrisma } from '../../src/lib/prisma-base';
import { createInternalUser, loginInternal } from '../helpers';

let app: Application;
let adminToken: string;
let adminUserId: string;

beforeAll(async () => {
  app = createApp();
  const admin = await createInternalUser({ roleCode: 'super_admin' });
  adminUserId = admin.id;
  adminToken = (await loginInternal(app, admin.email, admin.password)).accessToken;
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

const auth = (t?: string) => ({ Authorization: `Bearer ${t ?? adminToken}` });

// -- MFA flow ---------------------------------------------------------------

describe('MFA (TOTP)', () => {
  let userEmail: string;
  let userPassword: string;
  let userToken: string;
  let totpSecret: string;
  let backupCodes: string[];

  it('setup returns secret and backup codes', async () => {
    const user = await createInternalUser();
    userEmail = user.email;
    userPassword = user.password;
    userToken = (await loginInternal(app, user.email, user.password)).accessToken;

    const res = await request(app)
      .post('/api/auth/mfa/setup')
      .set(auth(userToken));
    expect(res.status).toBe(200);
    expect(res.body.data.secret).toBeTruthy();
    expect(res.body.data.otpauthUri).toContain('otpauth://totp/');
    expect(res.body.data.backupCodes).toHaveLength(10);
    totpSecret = res.body.data.secret;
    backupCodes = res.body.data.backupCodes;
  });

  it('verify-setup activates MFA with valid TOTP code', async () => {
    const totp = new OTPAuth.TOTP({
      issuer: 'ModularFurnitureERP',
      label: 'ERP',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(totpSecret),
    });
    const code = totp.generate();

    const res = await request(app)
      .post('/api/auth/mfa/verify-setup')
      .set(auth(userToken))
      .send({ code });
    expect(res.status).toBe(200);
    expect(res.body.data.mfaEnabled).toBe(true);
  });

  it('login returns mfaRequired + tempToken when MFA is enabled', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: userEmail, password: userPassword });
    expect(res.status).toBe(200);
    expect(res.body.data.mfaRequired).toBe(true);
    expect(res.body.data.tempToken).toBeTruthy();
  });

  it('mfa/verify with valid TOTP code issues full tokens', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: userEmail, password: userPassword });
    const tempToken = loginRes.body.data.tempToken;

    const totp = new OTPAuth.TOTP({
      issuer: 'ModularFurnitureERP',
      label: 'ERP',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(totpSecret),
    });
    const code = totp.generate();

    const res = await request(app)
      .post('/api/auth/mfa/verify')
      .send({ tempToken, code });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    expect(res.body.data.user.email).toBe(userEmail);
  });

  it('mfa/verify with invalid code returns error', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: userEmail, password: userPassword });
    const tempToken = loginRes.body.data.tempToken;

    const res = await request(app)
      .post('/api/auth/mfa/verify')
      .send({ tempToken, code: '000000' });
    expect(res.status).toBe(401);
  });

  it('mfa/verify with backup code issues full tokens and consumes code', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: userEmail, password: userPassword });
    const tempToken = loginRes.body.data.tempToken;

    const backupCode = backupCodes[0];
    const res = await request(app)
      .post('/api/auth/mfa/verify')
      .send({ tempToken, code: backupCode });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();

    // Same backup code should not work a second time
    const loginRes2 = await request(app)
      .post('/api/auth/login')
      .send({ email: userEmail, password: userPassword });
    const res2 = await request(app)
      .post('/api/auth/mfa/verify')
      .send({ tempToken: loginRes2.body.data.tempToken, code: backupCode });
    expect(res2.status).toBe(401);
  });

  it('regenerate-backup-codes returns new codes', async () => {
    // Get fresh token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: userEmail, password: userPassword });
    const totp = new OTPAuth.TOTP({
      issuer: 'ModularFurnitureERP',
      label: 'ERP',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(totpSecret),
    });
    const verifyRes = await request(app)
      .post('/api/auth/mfa/verify')
      .send({ tempToken: loginRes.body.data.tempToken, code: totp.generate() });
    const freshToken = verifyRes.body.data.accessToken;

    const res = await request(app)
      .post('/api/auth/mfa/regenerate-backup-codes')
      .set(auth(freshToken));
    expect(res.status).toBe(200);
    expect(res.body.data.backupCodes).toHaveLength(10);
    expect(res.body.data.backupCodes).not.toEqual(backupCodes);
  });

  it('disable MFA with password + code', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: userEmail, password: userPassword });
    const totp = new OTPAuth.TOTP({
      issuer: 'ModularFurnitureERP',
      label: 'ERP',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(totpSecret),
    });
    const code = totp.generate();
    const verifyRes = await request(app)
      .post('/api/auth/mfa/verify')
      .send({ tempToken: loginRes.body.data.tempToken, code });
    const freshToken = verifyRes.body.data.accessToken;

    const disableRes = await request(app)
      .post('/api/auth/mfa/disable')
      .set(auth(freshToken))
      .send({ password: userPassword, code: totp.generate() });
    expect(disableRes.status).toBe(200);
    expect(disableRes.body.data.mfaEnabled).toBe(false);

    // Login should now succeed without MFA
    const normalLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: userEmail, password: userPassword });
    expect(normalLogin.body.data.accessToken).toBeTruthy();
    expect(normalLogin.body.data.mfaRequired).toBeUndefined();
  });
});

// -- Security headers -------------------------------------------------------

describe('Security headers (helmet)', () => {
  it('sets standard security headers', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('does not expose x-powered-by', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

// -- DPDP compliance --------------------------------------------------------

describe('DPDP consent', () => {
  it('captures consent', async () => {
    const res = await request(app)
      .post('/api/dpdp/consent')
      .set(auth())
      .send({ consentType: 'privacy' });
    expect(res.status).toBe(200);
    expect(res.body.data.consentType).toBe('privacy');
    expect(res.body.data.userId).toBe(adminUserId);
  });

  it('lists consents for current user', async () => {
    const res = await request(app)
      .get('/api/dpdp/consents')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.consents.length).toBeGreaterThan(0);
  });

  it('withdraws consent', async () => {
    await request(app)
      .post('/api/dpdp/consent')
      .set(auth())
      .send({ consentType: 'marketing' });

    const res = await request(app)
      .post('/api/dpdp/withdraw-consent')
      .set(auth())
      .send({ consentType: 'marketing', reason: 'Too many emails' });
    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);
  });

  it('withdraw of non-existent consent returns 404', async () => {
    const res = await request(app)
      .post('/api/dpdp/withdraw-consent')
      .set(auth())
      .send({ consentType: 'nonexistent' });
    expect(res.status).toBe(404);
  });
});

describe('DPDP data requests', () => {
  it('creates an export request', async () => {
    const res = await request(app)
      .post('/api/dpdp/export-request')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.requestType).toBe('export');
    expect(res.body.data.status).toBe('submitted');
  });

  it('prevents duplicate pending export requests', async () => {
    const user = await createInternalUser();
    const token = (await loginInternal(app, user.email, user.password)).accessToken;

    await request(app).post('/api/dpdp/export-request').set(auth(token));
    const res = await request(app).post('/api/dpdp/export-request').set(auth(token));
    expect(res.status).toBe(400);
  });

  it('creates an erasure request', async () => {
    const user = await createInternalUser();
    const token = (await loginInternal(app, user.email, user.password)).accessToken;

    const res = await request(app)
      .post('/api/dpdp/erasure-request')
      .set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data.requestType).toBe('erasure');
    expect(res.body.data.status).toBe('submitted');
  });

  it('admin can process (approve/reject) a request', async () => {
    const user = await createInternalUser();
    const token = (await loginInternal(app, user.email, user.password)).accessToken;

    const createRes = await request(app)
      .post('/api/dpdp/export-request')
      .set(auth(token));
    const requestId = createRes.body.data.id;

    const res = await request(app)
      .post(`/api/dpdp/requests/${requestId}/process`)
      .set(auth())
      .send({ action: 'approve' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('processing');
  });

  it('admin can complete a processing request', async () => {
    const user = await createInternalUser();
    const token = (await loginInternal(app, user.email, user.password)).accessToken;

    const createRes = await request(app)
      .post('/api/dpdp/export-request')
      .set(auth(token));
    const requestId = createRes.body.data.id;

    await request(app)
      .post(`/api/dpdp/requests/${requestId}/process`)
      .set(auth())
      .send({ action: 'approve' });

    const res = await request(app)
      .post(`/api/dpdp/requests/${requestId}/complete`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('completed');
  });

  it('lists requests for current user', async () => {
    const res = await request(app)
      .get('/api/dpdp/requests')
      .set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.requests)).toBe(true);
  });
});
