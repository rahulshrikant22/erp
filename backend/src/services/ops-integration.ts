import crypto from 'node:crypto';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';

async function getOrderWithLines(orderId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, isDeleted: false },
    include: {
      customer: { select: { customerName: true, gstin: true } },
      lines: {
        orderBy: { lineSequence: 'asc' },
        include: { product: { select: { productName: true } } },
      },
      documents: {
        where: { documentType: 'proforma', isCancelled: false },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
}

function signPayload(body: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

export async function sendProformaToOps(orderId: string): Promise<{ sent: boolean; status?: number; response?: string; reason?: string }> {
  if (!env.OPS_WEBHOOK_URL || !env.OPS_WEBHOOK_SECRET) {
    return { sent: false, reason: 'ops_webhook_not_configured' };
  }

  const order = await getOrderWithLines(orderId);
  if (!order) return { sent: false, reason: 'order_not_found' };
  if (order.lines.length === 0) return { sent: false, reason: 'no_line_items' };

  const piDoc = order.documents[0];

  const payload = {
    event: 'proforma_confirmed',
    erp_order_id: order.id,
    order_number: order.orderNumber,
    pi_number: piDoc?.documentNumber ?? null,
    crm_order_id: null as string | null,
    customer_name: order.customer.customerName,
    customer_gstin: order.customer.gstin,
    is_interstate: order.isInterstate,
    items: order.lines.map((line, i) => ({
      erp_line_id: line.id,
      sno: line.lineSequence,
      description: line.description ?? line.product?.productName ?? `Item ${i + 1}`,
      hsn_code: line.hsnCode,
      quantity: Number(line.quantity),
      uom: line.uom,
      unit_rate: Number(line.unitPriceFinal),
      discount: Number(line.unitPriceBeforeDiscount) - Number(line.unitPriceFinal),
      taxable_value: Number(line.lineSubtotal),
      tax_rate_percent: Number(line.taxRatePercent),
      cgst_amount: Number(line.cgstAmount),
      sgst_amount: Number(line.sgstAmount),
      igst_amount: Number(line.igstAmount),
      total_amount: Number(line.lineGrandTotal),
      notes: line.notes,
    })),
    subtotal: Number(order.subtotal),
    total_tax: Number(order.totalTax),
    grand_total: Number(order.grandTotal),
  };

  const body = JSON.stringify(payload);
  const signature = signPayload(body, env.OPS_WEBHOOK_SECRET);
  const timestamp = new Date().toISOString();

  try {
    const res = await fetch(`${env.OPS_WEBHOOK_URL}/webhooks/erp/proforma-items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': signature,
        'X-Webhook-Timestamp': timestamp,
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });

    const text = await res.text();
    return { sent: res.ok, status: res.status, response: text };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { sent: false, reason: message };
  }
}
