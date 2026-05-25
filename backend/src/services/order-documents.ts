import { prisma } from '../lib/prisma';
import { ConflictError, NotFoundError } from '../errors';
import { getNextNumber } from './numbering';
import { amountToWords } from './pricing';

// -- Document Data Builders ---------------------------------------------------

async function getOrderWithFullDetails(orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, isDeleted: false },
    include: {
      customer: true,
      billingAddress: true,
      shippingAddress: true,
      lines: {
        orderBy: { lineSequence: 'asc' },
        include: { product: true, sizeVariant: true },
      },
      charges: true,
      taxBreakup: true,
      paymentSchedule: { orderBy: { milestoneSequence: 'asc' } },
    },
  });
  if (!order) throw new NotFoundError('Order not found');
  return order;
}

async function getOrgDetails() {
  const org = await prisma.organization.findFirst();
  return org;
}

function buildLineItems(lines: any[]) {
  return lines.map((line, i) => ({
    sno: i + 1,
    description: line.description,
    hsnCode: line.hsnCode,
    quantity: Number(line.quantity),
    uom: line.uom,
    unitRate: Number(line.unitPriceBeforeDiscount),
    discount: Number(line.unitPriceBeforeDiscount) - Number(line.unitPriceFinal),
    taxableValue: Number(line.lineSubtotal),
    cgstRate: line.cgstAmount > 0 ? Number(line.taxRatePercent) / 2 : 0,
    cgstAmount: Number(line.cgstAmount),
    sgstRate: line.sgstAmount > 0 ? Number(line.taxRatePercent) / 2 : 0,
    sgstAmount: Number(line.sgstAmount),
    igstRate: line.igstAmount > 0 ? Number(line.taxRatePercent) : 0,
    igstAmount: Number(line.igstAmount),
    totalAmount: Number(line.lineGrandTotal),
  }));
}

function buildTaxBreakup(breakup: any[]) {
  return breakup.map(b => ({
    hsnCode: b.hsnCode,
    taxableValue: Number(b.taxableValue),
    cgstRate: Number(b.cgstRate),
    cgstAmount: Number(b.cgstAmount),
    sgstRate: Number(b.sgstRate),
    sgstAmount: Number(b.sgstAmount),
    igstRate: Number(b.igstRate),
    igstAmount: Number(b.igstAmount),
    totalTax: Number(b.totalTax),
  }));
}

// -- Proforma Invoice ---------------------------------------------------------

export async function generateProforma(orderId: string, actorId: string) {
  const order = await getOrderWithFullDetails(orderId);
  const org = await getOrgDetails();

  const existing = await prisma.orderDocument.findFirst({
    where: { orderId, documentType: 'proforma', isCancelled: false },
  });
  if (existing) return { document: existing, data: await buildProformaData(order, org) };

  const { number: docNumber } = await getNextNumber('PROF');

  const doc = await prisma.orderDocument.create({
    data: {
      orderId,
      documentType: 'proforma',
      documentNumber: docNumber,
      generatedBy: actorId,
    },
  });

  return { document: doc, data: await buildProformaData(order, org) };
}

async function buildProformaData(order: any, org: any) {
  return {
    title: 'PROFORMA INVOICE',
    documentNumber: undefined as string | undefined,
    date: order.orderDate,
    validityDays: 30,
    consignor: {
      name: org?.name ?? '',
      address: org?.registeredAddress ?? '',
      gstin: org?.gstin ?? '',
      state: org?.gstin ? `State Code: ${org.gstin.substring(0, 2)}` : '',
    },
    consignee: {
      name: order.customer.customerName,
      gstin: order.customer.gstin,
      billingAddress: order.billingAddress,
      shippingAddress: order.shippingAddress,
    },
    lineItems: buildLineItems(order.lines),
    charges: order.charges.map((c: any) => ({
      type: c.chargeType,
      description: c.description,
      amount: Number(c.amount),
    })),
    taxBreakup: buildTaxBreakup(order.taxBreakup),
    subtotal: Number(order.subtotal),
    totalTax: Number(order.totalTax),
    totalCharges: Number(order.totalCharges),
    grandTotal: Number(order.grandTotal),
    roundOffAmount: Number(order.roundOffAmount),
    amountInWords: amountToWords(Number(order.grandTotal)),
    paymentTerms: order.paymentSchedule.map((m: any) => ({
      name: m.milestoneName,
      percentage: Number(m.percentage),
      amount: Number(m.amount),
    })),
    isInterstate: order.isInterstate,
    disclaimer: 'This is a proforma invoice and is not a demand for payment.',
  };
}

