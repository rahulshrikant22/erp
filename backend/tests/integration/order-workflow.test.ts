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
let paymentTermsTemplateId: string;

beforeAll(async () => {
  app = createApp();
  const admin = await createInternalUser({ roleCode: 'super_admin' });
  adminToken = (await loginInternal(app, admin.email, admin.password)).accessToken;

  const custRes = await request(app)
    .post('/api/customers')
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ customerName: 'Workflow Test Co', customerType: 'dealer' });
  customerId = custRes.body.data.customer.id;

  const addrRes = await request(app)
    .post(`/api/customers/${customerId}/addresses`)
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ addressType: 'shipping', addressLine1: '1 Test Rd', city: 'Pune', state: 'Maharashtra', pincode: '411001', stateCode: '27', isDefaultShipping: true });
  addressId = addrRes.body.data.address.id;

  const catRes = await request(app)
    .post('/api/product-categories')
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ categoryCode: `WCAT_${Date.now()}`, name: 'Workflow Cat' });

  const prodRes = await request(app)
    .post('/api/products')
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ productName: 'WF Desk', categoryId: catRes.body.data.category.id, basePrice: 20000, taxRatePercent: 18, hsnCode: '94036090' });
  productId = prodRes.body.data.product.id;

  // Grab existing payment terms template
  const template = await rawPrisma.paymentTermsTemplate.findFirst();
  paymentTermsTemplateId = template!.id;
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function createDraftOrder(opts?: { paymentTerms?: boolean }) {
  const res = await request(app)
    .post('/api/orders')
    .set(auth(adminToken))
    .send({
      customerId,
      defaultShippingAddressId: addressId,
      paymentTermsTemplateId: opts?.paymentTerms !== false ? paymentTermsTemplateId : undefined,
    });
  return res.body.data.order.id;
}

async function addLine(orderId: string) {
  await request(app)
    .post(`/api/orders/${orderId}/lines`)
    .set(auth(adminToken))
    .send({ lineType: 'catalog_product', productId, quantity: 2 });
}

describe('Order Confirmation', () => {
  it('confirms a valid draft order', async () => {
    const orderId = await createDraftOrder();
    await addLine(orderId);

    const res = await request(app)
      .post(`/api/orders/${orderId}/confirm`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.order.status).toBe('confirmed');
    expect(res.body.data.order.confirmedAt).toBeTruthy();
  });

  it('rejects confirmation without lines', async () => {
    const orderId = await createDraftOrder();
    const res = await request(app)
      .post(`/api/orders/${orderId}/confirm`)
      .set(auth(adminToken));
    expect(res.status).toBe(400);
  });

  it('rejects confirmation without payment terms', async () => {
    const orderId = await createDraftOrder({ paymentTerms: false });
    await addLine(orderId);
    const res = await request(app)
      .post(`/api/orders/${orderId}/confirm`)
      .set(auth(adminToken));
    expect(res.status).toBe(400);
  });

  it('rejects confirmation of already confirmed order', async () => {
    const orderId = await createDraftOrder();
    await addLine(orderId);
    await request(app).post(`/api/orders/${orderId}/confirm`).set(auth(adminToken));

    const res = await request(app)
      .post(`/api/orders/${orderId}/confirm`)
      .set(auth(adminToken));
    expect(res.status).toBe(409);
  });

  it('confirmed order cannot have lines added', async () => {
    const orderId = await createDraftOrder();
    await addLine(orderId);
    await request(app).post(`/api/orders/${orderId}/confirm`).set(auth(adminToken));

    const res = await request(app)
      .post(`/api/orders/${orderId}/lines`)
      .set(auth(adminToken))
      .send({ lineType: 'catalog_product', productId, quantity: 1 });
    expect(res.status).toBe(409);
  });

  it('logs status history on confirm', async () => {
    const orderId = await createDraftOrder();
    await addLine(orderId);
    await request(app).post(`/api/orders/${orderId}/confirm`).set(auth(adminToken));

    const getRes = await request(app)
      .get(`/api/orders/${orderId}`)
      .set(auth(adminToken));
    const history = getRes.body.data.order.statusHistory;
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].toStatus).toBe('confirmed');
    expect(history[0].fromStatus).toBe('draft');
  });
});

describe('Cancellation', () => {
  it('cancels a draft order', async () => {
    const orderId = await createDraftOrder();
    const res = await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set(auth(adminToken))
      .send({ cancellationReason: 'Customer changed mind' });
    expect(res.status).toBe(200);
    expect(res.body.data.order.status).toBe('cancelled');
  });

  it('cancels a confirmed order', async () => {
    const orderId = await createDraftOrder();
    await addLine(orderId);
    await request(app).post(`/api/orders/${orderId}/confirm`).set(auth(adminToken));

    const res = await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set(auth(adminToken))
      .send({ cancellationReason: 'Budget issue' });
    expect(res.status).toBe(200);
    expect(res.body.data.order.status).toBe('cancelled');
  });

  it('cannot cancel already cancelled order', async () => {
    const orderId = await createDraftOrder();
    await request(app).post(`/api/orders/${orderId}/cancel`).set(auth(adminToken)).send({ cancellationReason: 'test' });

    const res = await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set(auth(adminToken))
      .send({ cancellationReason: 'again' });
    expect(res.status).toBe(409);
  });

  it('requires cancellation reason', async () => {
    const orderId = await createDraftOrder();
    const res = await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set(auth(adminToken))
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('Status Transitions', () => {
  it('valid transition: draft→cancelled via status API', async () => {
    const orderId = await createDraftOrder();
    const res = await request(app)
      .post(`/api/orders/${orderId}/status`)
      .set(auth(adminToken))
      .send({ toStatus: 'cancelled', notes: 'Test cancel' });
    expect(res.status).toBe(200);
    expect(res.body.data.order.status).toBe('cancelled');
  });

  it('invalid transition: draft→dispatched rejected', async () => {
    const orderId = await createDraftOrder();
    const res = await request(app)
      .post(`/api/orders/${orderId}/status`)
      .set(auth(adminToken))
      .send({ toStatus: 'dispatched' });
    expect(res.status).toBe(409);
  });

  it('invalid transition: confirmed→draft rejected', async () => {
    const orderId = await createDraftOrder();
    await addLine(orderId);
    await request(app).post(`/api/orders/${orderId}/confirm`).set(auth(adminToken));

    const res = await request(app)
      .post(`/api/orders/${orderId}/status`)
      .set(auth(adminToken))
      .send({ toStatus: 'draft' });
    expect(res.status).toBe(409);
  });

  it('records time in previous status', async () => {
    const orderId = await createDraftOrder();
    await addLine(orderId);
    await request(app).post(`/api/orders/${orderId}/confirm`).set(auth(adminToken));
    await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set(auth(adminToken))
      .send({ cancellationReason: 'timing test' });

    const getRes = await request(app)
      .get(`/api/orders/${orderId}`)
      .set(auth(adminToken));
    const history = getRes.body.data.order.statusHistory;
    const cancelEntry = history.find((h: any) => h.toStatus === 'cancelled');
    expect(cancelEntry).toBeDefined();
    expect(Number(cancelEntry.timeInPreviousStatusHours)).toBeGreaterThanOrEqual(0);
  });
});
