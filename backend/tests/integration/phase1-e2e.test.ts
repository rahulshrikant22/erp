import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { rawPrisma } from '../../src/lib/prisma-base';
import { createInternalUser, loginInternal } from '../helpers';

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

const auth = () => ({ Authorization: `Bearer ${adminToken}` });

describe('E2E: Full order lifecycle (intrastate)', () => {
  let customerId: string;
  let billingAddressId: string;
  let shippingAddressId: string;
  let productId: string;
  let variantId: string;
  let categoryId: string;
  let orderId: string;
  let templateId: string;

  it('creates customer with GSTIN', async () => {
    const suffix = Date.now().toString().slice(-4);
    const res = await request(app)
      .post('/api/customers')
      .set(auth())
      .send({ customerName: 'E2E Furniture Hub', customerType: 'dealer', gstin: `27BBBCA${suffix}F1Z5` });
    expect(res.status).toBe(201);
    customerId = res.body.data.customer.id;
  });

  it('adds billing and shipping addresses', async () => {
    const bill = await request(app)
      .post(`/api/customers/${customerId}/addresses`)
      .set(auth())
      .send({ addressType: 'billing', addressLine1: '10 MG Road', city: 'Mumbai', state: 'Maharashtra', pincode: '400001', stateCode: '27', isDefaultBilling: true });
    billingAddressId = bill.body.data.address.id;

    const ship = await request(app)
      .post(`/api/customers/${customerId}/addresses`)
      .set(auth())
      .send({ addressType: 'shipping', addressLine1: '20 FC Road', city: 'Pune', state: 'Maharashtra', pincode: '411001', stateCode: '27', isDefaultShipping: true });
    shippingAddressId = ship.body.data.address.id;
    expect(bill.status).toBe(201);
    expect(ship.status).toBe(201);
  });

  it('creates category and product with variant and tier pricing', async () => {
    const catRes = await request(app)
      .post('/api/product-categories')
      .set(auth())
      .send({ categoryCode: `E2ECAT_${Date.now()}`, name: 'Office Desks' });
    categoryId = catRes.body.data.category.id;

    const prodRes = await request(app)
      .post('/api/products')
      .set(auth())
      .send({ productName: 'Executive Desk Pro', categoryId, basePrice: 50000, taxRatePercent: 18, hsnCode: '94036090' });
    productId = prodRes.body.data.product.id;

    const varRes = await request(app)
      .post(`/api/products/${productId}/variants`)
      .set(auth())
      .send({ variantName: '1500x750', dimensions: { L: 1500, W: 750, H: 750 }, priceOverride: 55000 });
    variantId = varRes.body.data.variant.id;

    // Dealer tier pricing: 15% discount
    await request(app)
      .post(`/api/products/${productId}/tier-pricing`)
      .set(auth())
      .send({ customerType: 'dealer', discountPercent: 15 });
  });

  it('creates order with catalog + custom lines and charges', async () => {
    templateId = (await rawPrisma.paymentTermsTemplate.findFirst())!.id;

    const orderRes = await request(app)
      .post('/api/orders')
      .set(auth())
      .send({
        customerId,
        billingAddressId,
        defaultShippingAddressId: shippingAddressId,
        paymentTermsTemplateId: templateId,
      });
    orderId = orderRes.body.data.order.id;
    expect(orderRes.body.data.order.isInterstate).toBe(false);

    // Catalog line — should resolve to dealer tier price (50000 * 0.85 = 42500)
    const catLine = await request(app)
      .post(`/api/orders/${orderId}/lines`)
      .set(auth())
      .send({ lineType: 'catalog_product', productId, quantity: 2 });
    expect(catLine.status).toBe(201);
    expect(Number(catLine.body.data.line.unitPriceBeforeDiscount)).toBe(42500);
    expect(catLine.body.data.line.priceSource).toBe('customer_type_tier');

    // Custom item
    const custLine = await request(app)
      .post(`/api/orders/${orderId}/lines`)
      .set(auth())
      .send({ lineType: 'custom_item', description: 'Custom partition 2400x1200', quantity: 3, unitPrice: 12000, taxRatePercent: 18, hsnCode: '94036090' });
    expect(custLine.status).toBe(201);

    // Transport charge
    await request(app)
      .post(`/api/orders/${orderId}/charges`)
      .set(auth())
      .send({ chargeType: 'transport', amount: 5000, description: 'Pune delivery' });
  });

  it('verifies tax calculation (intrastate CGST+SGST)', async () => {
    const getRes = await request(app)
      .get(`/api/orders/${orderId}`)
      .set(auth());
    const order = getRes.body.data.order;

    // Line 1: 2 × 42500 = 85000, tax 18% = 15300, CGST=7650, SGST=7650
    const line1 = order.lines[0];
    expect(Number(line1.cgstAmount)).toBe(7650);
    expect(Number(line1.sgstAmount)).toBe(7650);
    expect(Number(line1.igstAmount)).toBe(0);

    // HSN-wise breakup
    expect(order.taxBreakup.length).toBeGreaterThan(0);
    expect(Number(order.subtotal)).toBeGreaterThan(0);
    expect(Number(order.totalTax)).toBeGreaterThan(0);
    expect(Number(order.grandTotal)).toBeGreaterThan(0);
  });

  it('confirms order → verifies locking and status history', async () => {
    const confRes = await request(app)
      .post(`/api/orders/${orderId}/confirm`)
      .set(auth());
    expect(confRes.status).toBe(200);
    expect(confRes.body.data.order.status).toBe('confirmed');

    // Locked from edits
    const addLineRes = await request(app)
      .post(`/api/orders/${orderId}/lines`)
      .set(auth())
      .send({ lineType: 'catalog_product', productId, quantity: 1 });
    expect(addLineRes.status).toBe(409);

    // Status history
    const getRes = await request(app)
      .get(`/api/orders/${orderId}`)
      .set(auth());
    expect(getRes.body.data.order.statusHistory.length).toBeGreaterThan(0);
  });

  it('generates payment schedule and records payment', async () => {
    const genRes = await request(app)
      .post(`/api/orders/${orderId}/payment-schedule/generate`)
      .set(auth());
    expect(genRes.status).toBe(201);
    expect(genRes.body.data.schedule.length).toBeGreaterThan(0);

    const schedRes = await request(app)
      .get(`/api/orders/${orderId}/payment-schedule`)
      .set(auth());
    const milestone = schedRes.body.data.schedule[0];
    const halfAmount = Math.floor(Number(milestone.amount) / 2);

    const payRes = await request(app)
      .post(`/api/orders/${orderId}/payments`)
      .set(auth())
      .send({ milestoneId: milestone.id, amount: halfAmount, paymentMode: 'bank_transfer', reference: 'UTR_E2E_001' });
    expect(payRes.status).toBe(201);
    expect(payRes.body.data.payment.milestoneStatus).toBe('partial');
  });

  it('generates all 4 documents', async () => {
    const proforma = await request(app).get(`/api/orders/${orderId}/documents/proforma`).set(auth());
    expect(proforma.status).toBe(200);
    expect(proforma.body.data.data.amountInWords).toContain('Rupees');

    const so = await request(app).get(`/api/orders/${orderId}/documents/sales-order`).set(auth());
    expect(so.status).toBe(200);
    expect(so.body.data.data.title).toBe('SALES ORDER CONFIRMATION');

    const inv = await request(app).get(`/api/orders/${orderId}/documents/tax-invoice`).set(auth());
    expect(inv.status).toBe(200);
    expect(inv.body.data.data.title).toBe('TAX INVOICE');
    expect(inv.body.data.data.taxBreakup.length).toBeGreaterThan(0);
    expect(inv.body.data.data.requiresQr).toBe(true);

    // Payment receipt
    const schedRes = await request(app).get(`/api/orders/${orderId}/payment-schedule`).set(auth());
    const milestoneId = schedRes.body.data.schedule[0].id;
    const receipt = await request(app).get(`/api/orders/${orderId}/payments/${milestoneId}/receipt`).set(auth());
    expect(receipt.status).toBe(200);
    expect(receipt.body.data.data.title).toBe('PAYMENT RECEIPT');
  });
});