// -- Sales Order Confirmation -------------------------------------------------

export async function generateSalesOrder(orderId: string, actorId: string) {
  const order = await getOrderWithFullDetails(orderId);
  const org = await getOrgDetails();

  if (order.status === 'draft') {
    throw new ConflictError('Sales Order can only be generated for confirmed orders');
  }

  const existing = await prisma.orderDocument.findFirst({
    where: { orderId, documentType: 'sales_order', isCancelled: false },
  });
  if (existing) return { document: existing, data: buildSalesOrderData(order, org) };

  const { number: docNumber } = await getNextNumber('SO');

  const doc = await prisma.orderDocument.create({
    data: {
      orderId,
      documentType: 'sales_order',
      documentNumber: docNumber,
      generatedBy: actorId,
    },
  });

  return { document: doc, data: buildSalesOrderData(order, org) };
}

function buildSalesOrderData(order: any, org: any) {
  return {
    title: 'SALES ORDER CONFIRMATION',
    orderNumber: order.orderNumber,
    date: order.confirmedAt ?? order.orderDate,
    supplier: {
      name: org?.name ?? '',
      address: org?.registeredAddress ?? '',
      gstin: org?.gstin ?? '',
    },
    customer: {
      name: order.customer.customerName,
      code: order.customer.customerCode,
      gstin: order.customer.gstin,
      billingAddress: order.billingAddress,
      shippingAddress: order.shippingAddress,
    },
    lineItems: buildLineItems(order.lines),
    expectedDeliveryDate: order.expectedDeliveryDate,
    promisedDeliveryDate: order.promisedDeliveryDate,
    paymentTerms: order.paymentSchedule.map((m: any) => ({
      name: m.milestoneName,
      percentage: Number(m.percentage),
      amount: Number(m.amount),
      triggerEvent: m.triggerEvent,
    })),
    grandTotal: Number(order.grandTotal),
    amountInWords: amountToWords(Number(order.grandTotal)),
    notes: order.notes,
  };
}

// -- Tax Invoice (GST compliant) ----------------------------------------------

export async function generateTaxInvoice(orderId: string, actorId: string) {
  const order = await getOrderWithFullDetails(orderId);
  const org = await getOrgDetails();

  if (order.status === 'draft') {
    throw new ConflictError('Tax Invoice can only be generated for confirmed orders');
  }

  const existing = await prisma.orderDocument.findFirst({
    where: { orderId, documentType: 'tax_invoice', isCancelled: false },
  });
  if (existing) return { document: existing, data: buildTaxInvoiceData(order, org) };

  const { number: docNumber } = await getNextNumber('INV');

  const doc = await prisma.orderDocument.create({
    data: {
      orderId,
      documentType: 'tax_invoice',
      documentNumber: docNumber,
      generatedBy: actorId,
    },
  });

  return { document: doc, data: buildTaxInvoiceData(order, org) };
}

