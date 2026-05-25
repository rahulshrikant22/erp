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
let orderId: string;

beforeAll(async () => {
  app = createApp();
  const admin = await createInternalUser({ roleCode: 'super_admin' });
  adminToken = (await loginInternal(app, admin.email, admin.password)).accessToken;

  const gstSuffix = Date.now().toString().slice(-4);
  const custRes = await request(app)
    .post('/api/customers')
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ customerName: 'Doc Test Co', customerType: 'dealer', gstin: `27AADCB${gstSuffix}M1ZT` });
  customerId = custRes.body.data.customer.id;

  const addrRes = await request(app)
    .post(`/api/customers/${customerId}/addresses`)
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ addressType: 'shipping', addressLine1: '1 Doc Rd', city: 'Pune', state: 'Maharashtra', pincode: '411001', stateCode: '27', isDefaultShipping: true });
  addressId = addrRes.body.data.address.id;

  const catRes = await request(app)
    .post('/api/product-categories')
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ categoryCode: `DCAT_${Date.now()}`, name: 'Doc Cat' });

  const prodRes = await request(app)
    .post('/api/products')
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ productName: 'Doc Desk', categoryId: catRes.body.data.category.id, basePrice: 25000, taxRatePercent: 18, hsnCode: '94036090' });
  productId = prodRes.body.data.product.id;

  const tpl = await rawPrisma.paymentTermsTemplate.findFirst();
  templateId = tpl!.id;

  // Create and confirm an order
  const orderRes = await request(app)
    .post('/api/orders')
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ customerId, defaultShippingAddressId: addressId, paymentTermsTemplateId: templateId });
  orderId = orderRes.body.data.order.id;

  await request(app)
    .post(`/api/orders/${orderId}/lines`)
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ lineType: 'catalog_product', productId, quantity: 4 });

  await request(app)
    .post(`/api/orders/${orderId}/confirm`)
    .set({ Authorization: `Bearer ${adminToken}` });
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('Proforma Invoice', () => {
  it('generates proforma for any order', async () => {
    // Create a draft order to test proforma on non-confirmed
    const draftRes = await request(app)
      .post('/api/orders')
      .set(auth(adminToken))
      .send({ customerId, defaultShippingAddressId: addressId, paymentTermsTemplateId: templateId });
    const draftId = draftRes.body.data.order.id;

    await request(app)
      .post(`/api/orders/${draftId}/lines`)
      .set(auth(adminToken))
      .send({ lineType: 'catalog_product', productId, quantity: 2 });

    const res = await request(app)
      .get(`/api/orders/${draftId}/documents/proforma`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.document.documentType).toBe('proforma');
    expect(res.body.data.data.title).toBe('PROFORMA INVOICE');
    expect(res.body.data.data.lineItems.length).toBeGreaterThan(0);
    expect(res.body.data.data.amountInWords).toContain('Rupees');
    expect(res.body.data.data.disclaimer).toContain('proforma');
  });

  it('returns same document on second call (idempotent)', async () => {
    const res1 = await request(app)
      .get(`/api/orders/${orderId}/documents/proforma`)
      .set(auth(adminToken));
    const res2 = await request(app)
      .get(`/api/orders/${orderId}/documents/proforma`)
      .set(auth(adminToken));
    expect(res1.body.data.document.id).toBe(res2.body.data.document.id);
  });
});

describe('Sales Order Confirmation', () => {
  it('generates sales order for confirmed order', async () => {
    const res = await request(app)
      .get(`/api/orders/${orderId}/documents/sales-order`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.document.documentType).toBe('sales_order');
    expect(res.body.data.data.title).toBe('SALES ORDER CONFIRMATION');
    expect(res.body.data.data.lineItems.length).toBe(1);
    expect(res.body.data.data.grandTotal).toBeGreaterThan(0);
  });

  it('rejects sales order for draft order', async () => {
    const draftRes = await request(app)
      .post('/api/orders')
      .set(auth(adminToken))
      .send({ customerId });
    const draftId = draftRes.body.data.order.id;

    const res = await request(app)
      .get(`/api/orders/${draftId}/documents/sales-order`)
      .set(auth(adminToken));
    expect(res.status).toBe(409);
  });
});

