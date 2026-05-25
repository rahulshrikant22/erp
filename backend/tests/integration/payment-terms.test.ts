import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { rawPrisma } from '../../src/lib/prisma-base';
import { createInternalUser, loginInternal } from '../helpers';

let app: Application;
let adminToken: string;
let customerId: string;
let addressId: string;
let productId: string;
let templateId: string;

beforeAll(async () => {
  app = createApp();
  const admin = await createInternalUser({ roleCode: 'super_admin' });
  adminToken = (await loginInternal(app, admin.email, admin.password)).accessToken;

  const custRes = await request(app)
    .post('/api/customers')
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ customerName: 'Payment Terms Co', customerType: 'dealer' });
  customerId = custRes.body.data.customer.id;

  const addrRes = await request(app)
    .post(`/api/customers/${customerId}/addresses`)
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ addressType: 'shipping', addressLine1: '1 Pay Rd', city: 'Pune', state: 'Maharashtra', pincode: '411001', stateCode: '27', isDefaultShipping: true });
  addressId = addrRes.body.data.address.id;

  const catRes = await request(app)
    .post('/api/product-categories')
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ categoryCode: `PTCAT_${Date.now()}`, name: 'PT Cat' });

  const prodRes = await request(app)
    .post('/api/products')
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ productName: 'PT Desk', categoryId: catRes.body.data.category.id, basePrice: 50000, taxRatePercent: 18, hsnCode: '94036090' });
  productId = prodRes.body.data.product.id;
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('Payment Terms Template CRUD', () => {
  it('creates a template with milestones', async () => {
    const res = await request(app)
      .post('/api/admin/payment-terms-templates')
      .set(auth(adminToken))
      .send({
        templateCode: `TPL_${Date.now()}`,
        templateName: 'Custom 60-40',
        milestones: [
          { milestoneName: 'Advance', percentage: 60, triggerEvent: 'on_order' },
          { milestoneName: 'On Delivery', percentage: 40, triggerEvent: 'on_delivery' },
        ],
      });
    expect(res.status).toBe(201);
    templateId = res.body.data.template.id;
    expect(res.body.data.template.milestones.length).toBe(2);
  });

  it('rejects milestones not summing to 100%', async () => {
    const res = await request(app)
      .post('/api/admin/payment-terms-templates')
      .set(auth(adminToken))
      .send({
        templateCode: `TPLFAIL_${Date.now()}`,
        templateName: 'Bad Template',
        milestones: [
          { milestoneName: 'Only', percentage: 70, triggerEvent: 'on_order' },
        ],
      });
    expect(res.status).toBe(400);
  });

  it('rejects duplicate template code', async () => {
    const code = `TPLDUP_${Date.now()}`;
    await request(app)
      .post('/api/admin/payment-terms-templates')
      .set(auth(adminToken))
      .send({ templateCode: code, templateName: 'First', milestones: [{ milestoneName: 'All', percentage: 100, triggerEvent: 'on_order' }] });

    const res = await request(app)
      .post('/api/admin/payment-terms-templates')
      .set(auth(adminToken))
      .send({ templateCode: code, templateName: 'Second', milestones: [{ milestoneName: 'All', percentage: 100, triggerEvent: 'on_order' }] });
    expect(res.status).toBe(409);
  });

  it('lists templates', async () => {
    const res = await request(app)
      .get('/api/admin/payment-terms-templates')
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.templates.length).toBeGreaterThan(0);
  });

  it('gets a template by ID', async () => {
    const res = await request(app)
      .get(`/api/admin/payment-terms-templates/${templateId}`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.template.milestones.length).toBe(2);
  });

  it('updates a template', async () => {
    const res = await request(app)
      .put(`/api/admin/payment-terms-templates/${templateId}`)
      .set(auth(adminToken))
      .send({ templateName: 'Custom 60-40 Updated' });
    expect(res.status).toBe(200);
    expect(res.body.data.template.templateName).toBe('Custom 60-40 Updated');
  });
});

