import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { getNextNumber } from './numbering';
import { resolvePrice, applyDiscount, calculateTax, getOrgStateCode, roundToNearestRupee } from './pricing';

// -- Order Header -------------------------------------------------------------

export interface CreateOrderInput {
  customerId: string;
  orderDate?: string;
  orderType?: string;
  source?: string;
  billingAddressId?: string;
  defaultShippingAddressId?: string;
  expectedDeliveryDate?: string;
  promisedDeliveryDate?: string;
  paymentTermsTemplateId?: string;
  notes?: string;
  internalNotes?: string;
}

export interface UpdateOrderInput {
  orderDate?: string;
  orderType?: string;
  billingAddressId?: string | null;
  defaultShippingAddressId?: string | null;
  expectedDeliveryDate?: string | null;
  promisedDeliveryDate?: string | null;
  paymentTermsTemplateId?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
}

export interface ListOrderFilters {
  status?: string;
  customer?: string;
  dateFrom?: string;
  dateTo?: string;
  source?: string;
  page: number;
  limit: number;
}

export async function createOrder(input: CreateOrderInput, createdBy?: string) {
  const customer = await prisma.customer.findFirst({ where: { id: input.customerId, isDeleted: false } });
  if (!customer) throw new NotFoundError('Customer not found');

  const { number: orderNumber } = await getNextNumber('ORD');

  let placeOfSupplyStateCode: string | null = null;
  let isInterstate = false;

  if (input.defaultShippingAddressId) {
    const addr = await prisma.customerAddress.findUnique({ where: { id: input.defaultShippingAddressId } });
    if (addr?.stateCode) {
      placeOfSupplyStateCode = addr.stateCode;
      const orgState = await getOrgStateCode();
      isInterstate = addr.stateCode !== orgState;
    }
  }

  const order = await prisma.order.create({
    data: {
      orderNumber,
      customerId: input.customerId,
      orderDate: input.orderDate ? new Date(input.orderDate) : new Date(),
      orderType: input.orderType ?? 'regular',
      source: input.source ?? 'manual',
      billingAddressId: input.billingAddressId,
      defaultShippingAddressId: input.defaultShippingAddressId,
      expectedDeliveryDate: input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : null,
      promisedDeliveryDate: input.promisedDeliveryDate ? new Date(input.promisedDeliveryDate) : null,
      paymentTermsTemplateId: input.paymentTermsTemplateId,
      placeOfSupplyStateCode,
      isInterstate,
      notes: input.notes,
      internalNotes: input.internalNotes,
      createdBy,
      status: 'draft',
    },
  });

  return { order };
}

export async function listOrders(filters: ListOrderFilters) {
  const where: Prisma.OrderWhereInput = { isDeleted: false };
  if (filters.status) where.status = filters.status;
  if (filters.customer) where.customerId = filters.customer;
  if (filters.source) where.source = filters.source;
  if (filters.dateFrom || filters.dateTo) {
    where.orderDate = {};
    if (filters.dateFrom) where.orderDate.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.orderDate.lte = new Date(filters.dateTo);
  }

  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: { customer: { select: { id: true, customerCode: true, customerName: true, customerType: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);

  return { total, page: filters.page, limit: filters.limit, orders };
}

export async function getOrder(id: string) {
  const order = await prisma.order.findFirst({
    where: { id, isDeleted: false },
    include: {
      customer: { select: { id: true, customerCode: true, customerName: true, customerType: true } },
      billingAddress: true,
      shippingAddress: true,
      lines: {
        orderBy: { lineSequence: 'asc' },
        include: {
          product: { select: { id: true, productCode: true, productName: true } },
          sizeVariant: { select: { id: true, variantName: true, variantSku: true } },
          customSpecs: true,
        },
      },
      shipments: { include: { shipmentLines: true, shippingAddress: true } },
      paymentSchedule: { orderBy: { milestoneSequence: 'asc' } },
      documents: { orderBy: { generatedAt: 'desc' } },
      charges: true,
      taxBreakup: true,
      statusHistory: { orderBy: { changedAt: 'desc' } },
    },
  });
  if (!order) throw new NotFoundError('Order not found');
  return { order };
}

export async function updateOrder(id: string, input: UpdateOrderInput) {
  const existing = await prisma.order.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw new NotFoundError('Order not found');
  if (existing.status !== 'draft') throw new ConflictError('Only draft orders can be edited');

  let placeOfSupplyStateCode = existing.placeOfSupplyStateCode;
  let isInterstate = existing.isInterstate;

  if (input.defaultShippingAddressId !== undefined) {
    if (input.defaultShippingAddressId) {
      const addr = await prisma.customerAddress.findUnique({ where: { id: input.defaultShippingAddressId } });
      if (addr?.stateCode) {
        placeOfSupplyStateCode = addr.stateCode;
        const orgState = await getOrgStateCode();
        isInterstate = addr.stateCode !== orgState;
      }
    } else {
      placeOfSupplyStateCode = null;
      isInterstate = false;
    }
  }

  const order = await prisma.order.update({
    where: { id },
    data: {
      ...(input.orderDate !== undefined && { orderDate: new Date(input.orderDate) }),
      ...(input.orderType !== undefined && { orderType: input.orderType }),
      ...(input.billingAddressId !== undefined && { billingAddressId: input.billingAddressId }),
      ...(input.defaultShippingAddressId !== undefined && { defaultShippingAddressId: input.defaultShippingAddressId }),
      ...(input.expectedDeliveryDate !== undefined && { expectedDeliveryDate: input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : null }),
      ...(input.promisedDeliveryDate !== undefined && { promisedDeliveryDate: input.promisedDeliveryDate ? new Date(input.promisedDeliveryDate) : null }),
      ...(input.paymentTermsTemplateId !== undefined && { paymentTermsTemplateId: input.paymentTermsTemplateId }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.internalNotes !== undefined && { internalNotes: input.internalNotes }),
      placeOfSupplyStateCode,
      isInterstate,
    },
  });

  return { order };
}

export async function softDeleteOrder(id: string, actorId: string) {
  const existing = await prisma.order.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw new NotFoundError('Order not found');
  if (existing.status !== 'draft') throw new ConflictError('Only draft orders can be deleted');

  await prisma.order.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), deletedById: actorId },
  });
}