describe('Tax Invoice (GST compliant)', () => {
  it('generates tax invoice with all mandatory fields', async () => {
    const res = await request(app)
      .get(`/api/orders/${orderId}/documents/tax-invoice`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    const data = res.body.data.data;
    expect(data.title).toBe('TAX INVOICE');
    expect(data.supplier.gstin).toBeDefined();
    expect(data.recipient.name).toBe('Doc Test Co');
    expect(data.recipient.gstin).toBeTruthy();
    expect(data.placeOfSupply).toBe('27');
    expect(data.isInterstate).toBe(false);
    expect(data.reverseCharge).toBe(false);
    expect(data.taxBreakup.length).toBeGreaterThan(0);
    expect(data.amountInWords).toContain('Rupees');
    expect(data.grandTotal).toBeGreaterThan(0);
  });

  it('has QR data for B2B with gstin and amount >= 500', async () => {
    const res = await request(app)
      .get(`/api/orders/${orderId}/documents/tax-invoice`)
      .set(auth(adminToken));
    expect(res.body.data.data.requiresQr).toBe(true);
    expect(res.body.data.data.qrData).toBeTruthy();
    const qr = JSON.parse(res.body.data.data.qrData);
    expect(qr.sellerGstin).toBeDefined();
    expect(qr.buyerGstin).toBeTruthy();
    expect(qr.invoiceValue).toBeGreaterThan(0);
  });

  it('intrastate shows CGST+SGST in tax breakup', async () => {
    const res = await request(app)
      .get(`/api/orders/${orderId}/documents/tax-invoice`)
      .set(auth(adminToken));
    const breakup = res.body.data.data.taxBreakup[0];
    expect(breakup.cgstAmount).toBeGreaterThan(0);
    expect(breakup.sgstAmount).toBeGreaterThan(0);
    expect(breakup.igstAmount).toBe(0);
  });

  it('rejects tax invoice for draft order', async () => {
    const draftRes = await request(app)
      .post('/api/orders')
      .set(auth(adminToken))
      .send({ customerId });
    const draftId = draftRes.body.data.order.id;

    const res = await request(app)
      .get(`/api/orders/${draftId}/documents/tax-invoice`)
      .set(auth(adminToken));
    expect(res.status).toBe(409);
  });
});

describe('Payment Receipt', () => {
  let milestoneId: string;

  beforeAll(async () => {
    // Generate schedule and make a payment
    await request(app)
      .post(`/api/orders/${orderId}/payment-schedule/generate`)
      .set(auth(adminToken));

    const schedRes = await request(app)
      .get(`/api/orders/${orderId}/payment-schedule`)
      .set(auth(adminToken));
    milestoneId = schedRes.body.data.schedule[0].id;

    await request(app)
      .post(`/api/orders/${orderId}/payments`)
      .set(auth(adminToken))
      .send({ milestoneId, amount: 10000, paymentMode: 'bank_transfer', reference: 'UTR999' });
  });

  it('generates receipt for a paid milestone', async () => {
    const res = await request(app)
      .get(`/api/orders/${orderId}/payments/${milestoneId}/receipt`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.document.documentType).toBe('payment_receipt');
    expect(res.body.data.data.title).toBe('PAYMENT RECEIPT');
    expect(res.body.data.data.amountReceived).toBe(10000);
    expect(res.body.data.data.amountInWords).toContain('Rupees');
  });
});

describe('Document Regeneration & Cancellation', () => {
  it('regenerates a proforma (cancels old, creates new)', async () => {
    const orig = await request(app)
      .get(`/api/orders/${orderId}/documents/proforma`)
      .set(auth(adminToken));
    const origId = orig.body.data.document.id;

    const res = await request(app)
      .post(`/api/orders/${orderId}/documents/proforma/regenerate`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.document.id).not.toBe(origId);
  });

  it('cancels a document', async () => {
    const docs = await request(app)
      .get(`/api/orders/${orderId}`)
      .set(auth(adminToken));
    const cancelledDoc = docs.body.data.order.documents.find((d: any) => d.isCancelled);
    expect(cancelledDoc).toBeDefined();

    // Try to cancel an active one
    const active = docs.body.data.order.documents.find((d: any) => !d.isCancelled);
    if (active) {
      const res = await request(app)
        .post(`/api/orders/${orderId}/documents/${active.id}/cancel`)
        .set(auth(adminToken))
        .send({ reason: 'Error in document' });
      expect(res.status).toBe(200);
      expect(res.body.data.document.isCancelled).toBe(true);
    }
  });

  it('cannot cancel already-cancelled document', async () => {
    const docs = await request(app)
      .get(`/api/orders/${orderId}`)
      .set(auth(adminToken));
    const cancelled = docs.body.data.order.documents.find((d: any) => d.isCancelled);
    if (cancelled) {
      const res = await request(app)
        .post(`/api/orders/${orderId}/documents/${cancelled.id}/cancel`)
        .set(auth(adminToken))
        .send({ reason: 'Again' });
      expect(res.status).toBe(409);
    }
  });
});
