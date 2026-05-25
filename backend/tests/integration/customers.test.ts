import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { rawPrisma } from '../../src/lib/prisma-base';
import { createInternalUser, loginInternal } from '../helpers';

let app: Application;
let adminToken: string;
let noPermToken: string;

beforeAll(async () => {
  app = createApp();
  const admin = await createInternalUser({ roleCode: 'super_admin' });
  adminToken = (await loginInternal(app, admin.email, admin.password)).accessToken;
  const noPermUser = await createInternalUser({});
  noPermToken = (await loginInternal(app, noPermUser.email, noPermUser.password)).accessToken;
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('Customer CRUD', () => {
  let customerId: string;

  it('creates a customer', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set(auth(adminToken))
      .send({
        customerName: 'Test Industries',
        customerType: 'dealer',
        primaryEmail: 'test@industries.com',
        primaryPhone: '9876543210',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.customer.customerCode).toBeTruthy();
    customerId = res.body.data.customer.id;
  });

  it('rejects invalid customer type', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set(auth(adminToken))
      .send({ customerName: 'Bad', customerType: 'unknown' });
    expect(res.status).toBe(400);
  });

  it('lists customers with search', async () => {
    const res = await request(app)
      .get('/api/customers?search=Test+Industries')
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.customers.length).toBeGreaterThan(0);
    expect(res.body.data.total).toBeGreaterThan(0);
  });

  it('lists customers filtered by type', async () => {
    const res = await request(app)
      .get('/api/customers?type=dealer')
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    for (const c of res.body.data.customers) {
      expect(c.customerType).toBe('dealer');
    }
  });

  it('gets customer by ID with includes', async () => {
    const res = await request(app)
      .get(`/api/customers/${customerId}`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.customer.addresses).toBeDefined();
    expect(res.body.data.customer.contacts).toBeDefined();
  });

  it('updates a customer', async () => {
    const res = await request(app)
      .put(`/api/customers/${customerId}`)
      .set(auth(adminToken))
      .send({ customerName: 'Test Industries Updated', creditLimit: 100000 });
    expect(res.status).toBe(200);
    expect(res.body.data.customer.customerName).toBe('Test Industries Updated');
  });

  it('blacklists a customer', async () => {
    const res = await request(app)
      .post(`/api/customers/${customerId}/blacklist`)
      .set(auth(adminToken))
      .send({ reason: 'Payment default' });
    expect(res.status).toBe(200);
    expect(res.body.data.customer.isBlacklisted).toBe(true);
  });

  it('reactivates a customer', async () => {
    const res = await request(app)
      .post(`/api/customers/${customerId}/reactivate`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.customer.isActive).toBe(true);
    expect(res.body.data.customer.isBlacklisted).toBe(false);
  });

  it('soft-deletes a customer', async () => {
    const res = await request(app)
      .delete(`/api/customers/${customerId}`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);

    const getRes = await request(app)
      .get(`/api/customers/${customerId}`)
      .set(auth(adminToken));
    expect(getRes.status).toBe(404);
  });

  it('rejects access without permission', async () => {
    const res = await request(app)
      .get('/api/customers')
      .set(auth(noPermToken));
    expect(res.status).toBe(403);
  });
});

describe('GST / PAN validation', () => {
  // Format: 2-digit state + 5 alpha + 4 digits + 1 alpha + 1 alnum + Z + 1 alnum
  const seq = String(Date.now()).slice(-4);
  const uniqueGstin = `27AAACB${seq}A1ZA`;

  it('rejects invalid GSTIN format', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set(auth(adminToken))
      .send({ customerName: 'Bad GST', customerType: 'dealer', gstin: 'INVALID' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('GSTIN');
  });

  it('accepts valid GSTIN', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set(auth(adminToken))
      .send({ customerName: 'Valid GST Co', customerType: 'corporate', gstin: uniqueGstin });
    expect(res.status).toBe(201);
    expect(res.body.data.customer.gstin).toBe(uniqueGstin);
  });

  it('rejects duplicate GSTIN', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set(auth(adminToken))
      .send({ customerName: 'Dup GST Co', customerType: 'dealer', gstin: uniqueGstin });
    expect(res.status).toBe(409);
  });

  it('rejects invalid PAN format', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set(auth(adminToken))
      .send({ customerName: 'Bad PAN', customerType: 'retail', pan: '12345' });
    expect(res.status).toBe(400);
  });

  it('accepts valid PAN', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set(auth(adminToken))
      .send({ customerName: 'Valid PAN Co', customerType: 'retail', pan: 'ABCDE1234F' });
    expect(res.status).toBe(201);
    expect(res.body.data.customer.pan).toBe('ABCDE1234F');
  });
});