describe('E2E: Interstate order (IGST)', () => {
  let customerId: string;
  let addressId: string;
  let productId: string;

  beforeAll(async () => {
    const suffix = Date.now().toString().slice(-4);
    const custRes = await request(app)
      .post('/api/customers')
      .set(auth())
      .send({ customerName: 'Karnataka Client', customerType: 'corporate', gstin: `29AADCA${suffix}F1Z3` });
    customerId = custRes.body.data.customer.id;

    const addrRes = await request(app)
      .post(`/api/customers/${customerId}/addresses`)
      .set(auth())
      .send({ addressType: 'shipping', addressLine1: '100 Brigade Rd', city: 'Bangalore', state: 'Karnataka', pincode: '560001', stateCode: '29', isDefaultShipping: true });
    addressId = addrRes.body.data.address.id;

    const catRes = await request(app)
      .post('/api/product-categories')
      .set(auth())
      .send({ categoryCode: `INTCAT_${Date.now()}`, name: 'Interstate Cat' });
    const prodRes = await request(app)
      .post('/api/products')
      .set(auth())
      .send({ productName: 'Interstate Desk', categoryId: catRes.body.data.category.id, basePrice: 40000, taxRatePercent: 18, hsnCode: '94036090' });
    productId = prodRes.body.data.product.id;
  });

  it('creates interstate order with IGST', async () => {
    const templateId = (await rawPrisma.paymentTermsTemplate.findFirst())!.id;
    const orderRes = await request(app)
      .post('/api/orders')
      .set(auth())
      .send({ customerId, defaultShippingAddressId: addressId, paymentTermsTemplateId: templateId });
    expect(orderRes.body.data.order.isInterstate).toBe(true);
    expect(orderRes.body.data.order.placeOfSupplyStateCode).toBe('29');

    const orderId = orderRes.body.data.order.id;
    const lineRes = await request(app)
      .post(`/api/orders/${orderId}/lines`)
      .set(auth())
      .send({ lineType: 'catalog_product', productId, quantity: 1 });
    expect(lineRes.status).toBe(201);
    expect(Number(lineRes.body.data.line.igstAmount)).toBe(7200);
    expect(Number(lineRes.body.data.line.cgstAmount)).toBe(0);
    expect(Number(lineRes.body.data.line.sgstAmount)).toBe(0);
  });
});