// -- Order Lines --------------------------------------------------------------

export interface AddLineInput {
  lineType: string;
  productId?: string;
  productSizeVariantId?: string;
  description?: string;
  quantity: number;
  uom?: string;
  unitPrice?: number;
  discountType?: string;
  discountValue?: number;
  hsnCode?: string;
  taxRatePercent?: number;
  customDimensions?: Record<string, unknown>;
  notes?: string;
}

export interface UpdateLineInput {
  quantity?: number;
  unitPrice?: number;
  discountType?: string;
  discountValue?: number;
  description?: string;
  notes?: string;
}

export async function addOrderLine(orderId: string, input: AddLineInput) {
  const order = await prisma.order.findFirst({ where: { id: orderId, isDeleted: false } });
  if (!order) throw new NotFoundError('Order not found');
  if (order.status !== 'draft') throw new ConflictError('Can only add lines to draft orders');

  if (input.quantity <= 0) throw new ValidationError('Quantity must be greater than 0', { field: 'quantity' });

  let unitPrice: number;
  let hsnCode = input.hsnCode ?? null;
  let taxRatePercent = input.taxRatePercent ?? 0;
  let description = input.description ?? null;
  let priceSource = 'manual_override';

  if (input.lineType === 'catalog_product') {
    if (!input.productId) throw new ValidationError('productId is required for catalog_product', { field: 'productId' });
    const product = await prisma.product.findFirst({ where: { id: input.productId, isDeleted: false } });
    if (!product) throw new NotFoundError('Product not found');

    if (input.productSizeVariantId) {
      const variant = await prisma.productSizeVariant.findFirst({ where: { id: input.productSizeVariantId, productId: input.productId, isActive: true } });
      if (!variant) throw new NotFoundError('Size variant not found');
    }

    const resolved = await resolvePrice(
      input.productId,
      input.productSizeVariantId,
      order.customerId,
      input.quantity,
      input.unitPrice,
    );
    unitPrice = resolved.unitPrice;
    priceSource = resolved.priceSource;

    hsnCode = product.hsnCode;
    taxRatePercent = Number(product.taxRatePercent);
    description = description ?? product.productName;
  } else if (input.lineType === 'custom_item') {
    if (!input.description) throw new ValidationError('description is required for custom_item', { field: 'description' });
    if (!input.unitPrice) throw new ValidationError('unitPrice is required for custom_item', { field: 'unitPrice' });
    unitPrice = input.unitPrice;
  } else {
    unitPrice = input.unitPrice ?? 0;
  }

  const discountType = input.discountType ?? 'none';
  const discountValue = input.discountValue ?? 0;
  const { unitPriceFinal } = applyDiscount(unitPrice, discountType, discountValue);

  const lineSubtotal = input.quantity * unitPriceFinal;
  const tax = calculateTax(lineSubtotal, taxRatePercent, order.isInterstate);

  const maxSeq = await prisma.orderLine.aggregate({ where: { orderId }, _max: { lineSequence: true } });
  const lineSequence = (maxSeq._max.lineSequence ?? 0) + 1;

  const line = await prisma.orderLine.create({
    data: {
      orderId,
      lineSequence,
      lineType: input.lineType,
      productId: input.productId,
      productSizeVariantId: input.productSizeVariantId,
      description,
      quantity: input.quantity,
      uom: input.uom ?? 'PCS',
      unitPriceBeforeDiscount: unitPrice,
      discountType,
      discountValue,
      unitPriceFinal,
      lineSubtotal,
      hsnCode,
      taxRatePercent,
      cgstAmount: tax.cgstAmount,
      sgstAmount: tax.sgstAmount,
      igstAmount: tax.igstAmount,
      lineTaxTotal: tax.totalTax,
      lineGrandTotal: lineSubtotal + tax.totalTax,
      priceSource,
      customDimensions: input.customDimensions ?? Prisma.JsonNull,
      notes: input.notes,
    },
  });

  await recalculateOrderTotals(orderId);
  return { line };
}

