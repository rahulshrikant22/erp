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
let categoryId: string;

beforeAll(async () => {
  app = createApp();
  const admin = await createInternalUser({ roleCode: 'super_admin' });
  adminToken = (await loginInternal(app, admin.email, admin.password)).accessToken;

  // Create test customer + address
  const custRes = await request(app)
    .post('/api/customers')
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ customerName: 'Order Test Co', customerType: 'dealer' });
  customerId = custRes.body.data.customer.id;

  const addrRes = await request(app)
    .post(`/api/customers/${customerId}/addresses`)
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ addressType: 'shipping', addressLine1: '123 Test St', city: 'Pune', state: 'Maharashtra', pincode: '411001', isDefaultShipping: true });
  addressId = addrRes.body.data.address.id;

  // Create test product
  const catRes = await request(app)
    .post('/api/product-categories')
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ categoryCode: `OCAT_${Date.now()}`, name: 'Order Test Cat' });
  categoryId = catRes.body.data.category.id;

  const prodRes = await request(app)
    .post('/api/products')
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ productName: 'Test Desk', categoryId, basePrice: 30000, taxRatePercent: 18, hsnCode: '94036090' });
  productId = prodRes.body.data.product.id;
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('Order Header', () => {
  let orderId: string;

  it('creates a draft order', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(auth(adminToken))
      .send({
        customerId,
        orderType: 'regular',
        defaultShippingAddressId: addressId,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.order.orderNumber).toBeTruthy();
    expect(res.body.data.order.status).toBe('draft');
    orderId = res.body.data.order.id;
  });

  it('lists orders', async () => {
    const res = await request(app)
      .get('/api/orders?status=draft')
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.orders.length).toBeGreaterThan(0);
  });

  it('gets full order details', async () => {
    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.order.customer).toBeDefined();
    expect(res.body.data.order.lines).toBeDefined();
    expect(res.body.data.order.shipments).toBeDefined();
  });

  it('updates a draft order', async () => {
    const res = await request(app)
      .put(`/api/orders/${orderId}`)
      .set(auth(adminToken))
      .send({ notes: 'Updated notes' });
    expect(res.status).toBe(200);
  });

  it('soft-deletes a draft order', async () => {
    const res = await request(app)
      .delete(`/api/orders/${orderId}`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
  });
});

describe('Order Lines', () => {
  let orderId: string;
  let lineId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(auth(adminToken))
      .send({ customerId, defaultShippingAddressId: addressId });
    orderId = res.body.data.order.id;
  });

  it('adds a catalog product line', async () => {
    const res = await request(app)
      .post(`/api/orders/${orderId}/lines`)
      .set(auth(adminToken))
      .send({ lineType: 'catalog_product', productId, quantity: 2 });
    expect(res.status).toBe(201);
    lineId = res.body.data.line.id;
    expect(Number(res.body.data.line.unitPriceBeforeDiscount)).toBe(30000);
    expect(Number(res.body.data.line.lineSubtotal)).toBe(60000);
  });

  it('adds a custom item line', async () => {
    const res = await request(app)
      .post(`/api/orders/${orderId}/lines`)
      .set(auth(adminToken))
      .send({
        lineType: 'custom_item',
        description: 'Custom partition panel 2400x1200',
        quantity: 4,
        unitPrice: 12000,
        taxRatePercent: 18,
        hsnCode: '94036090',
      });
    expect(res.status).toBe(201);
    expect(Number(res.body.data.line.lineSubtotal)).toBe(48000);
  });

  it('rejects custom_item without description', async () => {
    const res = await request(app)
      .post(`/api/orders/${orderId}/lines`)
      .set(auth(adminToken))
      .send({ lineType: 'custom_item', quantity: 1, unitPrice: 5000 });
    expect(res.status).toBe(400);
  });

  it('rejects zero quantity', async () => {
    const res = await request(app)
      .post(`/api/orders/${orderId}/lines`)
      .set(auth(adminToken))
      .send({ lineType: 'catalog_product', productId, quantity: 0 });
    expect(res.status).toBe(400);
  });

  it('updates a line and recalculates', async () => {
    const res = await request(app)
      .put(`/api/orders/${orderId}/lines/${lineId}`)
      .set(auth(adminToken))
      .send({ quantity: 3 });
    expect(res.status).toBe(200);
    expect(Number(res.body.data.line.lineSubtotal)).toBe(90000);
  });

  it('applies percentage discount', async () => {
    const res = await request(app)
      .put(`/api/orders/${orderId}/lines/${lineId}`)
      .set(auth(adminToken))
      .send({ discountType: 'percent', discountValue: 10 });
    expect(res.status).toBe(200);
    expect(Number(res.body.data.line.unitPriceFinal)).toBe(27000);
    expect(Number(res.body.data.line.lineSubtotal)).toBe(81000);
  });

  it('order totals are recalculated', async () => {
    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(Number(res.body.data.order.subtotal)).toBeGreaterThan(0);
    expect(Number(res.body.data.order.totalTax)).toBeGreaterThan(0);
    expect(Number(res.body.data.order.grandTotal)).toBeGreaterThan(0);
  });

  it('deletes a line', async () => {
    const res = await request(app)
      .delete(`/api/orders/${orderId}/lines/${lineId}`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
  });

  it('adds custom specs to a line', async () => {
    const addLine = await request(app)
      .post(`/api/orders/${orderId}/lines`)
      .set(auth(adminToken))
      .send({ lineType: 'custom_item', description: 'Spec test', quantity: 1, unitPrice: 5000 });
    const newLineId = addLine.body.data.line.id;

    const res = await request(app)
      .post(`/api/orders/${orderId}/lines/${newLineId}/custom-specs`)
      .set(auth(adminToken))
      .send({ specKey: 'width', specValue: '1200mm', specType: 'dimension' });
    expect(res.status).toBe(201);
    expect(res.body.data.spec.specKey).toBe('width');
  });
});

