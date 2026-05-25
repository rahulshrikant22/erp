import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { rawPrisma } from '../../src/lib/prisma-base';
import { createInternalUser, loginInternal } from '../helpers';

let app: Application;
let adminToken: string;
let customerCode: string;
let productCode: string;

beforeAll(async () => {
  app = createApp();
  const admin = await createInternalUser({ roleCode: 'super_admin' });
  adminToken = (await loginInternal(app, admin.email, admin.password)).accessToken;

  // Create a customer with known code
  const custRes = await request(app)
    .post('/api/customers')
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ customerName: 'Import Test Co', customerType: 'dealer' });
  customerCode = custRes.body.data.customer.customerCode;

  // Create a product with known code
  const catRes = await request(app)
    .post('/api/product-categories')
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ categoryCode: `IMPCAT_${Date.now()}`, name: 'Import Cat' });

  productCode = `IMPPROD_${Date.now()}`;
  await request(app)
    .post('/api/products')
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ productCode, productName: 'Import Product', categoryId: catRes.body.data.category.id, basePrice: 20000, taxRatePercent: 18, hsnCode: '94036090' });
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('Order Import', () => {
  it('imports valid orders with lines', async () => {
    const res = await request(app)
      .post('/api/orders/import')
      .set(auth(adminToken))
      .send({
        headers: [
          { order_ref: 'IMP-001', customer_code: customerCode, order_date: '2026-06-01' },
          { order_ref: 'IMP-002', customer_code: customerCode },
        ],
        lines: [
          { order_ref: 'IMP-001', product_code: productCode, quantity: '3' },
          { order_ref: 'IMP-001', description: 'Custom shelf', quantity: '2', unit_price: '8000', tax_rate_percent: '18', hsn_code: '94036090' },
          { order_ref: 'IMP-002', product_code: productCode, quantity: '1', unit_price: '18000' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.data.successCount).toBe(2);
    expect(res.body.data.errorCount).toBe(0);
    expect(res.body.data.createdOrderIds.length).toBe(2);
  });

  it('reports errors for missing customer', async () => {
    const res = await request(app)
      .post('/api/orders/import')
      .set(auth(adminToken))
      .send({
        headers: [{ order_ref: 'ERR-001', customer_code: 'NONEXISTENT' }],
        lines: [{ order_ref: 'ERR-001', product_code: productCode, quantity: '1' }],
      });
    expect(res.status).toBe(200);
    expect(res.body.data.successCount).toBe(0);
    expect(res.body.data.errorCount).toBe(1);
    expect(res.body.data.errors[0].message).toContain('not found');
  });

  it('reports errors for missing product', async () => {
    const res = await request(app)
      .post('/api/orders/import')
      .set(auth(adminToken))
      .send({
        headers: [{ order_ref: 'ERR-002', customer_code: customerCode }],
        lines: [{ order_ref: 'ERR-002', product_code: 'GHOST_PRODUCT', quantity: '2' }],
      });
    expect(res.status).toBe(200);
    expect(res.body.data.errorCount).toBe(1);
    expect(res.body.data.errors[0].message).toContain('Product');
  });

  it('reports errors for missing lines', async () => {
    const res = await request(app)
      .post('/api/orders/import')
      .set(auth(adminToken))
      .send({
        headers: [{ order_ref: 'ERR-003', customer_code: customerCode }],
        lines: [],
      });
    expect(res.status).toBe(200);
    expect(res.body.data.errorCount).toBe(1);
    expect(res.body.data.errors[0].message).toContain('No lines');
  });

  it('imported orders have source=csv_import', async () => {
    const res = await request(app)
      .post('/api/orders/import')
      .set(auth(adminToken))
      .send({
        headers: [{ order_ref: 'SRC-001', customer_code: customerCode }],
        lines: [{ order_ref: 'SRC-001', product_code: productCode, quantity: '1' }],
      });
    const orderId = res.body.data.createdOrderIds[0];
    const orderRes = await request(app)
      .get(`/api/orders/${orderId}`)
      .set(auth(adminToken));
    expect(orderRes.body.data.order.source).toBe('csv_import');
  });
});

describe('Import Templates', () => {
  it('downloads order header template', async () => {
    const res = await request(app)
      .get('/api/orders/import/template')
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('order_ref');
    expect(res.text).toContain('customer_code');
  });

  it('downloads order lines template', async () => {
    const res = await request(app)
      .get('/api/orders/import/lines-template')
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('product_code');
    expect(res.text).toContain('quantity');
  });
});