function buildTaxInvoiceData(order: any, org: any) {
  const grandTotal = Number(order.grandTotal);
  const orgStateCode = org?.gstin ? org.gstin.substring(0, 2) : '27';

  return {
    title: 'TAX INVOICE',
    invoiceNumber: undefined as string | undefined,
    date: new Date(),
    supplier: {
      name: org?.name ?? '',
      address: org?.registeredAddress ?? '',
      gstin: org?.gstin ?? '',
      stateCode: orgStateCode,
    },
    recipient: {
      name: order.customer.customerName,
      address: order.billingAddress ?? order.shippingAddress,
      gstin: order.customer.gstin,
      stateCode: order.placeOfSupplyStateCode,
    },
    placeOfSupply: order.placeOfSupplyStateCode,
    isInterstate: order.isInterstate,
    reverseCharge: false,
    lineItems: buildLineItems(order.lines),
    charges: order.charges.map((c: any) => ({
      type: c.chargeType,
      description: c.description,
      amount: Number(c.amount),
      isTaxable: c.isTaxable,
      taxRate: c.taxRatePercent ? Number(c.taxRatePercent) : null,
    })),
    taxBreakup: buildTaxBreakup(order.taxBreakup),
    subtotal: Number(order.subtotal),
    totalTaxableValue: Number(order.taxableValue),
    totalTax: Number(order.totalTax),
    totalCharges: Number(order.totalCharges),
    roundOffAmount: Number(order.roundOffAmount),
    grandTotal,
    amountInWords: amountToWords(grandTotal),
    requiresQr: grandTotal >= 500 && !!order.customer.gstin,
    qrData: grandTotal >= 500 && order.customer.gstin ? JSON.stringify({
      sellerGstin: org?.gstin,
      buyerGstin: order.customer.gstin,
      invoiceNo: undefined,
      invoiceDate: new Date().toISOString().slice(0, 10),
      invoiceValue: grandTotal,
      hsnItems: order.taxBreakup.map((b: any) => ({
        hsn: b.hsnCode,
        taxableValue: Number(b.taxableValue),
        tax: Number(b.totalTax),
      })),
    }) : null,
    bankDetails: org?.bankDetails ?? null,
  };
}

// -- Payment Receipt ----------------------------------------------------------

export async function generatePaymentReceipt(orderId: string, milestoneId: string, actorId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, isDeleted: false },
    include: { customer: true },
  });
  if (!order) throw new NotFoundError('Order not found');

  const milestone = await prisma.orderPaymentSchedule.findFirst({
    where: { id: milestoneId, orderId },
  });
  if (!milestone) throw new NotFoundError('Payment milestone not found');

  if (Number(milestone.amountPaid) === 0) {
    throw new ConflictError('No payment recorded against this milestone');
  }

  const existing = await prisma.orderDocument.findFirst({
    where: { orderId, documentType: 'payment_receipt', documentNumber: { contains: milestoneId.slice(0, 8) } },
  });
  if (existing) {
    return {
      document: existing,
      data: buildReceiptData(order, milestone),
    };
  }

  const { number: docNumber } = await getNextNumber('RCPT');

  const doc = await prisma.orderDocument.create({
    data: {
      orderId,
      documentType: 'payment_receipt',
      documentNumber: docNumber,
      generatedBy: actorId,
    },
  });

  return { document: doc, data: buildReceiptData(order, milestone) };
}

function buildReceiptData(order: any, milestone: any) {
  return {
    title: 'PAYMENT RECEIPT',
    date: milestone.paidAt ?? new Date(),
    receivedFrom: order.customer.customerName,
    orderNumber: order.orderNumber,
    milestoneName: milestone.milestoneName,
    amountReceived: Number(milestone.amountPaid),
    amountInWords: amountToWords(Number(milestone.amountPaid)),
  };
}

// -- Regeneration & Cancellation ----------------------------------------------

export async function regenerateDocument(orderId: string, documentType: string, actorId: string) {
  const existing = await prisma.orderDocument.findFirst({
    where: { orderId, documentType, isCancelled: false },
  });
  if (existing) {
    await prisma.orderDocument.update({
      where: { id: existing.id },
      data: { isCancelled: true, cancelledReason: 'Regenerated' },
    });
  }

  switch (documentType) {
    case 'proforma': return generateProforma(orderId, actorId);
    case 'sales_order': return generateSalesOrder(orderId, actorId);
    case 'tax_invoice': return generateTaxInvoice(orderId, actorId);
    default: throw new NotFoundError(`Unknown document type: ${documentType}`);
  }
}

export async function cancelDocument(documentId: string, reason: string) {
  const doc = await prisma.orderDocument.findUnique({ where: { id: documentId } });
  if (!doc) throw new NotFoundError('Document not found');
  if (doc.isCancelled) throw new ConflictError('Document is already cancelled');

  const updated = await prisma.orderDocument.update({
    where: { id: documentId },
    data: { isCancelled: true, cancelledReason: reason },
  });

  return { document: updated };
}