describe('Order Shipments', () => {
  let orderId: string;
  let lineId: string;
  let shipmentId: string;

  beforeAll(async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .set(auth(adminToken))
      .send({ customerId, defaultShippingAddressId: addressId });
    orderId = orderRes.body.data.order.id;

    const lineRes = await request(app)
      .post(`/api/orders/${orderId}/lines`)
      .set(auth(adminToken))
      .send({ lineType: 'catalog_product', productId, quantity: 10 });
    lineId = lineRes.body.data.line.id;
  });

  it('creates a shipment', async () => {
    const res = await request(app)
      .post(`/api/orders/${orderId}/shipments`)
      .set(auth(adminToken))
      .send({ shippingAddressId: addressId, expectedDispatchDate: '2026-06-15' });
    expect(res.status).toBe(201);
    shipmentId = res.body.data.shipment.id;
    expect(res.body.data.shipment.shipmentNumber).toBe('S01');
  });

  it('assigns lines to shipment', async () => {
    const res = await request(app)
      .post(`/api/orders/${orderId}/shipments/${shipmentId}/assign-lines`)
      .set(auth(adminToken))
      .send({ assignments: [{ orderLineId: lineId, quantity: 5 }] });
    expect(res.status).toBe(200);
    expect(res.body.data.shipmentLines.length).toBe(1);
  });
});

describe('Order Charges', () => {
  let orderId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(auth(adminToken))
      .send({ customerId });
    orderId = res.body.data.order.id;
  });

  it('adds a transport charge', async () => {
    const res = await request(app)
      .post(`/api/orders/${orderId}/charges`)
      .set(auth(adminToken))
      .send({ chargeType: 'transport', amount: 5000, description: 'Delivery to site' });
    expect(res.status).toBe(201);
    expect(Number(res.body.data.charge.amount)).toBe(5000);
  });

  it('charges are reflected in order totals', async () => {
    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set(auth(adminToken));
    expect(Number(res.body.data.order.totalCharges)).toBe(5000);
  });
});

describe('Draft-only enforcement', () => {
  it('cannot edit a non-draft order', async () => {
    // Create order and manually set to confirmed
    const createRes = await request(app)
      .post('/api/orders')
      .set(auth(adminToken))
      .send({ customerId });
    const oid = createRes.body.data.order.id;

    await rawPrisma.order.update({ where: { id: oid }, data: { status: 'confirmed' } });

    const editRes = await request(app)
      .put(`/api/orders/${oid}`)
      .set(auth(adminToken))
      .send({ notes: 'should fail' });
    expect(editRes.status).toBe(409);
  });

  it('cannot delete a non-draft order', async () => {
    const createRes = await request(app)
      .post('/api/orders')
      .set(auth(adminToken))
      .send({ customerId });
    const oid = createRes.body.data.order.id;

    await rawPrisma.order.update({ where: { id: oid }, data: { status: 'confirmed' } });

    const delRes = await request(app)
      .delete(`/api/orders/${oid}`)
      .set(auth(adminToken));
    expect(delRes.status).toBe(409);
  });

  it('cannot add line to non-draft order', async () => {
    const createRes = await request(app)
      .post('/api/orders')
      .set(auth(adminToken))
      .send({ customerId });
    const oid = createRes.body.data.order.id;

    await rawPrisma.order.update({ where: { id: oid }, data: { status: 'in_production' } });

    const lineRes = await request(app)
      .post(`/api/orders/${oid}/lines`)
      .set(auth(adminToken))
      .send({ lineType: 'catalog_product', productId, quantity: 1 });
    expect(lineRes.status).toBe(409);
  });
});