export async function updateOrderLine(orderId: string, lineId: string, input: UpdateLineInput) {
  const order = await prisma.order.findFirst({ where: { id: orderId, isDeleted: false } });
  if (!order) throw new NotFoundError('Order not found');
  if (order.status !== 'draft') throw new ConflictError('Can only edit lines on draft orders');

  const existing = await prisma.orderLine.findFirst({ where: { id: lineId, orderId } });
  if (!existing) throw new NotFoundError('Order line not found');

  const quantity = input.quantity ?? Number(existing.quantity);
  const unitPrice = input.unitPrice ?? Number(existing.unitPriceBeforeDiscount);
  const discountType = input.discountType ?? existing.discountType;
  const discountValue = input.discountValue ?? Number(existing.discountValue);

  const { unitPriceFinal } = applyDiscount(unitPrice, discountType, discountValue);
  const lineSubtotal = quantity * unitPriceFinal;
  const taxRatePercent = Number(existing.taxRatePercent);
  const tax = calculateTax(lineSubtotal, taxRatePercent, order.isInterstate);

  const line = await prisma.orderLine.update({
    where: { id: lineId },
    data: {
      ...(input.quantity !== undefined && { quantity: input.quantity }),
      ...(input.unitPrice !== undefined && { unitPriceBeforeDiscount: input.unitPrice }),
      ...(input.discountType !== undefined && { discountType: input.discountType }),
      ...(input.discountValue !== undefined && { discountValue: input.discountValue }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.notes !== undefined && { notes: input.notes }),
      unitPriceFinal,
      lineSubtotal,
      cgstAmount: tax.cgstAmount,
      sgstAmount: tax.sgstAmount,
      igstAmount: tax.igstAmount,
      lineTaxTotal: tax.totalTax,
      lineGrandTotal: lineSubtotal + tax.totalTax,
    },
  });

  await recalculateOrderTotals(orderId);
  return { line };
}

export async function deleteOrderLine(orderId: string, lineId: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, isDeleted: false } });
  if (!order) throw new NotFoundError('Order not found');
  if (order.status !== 'draft') throw new ConflictError('Can only remove lines from draft orders');

  const existing = await prisma.orderLine.findFirst({ where: { id: lineId, orderId } });
  if (!existing) throw new NotFoundError('Order line not found');

  await prisma.orderLine.delete({ where: { id: lineId } });
  await recalculateOrderTotals(orderId);
}

// -- Custom Specs -------------------------------------------------------------

export interface AddCustomSpecInput {
  specKey: string;
  specValue: string;
  specType?: string;
  notes?: string;
}

export async function addCustomSpec(orderId: string, lineId: string, input: AddCustomSpecInput) {
  const line = await prisma.orderLine.findFirst({ where: { id: lineId, orderId } });
  if (!line) throw new NotFoundError('Order line not found');

  const spec = await prisma.orderLineCustomSpec.create({
    data: {
      orderLineId: lineId,
      specKey: input.specKey,
      specValue: input.specValue,
      specType: input.specType ?? 'other',
      notes: input.notes,
    },
  });

  return { spec };
}

// -- Shipments ----------------------------------------------------------------

export interface CreateShipmentInput {
  shippingAddressId?: string;
  expectedDispatchDate?: string;
  notes?: string;
}

