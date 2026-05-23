/**
 * P0-21 integration tests — Customer portal foundation.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { rawPrisma } from '../../src/lib/prisma-base';
import { createCustomerUser, createInternalUser, loginInternal } from '../helpers';

let app: Application;
let adminToken: string;

beforeAll(async () => {
  app = createApp();
  const admin = await createInternalUser({ roleCode: 'super_admin' });
  adminToken = (await loginInternal(app, admin.email, admin.password)).accessToken;
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

const auth = (t?: string) => ({ Authorization: `Bearer ${t ?? adminToken}` });

// -- Signup request submission ----------------------------------------------

describe('POST /api/public/signup-request', () => {
  it('submits a signup request', async () => {
    const res = await request(app)
      .post('/api/public/signup-request')
      .send({
        companyName: 'Acme Furniture',
        contactName: 'John Doe',
        email: `signup-${Date.now()}@example.com`,
        phone: '+919876543210',
        accountType: 'dealer',
      });
    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain('submitted');
  });

  it('prevents duplicate pending requests', async () => {
    const email = `dup-${Date.now()}@example.com`;
    await request(app)
      .post('/api/public/signup-request')
      .send({ companyName: 'Dup Co', contactName: 'Jane', email, accountType: 'architect' });

    const res = await request(app)
      .post('/api/public/signup-request')
      .send({ companyName: 'Dup Co 2', contactName: 'Jane', email, accountType: 'dealer' });
    expect(res.status).toBe(400);
  });

  it('validates required fields', async () => {
    const res = await request(app)
      .post('/api/public/signup-request')
      .send({ companyName: 'No Email Co' });
    expect(res.status).toBe(400);
  });
});

// -- Admin signup request management ----------------------------------------

describe('Admin signup request management', () => {
  let signupRequestId: string;

  it('lists pending signup requests', async () => {
    await request(app)
      .post('/api/public/signup-request')
      .send({
        companyName: 'Pending Corp',
        contactName: 'Bob Smith',
        email: `pending-${Date.now()}@example.com`,
        accountType: 'corporate',
      });

    const res = await request(app)
      .get('/api/admin/signup-requests?status=pending')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.requests.length).toBeGreaterThan(0);
    signupRequestId = res.body.data.requests[0].id;
  });

  it('approves a signup request — creates account + user', async () => {
    const email = `approve-${Date.now()}@example.com`;
    await request(app)
      .post('/api/public/signup-request')
      .send({
        companyName: 'Approved Ltd',
        contactName: 'Alice Wonderland',
        email,
        accountType: 'dealer',
      });

    const listRes = await request(app)
      .get('/api/admin/signup-requests?status=pending')
      .set(auth());
    const reqId = listRes.body.data.requests.find((r: any) => r.email === email)?.id;

    const res = await request(app)
      .post(`/api/admin/signup-requests/${reqId}/approve`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.account.companyName).toBe('Approved Ltd');
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.tempPassword).toBeTruthy();
  });

  it('rejects a signup request', async () => {
    const email = `reject-${Date.now()}@example.com`;
    await request(app)
      .post('/api/public/signup-request')
      .send({
        companyName: 'Rejected Inc',
        contactName: 'Eve Badger',
        email,
        accountType: 'direct',
      });

    const listRes = await request(app)
      .get('/api/admin/signup-requests?status=pending')
      .set(auth());
    const reqId = listRes.body.data.requests.find((r: any) => r.email === email)?.id;

    const res = await request(app)
      .post(`/api/admin/signup-requests/${reqId}/reject`)
      .set(auth())
      .send({ reviewNotes: 'Incomplete documentation' });
    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);
  });

  it('cannot approve already-approved request', async () => {
    const email = `double-${Date.now()}@example.com`;
    await request(app)
      .post('/api/public/signup-request')
      .send({ companyName: 'Double Co', contactName: 'Dup', email, accountType: 'dealer' });

    const listRes = await request(app)
      .get('/api/admin/signup-requests?status=pending')
      .set(auth());
    const reqId = listRes.body.data.requests.find((r: any) => r.email === email)?.id;

    await request(app).post(`/api/admin/signup-requests/${reqId}/approve`).set(auth());
    const res = await request(app).post(`/api/admin/signup-requests/${reqId}/approve`).set(auth());
    expect(res.status).toBe(400);
  });
});

// -- Admin customer account CRUD --------------------------------------------

describe('Admin customer account CRUD', () => {
  let accountId: string;

  it('creates a customer account manually', async () => {
    const res = await request(app)
      .post('/api/admin/customer-accounts')
      .set(auth())
      .send({
        companyName: 'Manual Corp',
        primaryEmail: `manual-${Date.now()}@example.com`,
        accountType: 'corporate',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.accountCode).toMatch(/^CUST-/);
    expect(res.body.data.isVerified).toBe(true);
    accountId = res.body.data.id;
  });

  it('lists customer accounts', async () => {
    const res = await request(app)
      .get('/api/admin/customer-accounts')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.accounts.length).toBeGreaterThan(0);
    expect(typeof res.body.data.total).toBe('number');
  });

  it('updates a customer account', async () => {
    const res = await request(app)
      .put(`/api/admin/customer-accounts/${accountId}`)
      .set(auth())
      .send({ companyName: 'Updated Corp' });
    expect(res.status).toBe(200);
    expect(res.body.data.companyName).toBe('Updated Corp');
  });

  it('deactivates then activates an account', async () => {
    let res = await request(app)
      .post(`/api/admin/customer-accounts/${accountId}/deactivate`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);

    res = await request(app)
      .post(`/api/admin/customer-accounts/${accountId}/activate`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(true);
  });

  it('soft-deletes an account', async () => {
    const res = await request(app)
      .delete(`/api/admin/customer-accounts/${accountId}`)
      .set(auth());
    expect(res.status).toBe(200);

    const listRes = await request(app)
      .get('/api/admin/customer-accounts')
      .set(auth());
    const found = listRes.body.data.accounts.find((a: any) => a.id === accountId);
    expect(found).toBeUndefined();
  });
});

// -- Admin customer users ---------------------------------------------------

describe('Admin customer users', () => {
  let accountId: string;

  it('adds a user to an account', async () => {
    const createRes = await request(app)
      .post('/api/admin/customer-accounts')
      .set(auth())
      .send({
        companyName: 'Users Corp',
        primaryEmail: `users-${Date.now()}@example.com`,
        accountType: 'dealer',
      });
    accountId = createRes.body.data.id;

    const res = await request(app)
      .post(`/api/admin/customer-accounts/${accountId}/users`)
      .set(auth())
      .send({
        email: `user1-${Date.now()}@example.com`,
        firstName: 'Test',
        lastName: 'User',
        password: 'SecurePass!123',
        role: 'admin',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('admin');
  });

  it('lists users in an account', async () => {
    const res = await request(app)
      .get(`/api/admin/customer-accounts/${accountId}/users`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.users.length).toBeGreaterThan(0);
  });
});

// -- Customer login and isolation -------------------------------------------

describe('Customer login and isolation', () => {
  let customerToken: string;

  it('customer can login with credentials created via approval', async () => {
    const email = `login-test-${Date.now()}@example.com`;
    await request(app)
      .post('/api/public/signup-request')
      .send({ companyName: 'Login Co', contactName: 'Login User', email, accountType: 'dealer' });

    const listRes = await request(app)
      .get('/api/admin/signup-requests?status=pending')
      .set(auth());
    const reqId = listRes.body.data.requests.find((r: any) => r.email === email)?.id;
    const approveRes = await request(app)
      .post(`/api/admin/signup-requests/${reqId}/approve`)
      .set(auth());
    const tempPassword = approveRes.body.data.tempPassword;

    const loginRes = await request(app)
      .post('/api/portal/auth/login')
      .send({ email, password: tempPassword });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.accessToken).toBeTruthy();
    customerToken = loginRes.body.data.accessToken;
  });

  it('customer cannot access admin endpoints', async () => {
    const res = await request(app)
      .get('/api/admin/customer-accounts')
      .set(auth(customerToken));
    expect(res.status).toBe(403);
  });

  it('customer can access /api/portal/auth/me', async () => {
    const res = await request(app)
      .get('/api/portal/auth/me')
      .set(auth(customerToken));
    expect(res.status).toBe(200);
    expect(res.body.data.user).toBeTruthy();
  });
});

// -- Portal user self-edit --------------------------------------------------

describe('PUT /api/portal/customer-users/:id', () => {
  it('customer can edit own profile', async () => {
    const cust = await createCustomerUser();
    const loginRes = await request(app)
      .post('/api/portal/auth/login')
      .send({ email: cust.email, password: cust.password });
    const custToken = loginRes.body.data.accessToken;

    const res = await request(app)
      .put(`/api/portal/customer-users/${cust.id}`)
      .set(auth(custToken))
      .send({ firstName: 'UpdatedName' });
    expect(res.status).toBe(200);
    expect(res.body.data.firstName).toBe('UpdatedName');
  });

  it('customer cannot edit another users profile', async () => {
    const cust = await createCustomerUser();
    const loginRes = await request(app)
      .post('/api/portal/auth/login')
      .send({ email: cust.email, password: cust.password });
    const custToken = loginRes.body.data.accessToken;

    const res = await request(app)
      .put('/api/portal/customer-users/00000000-0000-0000-0000-000000000000')
      .set(auth(custToken))
      .send({ firstName: 'Hacker' });
    expect(res.status).toBe(401);
  });
});