describe('Customer Addresses', () => {
  let customerId: string;
  let addressId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/customers')
      .set(auth(adminToken))
      .send({ customerName: 'Address Test Co', customerType: 'dealer' });
    customerId = res.body.data.customer.id;
  });

  it('creates a billing address', async () => {
    const res = await request(app)
      .post(`/api/customers/${customerId}/addresses`)
      .set(auth(adminToken))
      .send({
        addressType: 'billing',
        addressLine1: '123 MG Road',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        isDefaultBilling: true,
      });
    expect(res.status).toBe(201);
    addressId = res.body.data.address.id;
    expect(res.body.data.address.stateCode).toBe('27');
  });

  it('auto-derives state code from state name', async () => {
    const res = await request(app)
      .post(`/api/customers/${customerId}/addresses`)
      .set(auth(adminToken))
      .send({
        addressType: 'shipping',
        addressLine1: '456 Brigade Road',
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560001',
        isDefaultShipping: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.address.stateCode).toBe('29');
  });

  it('updates an address', async () => {
    const res = await request(app)
      .put(`/api/customers/addresses/${addressId}`)
      .set(auth(adminToken))
      .send({ city: 'Thane' });
    expect(res.status).toBe(200);
    expect(res.body.data.address.city).toBe('Thane');
  });

  it('deletes an address', async () => {
    const res = await request(app)
      .delete(`/api/customers/addresses/${addressId}`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
  });
});

describe('Customer Contacts', () => {
  let customerId: string;
  let contactId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/customers')
      .set(auth(adminToken))
      .send({ customerName: 'Contact Test Co', customerType: 'architect' });
    customerId = res.body.data.customer.id;
  });

  it('creates a primary contact', async () => {
    const res = await request(app)
      .post(`/api/customers/${customerId}/contacts`)
      .set(auth(adminToken))
      .send({
        contactName: 'Raj Kumar',
        designation: 'CEO',
        phone: '9876543210',
        email: 'raj@test.com',
        role: 'decision_maker',
        isPrimary: true,
      });
    expect(res.status).toBe(201);
    contactId = res.body.data.contact.id;
    expect(res.body.data.contact.isPrimary).toBe(true);
  });

  it('new primary contact unsets the old one', async () => {
    const res = await request(app)
      .post(`/api/customers/${customerId}/contacts`)
      .set(auth(adminToken))
      .send({ contactName: 'Priya Singh', role: 'purchase', isPrimary: true });
    expect(res.status).toBe(201);
    expect(res.body.data.contact.isPrimary).toBe(true);
  });

  it('updates a contact', async () => {
    const res = await request(app)
      .put(`/api/customers/contacts/${contactId}`)
      .set(auth(adminToken))
      .send({ designation: 'Managing Director' });
    expect(res.status).toBe(200);
    expect(res.body.data.contact.designation).toBe('Managing Director');
  });

  it('deletes a contact', async () => {
    const res = await request(app)
      .delete(`/api/customers/contacts/${contactId}`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
  });
});

describe('Customer Tier Pricing', () => {
  let customerId: string;
  let tierId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/customers')
      .set(auth(adminToken))
      .send({ customerName: 'Tier Test Co', customerType: 'corporate' });
    customerId = res.body.data.customer.id;
  });

  it('creates tier pricing', async () => {
    const res = await request(app)
      .post(`/api/customers/${customerId}/tier-pricing`)
      .set(auth(adminToken))
      .send({ discountPercent: 15, notes: 'Bulk discount' });
    expect(res.status).toBe(201);
    tierId = res.body.data.tierPricing.id;
  });

  it('lists tier pricing', async () => {
    const res = await request(app)
      .get(`/api/customers/${customerId}/tier-pricing`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.tierPricing.length).toBeGreaterThan(0);
  });

  it('deletes tier pricing', async () => {
    const res = await request(app)
      .delete(`/api/customers/tier-pricing/${tierId}`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
  });
});

describe('CSV Import', () => {
  it('imports valid rows', async () => {
    const csvSeq = String(Date.now()).slice(-4);
    const res = await request(app)
      .post('/api/customers/import')
      .set(auth(adminToken))
      .send({
        rows: [
          { customer_name: `CSV Import ${csvSeq}a`, customer_type: 'retail' },
          { customer_name: `CSV Import ${csvSeq}b`, customer_type: 'dealer', gstin: `29BBBCB${csvSeq}A1ZB` },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.data.successCount).toBe(2);
    expect(res.body.data.errorCount).toBe(0);
  });

  it('reports errors on invalid rows', async () => {
    const res = await request(app)
      .post('/api/customers/import')
      .set(auth(adminToken))
      .send({
        rows: [
          { customer_name: '', customer_type: 'retail' },
          { customer_name: 'Good One', customer_type: 'dealer' },
          { customer_name: 'Bad GST', customer_type: 'retail', gstin: 'INVALID' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.data.successCount).toBe(1);
    expect(res.body.data.errorCount).toBe(2);
  });

  it('downloads import template', async () => {
    const res = await request(app)
      .get('/api/customers/import/template')
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('customer_name');
  });
});