export interface AssignLinesInput {
  assignments: Array<{ orderLineId: string; quantity: number }>;
}

export async function createShipment(orderId: string, input: CreateShipmentInput) {
  const order = await prisma.order.findFirst({ where: { id: orderId, isDeleted: false } });
  if (!order) throw new NotFoundError('Order not found');

  const count = await prisma.orderShipment.count({ where: { orderId } });
  const shipmentNumber = `S${String(count + 1).padStart(2, '0')}`;

  const shipment = await prisma.orderShipment.create({
    data: {
      orderId,
      shipmentNumber,
      shippingAddressId: input.shippingAddressId ?? order.defaultShippingAddressId,
      expectedDispatchDate: input.expectedDispatchDate ? new Date(input.expectedDispatchDate) : null,
      notes: input.notes,
    },
  });

  return { shipment };
}

export async function assignShipmentLines(orderId: string, shipmentId: string, input: AssignLinesInput) {
  const shipment = await prisma.orderShipment.findFirst({ where: { id: shipmentId, orderId } });
  if (!shipment) throw new NotFoundError('Shipment not found');

  const created = [];
  for (const a of input.assignments) {
    const line = await prisma.orderLine.findFirst({ where: { id: a.orderLineId, orderId } });
    if (!line) throw new ValidationError(`Order line ${a.orderLineId} not found`);

    const sl = await prisma.orderShipmentLine.create({
      data: { shipmentId, orderLineId: a.orderLineId, quantityInShipment: a.quantity },
    });
    created.push(sl);
  }

  return { shipmentLines: created };
}

// -- Order Charges ------------------------------------------------------------

export interface AddChargeInput {
  chargeType: string;
  description?: string;
  amount: number;
  isTaxable?: boolean;
  hsnCode?: string;
  taxRatePercent?: number;
}

export async function addOrderCharge(orderId: string, input: AddChargeInput) {
  const order = await prisma.order.findFirst({ where: { id: orderId, isDeleted: false } });
  if (!order) throw new NotFoundError('Order not found');
  if (order.status !== 'draft') throw new ConflictError('Can only add charges to draft orders');

  const charge = await prisma.orderCharge.create({
    data: {
      orderId,
      chargeType: input.chargeType,
      description: input.description,
      amount: input.amount,
      isTaxable: input.isTaxable ?? true,
      hsnCode: input.hsnCode,
      taxRatePercent: input.taxRatePercent,
    },
  });

  await recalculateOrderTotals(orderId);
  return { charge };
}

// -- Recalculate Totals -------------------------------------------------------

export async function recalculateOrderTotals(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { amountPaid: true, isInterstate: true } });
  if (!order) return;

  const lines = await prisma.orderLine.findMany({ where: { orderId } });
  const charges = await prisma.orderCharge.findMany({ where: { orderId } });

  let subtotal = 0;
  let totalDiscount = 0;
  let taxableValue = 0;
  let totalTax = 0;

  for (const line of lines) {
    subtotal += Number(line.lineSubtotal);
    totalDiscount += Number(line.quantity) * (Number(line.unitPriceBeforeDiscount) - Number(line.unitPriceFinal));
    taxableValue += Number(line.lineSubtotal);
    totalTax += Number(line.lineTaxTotal);
  }

  let totalCharges = 0;
  for (const charge of charges) {
    totalCharges += Number(charge.amount);
    if (charge.isTaxable && charge.taxRatePercent) {
      const chargeTax = calculateTax(Number(charge.amount), Number(charge.taxRatePercent), order.isInterstate);
      totalTax += chargeTax.totalTax;
      taxableValue += Number(charge.amount);
    }
  }

  const rawGrandTotal = subtotal + totalTax + totalCharges;
  const { roundedTotal, roundOffAmount } = roundToNearestRupee(rawGrandTotal);
  const amountDue = roundedTotal - Number(order.amountPaid ?? 0);

  await prisma.order.update({
    where: { id: orderId },
    data: {
      subtotal: Math.round(subtotal * 100) / 100,
      totalDiscount: Math.round(totalDiscount * 100) / 100,
      taxableValue: Math.round(taxableValue * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
      totalCharges: Math.round(totalCharges * 100) / 100,
      grandTotal: roundedTotal,
      roundOffAmount,
      amountDue: Math.round(amountDue * 100) / 100,
    },
  });

  // Rebuild HSN-wise tax breakup
  await prisma.orderTaxBreakup.deleteMany({ where: { orderId } });
  const hsnMap = new Map<string, { taxableValue: number; cgst: number; sgst: number; igst: number; rate: number }>();

  for (const line of lines) {
    const hsn = line.hsnCode || 'UNKNOWN';
    const entry = hsnMap.get(hsn) ?? { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, rate: Number(line.taxRatePercent) };
    entry.taxableValue += Number(line.lineSubtotal);
    entry.cgst += Number(line.cgstAmount);
    entry.sgst += Number(line.sgstAmount);
    entry.igst += Number(line.igstAmount);
    hsnMap.set(hsn, entry);
  }

  for (const [hsn, entry] of hsnMap) {
    await prisma.orderTaxBreakup.create({
      data: {
        orderId,
        hsnCode: hsn,
        taxableValue: entry.taxableValue,
        cgstRate: entry.rate / 2,
        cgstAmount: entry.cgst,
        sgstRate: entry.rate / 2,
        sgstAmount: entry.sgst,
        igstRate: entry.rate,
        igstAmount: entry.igst,
        totalTax: entry.cgst + entry.sgst + entry.igst,
      },
    });
  }
}