describe('E2E: Multi-shipment', () => {
  it('assigns lines to multiple shipments', async () => {
    const custRes = await request(app).post('/api/customers').set(auth()).send({ customerName: 'Multi Ship Co', customerType: 'retail' });
    const customerId = custRes.body.data.customer.id;
    const addr1 = await request(app).post(`/api/customers/${customerId}/addresses`).set(auth())
      .send({ addressType: 'shipping', addressLine1: 'Site A', city: 'Pune', state: 'Maharashtra', pincode: '411001', stateCode: '27' });
    const addr2 = await request(app).post(`/api/customers/${customerId}/addresses`).set(auth())
      .send({ addressType: 'shipping', addressLine1: 'Site B', city: 'Pune', state: 'Maharashtra', pincode: '411002', stateCode: '27' });

    const catRes = await request(app).post('/api/product-categories').set(auth()).send({ categoryCode: `MSCAT_${Date.now()}`, name: 'MS Cat' });
    const prodRes = await request(app).post('/api/products').set(auth())
      .send({ productName: 'Bulk Desk', categoryId: catRes.body.data.category.id, basePrice: 10000, taxRatePercent: 18 });
    const productId = prodRes.body.data.product.id;

    const orderRes = await request(app).post('/api/orders').set(auth())
      .send({ customerId, defaultShippingAddressId: addr1.body.data.address.id });
    const orderId = orderRes.body.data.order.id;

    const lineRes = await request(app).post(`/api/orders/${orderId}/lines`).set(auth())
      .send({ lineType: 'catalog_product', productId, quantity: 20 });
    const lineId = lineRes.body.data.line.id;

    const s1 = await request(app).post(`/api/orders/${orderId}/shipments`).set(auth())
      .send({ shippingAddressId: addr1.body.data.address.id });
    const s2 = await request(app).post(`/api/orders/${orderId}/shipments`).set(auth())
      .send({ shippingAddressId: addr2.body.data.address.id });

    await request(app).post(`/api/orders/${orderId}/shipments/${s1.body.data.shipment.id}/assign-lines`).set(auth())
      .send({ assignments: [{ orderLineId: lineId, quantity: 12 }] });
    await request(app).post(`/api/orders/${orderId}/shipments/${s2.body.data.shipment.id}/assign-lines`).set(auth())
      .send({ assignments: [{ orderLineId: lineId, quantity: 8 }] });

    const getRes = await request(app).get(`/api/orders/${orderId}`).set(auth());
    expect(getRes.body.data.order.shipments.length).toBe(2);
    expect(getRes.body.data.order.shipments[0].shipmentLines.length).toBe(1);
    expect(getRes.body.data.order.shipments[1].shipmentLines.length).toBe(1);
  });
});

