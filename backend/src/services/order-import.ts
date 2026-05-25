import { prisma } from '../lib/prisma';
import { ValidationError } from '../errors';
import { getNextNumber } from './numbering';

export interface OrderImportRow {
  order_ref: string;
  customer_code: string;
  order_date?: string;
  order_type?: string;
  shipping_address_line1?: string;
  shipping_city?: string;
  shipping_state?: string;
  shipping_pincode?: string;
  payment_terms_code?: string;
  notes?: string;
}

export interface OrderLineImportRow {
  order_ref: string;
  product_code?: string;
  description?: string;
  quantity: string;
  unit_price?: string;
  discount_percent?: string;
  hsn_code?: string;
  tax_rate_percent?: string;
}

interface ImportResult {
  successCount: number;
  errorCount: number;
  errors: Array<{ row: number; field?: string; message: string }>;
  createdOrderIds: string[];
}

export async function importOrders(
  headers: OrderImportRow[],
  lines: OrderLineImportRow[],
  actorId: string,
): Promise<ImportResult> {
  if (!headers.length) throw new ValidationError('No order headers provided');

  const errors: ImportResult['errors'] = [];
  const createdOrderIds: string[] = [];
  let successCount = 0;
  let errorCount = 0;

  // Group lines by order_ref
  const linesByRef = new Map<string, OrderLineImportRow[]>();
  for (const line of lines) {
    if (!line.order_ref) continue;
    const arr = linesByRef.get(line.order_ref) ?? [];
    arr.push(line);
    linesByRef.set(line.order_ref, arr);
  }

  for (let i = 0; i < headers.length; i++) {
    const row = headers[i];
    const rowNum = i + 2; // 1-indexed + header row

    if (!row.order_ref) {
      errors.push({ row: rowNum, field: 'order_ref', message: 'order_ref is required' });
      errorCount++;
      continue;
    }

    if (!row.customer_code) {
      errors.push({ row: rowNum, field: 'customer_code', message: 'customer_code is required' });
      errorCount++;
      continue;
    }

    // Resolve customer
    const customer = await prisma.customer.findFirst({
      where: { customerCode: row.customer_code, isDeleted: false },
      select: { id: true },
    });
    if (!customer) {
      errors.push({ row: rowNum, field: 'customer_code', message: `Customer '${row.customer_code}' not found` });
      errorCount++;
      continue;
    }

    // Resolve payment terms
    let paymentTermsTemplateId: string | undefined;
    if (row.payment_terms_code) {
      const tpl = await prisma.paymentTermsTemplate.findUnique({
        where: { templateCode: row.payment_terms_code },
        select: { id: true },
      });
      if (!tpl) {
        errors.push({ row: rowNum, field: 'payment_terms_code', message: `Payment terms '${row.payment_terms_code}' not found` });
        errorCount++;
        continue;
      }
      paymentTermsTemplateId = tpl.id;
    }

    // Validate & resolve lines
    const orderLines = linesByRef.get(row.order_ref) ?? [];
    if (orderLines.length === 0) {
      errors.push({ row: rowNum, field: 'lines', message: `No lines found for order_ref '${row.order_ref}'` });
      errorCount++;
      continue;
    }

    const resolvedLines: Array<{
      lineType: string;
      productId?: string;
      description: string;
      quantity: number;
      unitPrice: number;
      discountType: string;
      discountValue: number;
      hsnCode: string | null;
      taxRatePercent: number;
    }> = [];

    let lineError = false;
    for (let j = 0; j < orderLines.length; j++) {
      const ol = orderLines[j];
      const qty = Number(ol.quantity);
      if (!qty || qty <= 0) {
        errors.push({ row: rowNum, field: `line[${j}].quantity`, message: 'Invalid quantity' });
        lineError = true;
        break;
      }

      if (ol.product_code) {
        const product = await prisma.product.findFirst({
          where: { productCode: ol.product_code, isDeleted: false },
          select: { id: true, productName: true, basePrice: true, hsnCode: true, taxRatePercent: true },
        });
        if (!product) {
          errors.push({ row: rowNum, field: `line[${j}].product_code`, message: `Product '${ol.product_code}' not found` });
          lineError = true;
          break;
        }
        const unitPrice = ol.unit_price ? Number(ol.unit_price) : Number(product.basePrice);
        resolvedLines.push({
          lineType: 'catalog_product',
          productId: product.id,
          description: product.productName,
          quantity: qty,
          unitPrice,
          discountType: ol.discount_percent ? 'percent' : 'none',
          discountValue: ol.discount_percent ? Number(ol.discount_percent) : 0,
          hsnCode: product.hsnCode,
          taxRatePercent: Number(product.taxRatePercent),
        });
      } else if (ol.description) {
        const unitPrice = Number(ol.unit_price ?? 0);
        if (unitPrice <= 0) {
          errors.push({ row: rowNum, field: `line[${j}].unit_price`, message: 'unit_price required for custom items' });
          lineError = true;
          break;
        }
        resolvedLines.push({
          lineType: 'custom_item',
          description: ol.description,
          quantity: qty,
          unitPrice,
          discountType: ol.discount_percent ? 'percent' : 'none',
          discountValue: ol.discount_percent ? Number(ol.discount_percent) : 0,
          hsnCode: ol.hsn_code ?? null,
          taxRatePercent: ol.tax_rate_percent ? Number(ol.tax_rate_percent) : 0,
        });
      } else {
        errors.push({ row: rowNum, field: `line[${j}]`, message: 'Either product_code or description is required' });
        lineError = true;
        break;
      }
    }

    if (lineError) { errorCount++; continue; }

    // Create order
    try {
      const { number: orderNumber } = await getNextNumber('ORD');
      const order = await prisma.order.create({
        data: {
          orderNumber,
          customerId: customer.id,
          orderDate: row.order_date ? new Date(row.order_date) : new Date(),
          orderType: row.order_type ?? 'regular',
          source: 'csv_import',
          paymentTermsTemplateId,
          notes: row.notes,
          createdBy: actorId,
          status: 'draft',
          lines: {
            create: resolvedLines.map((rl, idx) => {
              const unitPriceFinal = rl.discountType === 'percent'
                ? rl.unitPrice * (1 - rl.discountValue / 100)
                : rl.unitPrice - rl.discountValue;
              const lineSubtotal = rl.quantity * unitPriceFinal;
              const taxAmount = lineSubtotal * rl.taxRatePercent / 100;

              return {
                lineSequence: idx + 1,
                lineType: rl.lineType,
                productId: rl.productId,
                description: rl.description,
                quantity: rl.quantity,
                uom: 'PCS',
                unitPriceBeforeDiscount: rl.unitPrice,
                discountType: rl.discountType,
                discountValue: rl.discountValue,
                unitPriceFinal,
                lineSubtotal,
                hsnCode: rl.hsnCode,
                taxRatePercent: rl.taxRatePercent,
                cgstAmount: taxAmount / 2,
                sgstAmount: taxAmount / 2,
                igstAmount: 0,
                lineTaxTotal: taxAmount,
                lineGrandTotal: lineSubtotal + taxAmount,
                priceSource: 'csv_import',
              };
            }),
          },
        },
      });

      createdOrderIds.push(order.id);
      successCount++;
    } catch (err: any) {
      errors.push({ row: rowNum, message: err.message ?? 'Unexpected error' });
      errorCount++;
    }
  }

  return { successCount, errorCount, errors, createdOrderIds };
}

// -- Import Templates ---------------------------------------------------------

export function getOrderImportTemplate(): string {
  return [
    'order_ref,customer_code,order_date,order_type,payment_terms_code,notes',
    'ORD-001,CUST001,2026-06-01,regular,STD_50_40_10,Sample order',
  ].join('\n');
}

export function getOrderLinesImportTemplate(): string {
  return [
    'order_ref,product_code,description,quantity,unit_price,discount_percent,hsn_code,tax_rate_percent',
    'ORD-001,PROD001,,2,25000,,,',
    'ORD-001,,Custom partition,4,12000,,94036090,18',
  ].join('\n');
}