// -- Order Status Workflow ----------------------------------------------------

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['in_production', 'cancelled'],
  in_production: ['ready_for_dispatch', 'cancelled'],
  ready_for_dispatch: ['dispatched'],
  dispatched: ['delivered'],
  delivered: ['installed', 'completed'],
  installed: ['completed'],
  completed: [],
  cancelled: [],
};

const PHASE1_TRANSITIONS: Record<string, string[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['cancelled'],
};

function isTransitionAllowed(from: string, to: string): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

function computeTimeInPreviousStatus(updatedAt: Date): number {
  const ms = Date.now() - updatedAt.getTime();
  return Math.round((ms / 3600000) * 100) / 100;
}

export async function confirmOrder(orderId: string, actorId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, isDeleted: false },
    include: { lines: true },
  });
  if (!order) throw new NotFoundError('Order not found');
  if (order.status !== 'draft') throw new ConflictError('Only draft orders can be confirmed');

  // Preconditions
  if (order.lines.length === 0) throw new ValidationError('Order must have at least one line');
  if (!order.defaultShippingAddressId && !order.billingAddressId) {
    throw new ValidationError('Order must have at least one address set');
  }
  if (!order.paymentTermsTemplateId) {
    throw new ValidationError('Payment terms must be set before confirmation');
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status: 'confirmed', confirmedBy: actorId, confirmedAt: new Date() },
  });

  await prisma.orderStatusHistory.create({
    data: {
      orderId,
      fromStatus: 'draft',
      toStatus: 'confirmed',
      changedBy: actorId,
      timeInPreviousStatusHours: computeTimeInPreviousStatus(order.updatedAt),
      notes: 'Order confirmed',
    },
  });

  return { order: updated };
}

export interface TransitionInput {
  toStatus: string;
  notes?: string;
}

export async function transitionOrderStatus(orderId: string, input: TransitionInput, actorId: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, isDeleted: false } });
  if (!order) throw new NotFoundError('Order not found');

  const allowed = PHASE1_TRANSITIONS[order.status];
  if (allowed && !allowed.includes(input.toStatus)) {
    throw new ConflictError(`Transition from '${order.status}' to '${input.toStatus}' is not allowed`);
  }
  if (!allowed && !isTransitionAllowed(order.status, input.toStatus)) {
    throw new ConflictError(`Transition from '${order.status}' to '${input.toStatus}' is not allowed`);
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status: input.toStatus },
  });

  await prisma.orderStatusHistory.create({
    data: {
      orderId,
      fromStatus: order.status,
      toStatus: input.toStatus,
      changedBy: actorId,
      timeInPreviousStatusHours: computeTimeInPreviousStatus(order.updatedAt),
      notes: input.notes,
    },
  });

  return { order: updated };
}

export interface CancelInput {
  cancellationReason: string;
}

export async function cancelOrder(orderId: string, input: CancelInput, actorId: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, isDeleted: false } });
  if (!order) throw new NotFoundError('Order not found');

  const cancellable = ['draft', 'confirmed'];
  if (!cancellable.includes(order.status)) {
    throw new ConflictError(`Cannot cancel order in '${order.status}' status`);
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status: 'cancelled' },
  });

  await prisma.orderStatusHistory.create({
    data: {
      orderId,
      fromStatus: order.status,
      toStatus: 'cancelled',
      changedBy: actorId,
      timeInPreviousStatusHours: computeTimeInPreviousStatus(order.updatedAt),
      notes: `Cancelled: ${input.cancellationReason}`,
    },
  });

  return { order: updated };
}