describe('E2E: Pricing priority chain', () => {
  let customerId: string;
  let productId: string;
  let orderId: string;

  beforeAll(async () => {
    const custRes = await request(app).post('/api/customers').set(auth())
      .send({ customerName: 'Priority Test Co', customerType: 'dealer' });
    customerId = custRes.body.data.customer.id;

    const catRes = await request(app).post('/api/product-categories').set(auth())
      .send({ categoryCode: `PRIOCAT_${Date.now()}`, name: 'Priority Cat' });
    const prodRes = await request(app).post('/api/products').set(auth())
      .send({ productName: 'Priority Desk', categoryId: catRes.body.data.category.id, basePrice: 100000, taxRatePercent: 18 });
    productId = prodRes.body.data.product.id;

    // Customer type tier: 10% discount → 90000
    await request(app).post(`/api/products/${productId}/tier-pricing`).set(auth())
      .send({ customerType: 'dealer', discountPercent: 10 });

    // Customer-specific tier: special price 85000
    await rawPrisma.customerTierPricing.create({
      data: { customerId, productId, specialPrice: 85000 },
    });

    const orderRes = await request(app).post('/api/orders').set(auth()).send({ customerId });
    orderId = orderRes.body.data.order.id;
  });

  it('customer-specific tier wins over type tier', async () => {
    const res = await request(app).post(`/api/orders/${orderId}/lines`).set(auth())
      .send({ lineType: 'catalog_product', productId, quantity: 1 });
    expect(Number(res.body.data.line.unitPriceBeforeDiscount)).toBe(85000);
    expect(res.body.data.line.priceSource).toBe('customer_tier');
  });

  it('manual override wins over all tiers', async () => {
    const res = await request(app).post(`/api/orders/${orderId}/lines`).set(auth())
      .send({ lineType: 'catalog_product', productId, quantity: 1, unitPrice: 80000 });
    expect(Number(res.body.data.line.unitPriceBeforeDiscount)).toBe(80000);
    expect(res.body.data.line.priceSource).toBe('manual_override');
  });
});

describe('E2E: Quote conversion readiness', () => {
  it('accepts source=quote_conversion with source_quote_id', async () => {
    const custRes = await request(app).post('/api/customers').set(auth())
      .send({ customerName: 'Quote Conv Co', customerType: 'retail' });
    const customerId = custRes.body.data.customer.id;

    const order = await rawPrisma.order.create({
      data: {
        orderNumber: `QC-${Date.now()}`,
        customerId,
        orderDate: new Date(),
        source: 'quote_conversion',
        sourceQuoteId: '00000000-0000-0000-0000-000000000001',
        status: 'draft',
      },
    });
    expect(order.source).toBe('quote_conversion');
    expect(order.sourceQuoteId).toBe('00000000-0000-0000-0000-000000000001');
  });
});

describe('E2E: Numbering series', () => {
  it('ORD series produces sequential numbers', async () => {
    const custRes = await request(app).post('/api/customers').set(auth()).send({ customerName: 'Num Co', customerType: 'retail' });
    const res1 = await request(app).post('/api/orders').set(auth()).send({ customerId: custRes.body.data.customer.id });
    const res2 = await request(app).post('/api/orders').set(auth()).send({ customerId: custRes.body.data.customer.id });
    const n1 = res1.body.data.order.orderNumber;
    const n2 = res2.body.data.order.orderNumber;
    expect(n1).not.toBe(n2);
    // Both should start with ORD prefix
    expect(n1.startsWith('ORD')).toBe(true);
    expect(n2.startsWith('ORD')).toBe(true);
  });
});