describe('Order Payment Schedule', () => {
  let orderId: string;

  beforeAll(async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .set(auth(adminToken))
      .send({ customerId, defaultShippingAddressId: addressId, paymentTermsTemplateId: templateId });
    orderId = orderRes.body.data.order.id;

    await request(app)
      .post(`/api/orders/${orderId}/lines`)
      .set(auth(adminToken))
      .send({ lineType: 'catalog_product', productId, quantity: 2 });
  });

  it('generates payment schedule from template', async () => {
    const res = await request(app)
      .post(`/api/orders/${orderId}/payment-schedule/generate`)
      .set(auth(adminToken));
    expect(res.status).toBe(201);
    expect(res.body.data.schedule.length).toBe(2);
    // Grand total: 100000 (2×50000) + 18% tax = 118000, rounded
    const total = res.body.data.schedule.reduce((s: number, m: any) => s + Number(m.amount), 0);
    expect(total).toBeGreaterThan(0);
  });

  it('gets payment schedule', async () => {
    const res = await request(app)
      .get(`/api/orders/${orderId}/payment-schedule`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.schedule.length).toBe(2);
    expect(Number(res.body.data.schedule[0].percentage)).toBe(60);
  });

  it('updates a milestone', async () => {
    const schedRes = await request(app)
      .get(`/api/orders/${orderId}/payment-schedule`)
      .set(auth(adminToken));
    const milestoneId = schedRes.body.data.schedule[0].id;

    const res = await request(app)
      .put(`/api/orders/${orderId}/payment-schedule/${milestoneId}`)
      .set(auth(adminToken))
      .send({ percentage: 55, amount: 64900, notes: 'Adjusted for this customer' });
    expect(res.status).toBe(200);
    expect(Number(res.body.data.milestone.percentage)).toBe(55);
  });

  it('adds a custom milestone', async () => {
    const res = await request(app)
      .post(`/api/orders/${orderId}/payment-schedule/milestone`)
      .set(auth(adminToken))
      .send({
        milestoneName: 'Installation Complete',
        percentage: 5,
        amount: 5900,
        triggerEvent: 'after_installation',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.milestone.milestoneSequence).toBe(3);
  });
});

describe('Payment Recording', () => {
  let orderId: string;
  let milestoneId: string;

  beforeAll(async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .set(auth(adminToken))
      .send({ customerId, defaultShippingAddressId: addressId, paymentTermsTemplateId: templateId });
    orderId = orderRes.body.data.order.id;

    await request(app)
      .post(`/api/orders/${orderId}/lines`)
      .set(auth(adminToken))
      .send({ lineType: 'custom_item', description: 'Pay test item', quantity: 1, unitPrice: 10000, taxRatePercent: 18, hsnCode: '94036090' });

    await request(app)
      .post(`/api/orders/${orderId}/payment-schedule/generate`)
      .set(auth(adminToken));

    const schedRes = await request(app)
      .get(`/api/orders/${orderId}/payment-schedule`)
      .set(auth(adminToken));
    milestoneId = schedRes.body.data.schedule[0].id;
  });

  it('records a payment against a milestone', async () => {
    const res = await request(app)
      .post(`/api/orders/${orderId}/payments`)
      .set(auth(adminToken))
      .send({ milestoneId, amount: 5000, paymentMode: 'bank_transfer', reference: 'UTR123456' });
    expect(res.status).toBe(201);
    expect(res.body.data.payment.milestoneStatus).toBe('partial');
  });

  it('marks milestone paid when fully paid', async () => {
    const schedRes = await request(app)
      .get(`/api/orders/${orderId}/payment-schedule`)
      .set(auth(adminToken));
    const milestone = schedRes.body.data.schedule[0];
    const remaining = Number(milestone.amount) - Number(milestone.amountPaid);

    const res = await request(app)
      .post(`/api/orders/${orderId}/payments`)
      .set(auth(adminToken))
      .send({ milestoneId, amount: remaining, paymentMode: 'cash' });
    expect(res.status).toBe(201);
    expect(res.body.data.payment.milestoneStatus).toBe('paid');
  });

  it('updates order amountPaid and amountDue', async () => {
    const res = await request(app)
      .get(`/api/orders/${orderId}/payments`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.amountPaid).toBeGreaterThan(0);
    expect(res.body.data.amountDue).toBeLessThan(res.body.data.grandTotal);
  });

  it('cannot modify a fully paid milestone', async () => {
    const res = await request(app)
      .put(`/api/orders/${orderId}/payment-schedule/${milestoneId}`)
      .set(auth(adminToken))
      .send({ amount: 99999 });
    expect(res.status).toBe(409);
  });
});
