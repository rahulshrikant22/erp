'use client';
import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable } from '@/components/common/data-table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { type ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, CheckCircle, XCircle, Plus, FileText, CreditCard } from 'lucide-react';

interface OrderLine {
  id: string;
  lineNumber: number;
  lineType: string;
  product?: { productName: string; productCode: string } | null;
  description: string | null;
  quantity: number;
  unitPrice: number;
  discountType: string;
  discountValue: number;
  lineTotal: number;
  taxAmount: number;
  taxRatePercent: number;
  priceSource: string | null;
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  orderDate: string;
  orderType: string;
  customer: { id: string; customerName: string; customerCode: string; gstin: string | null };
  subtotalAmount: number;
  discountAmount: number;
  taxAmount: number;
  chargesAmount: number;
  roundOffAmount: number;
  grandTotal: number;
  notes: string | null;
  internalNotes: string | null;
  lines: OrderLine[];
  documents: { id: string; documentType: string; documentNumber: string; isCancelled: boolean; createdAt: string }[];
  defaultShippingAddress?: { addressLine1: string; city: string; state: string; pincode: string } | null;
}

interface PaymentMilestone {
  id: string;
  milestoneName: string;
  percentage: number;
  amount: number;
  triggerEvent: string;
  status: string;
  dueDate: string | null;
  paidAmount: number;
}

interface Product {
  id: string;
  productName: string;
  productCode: string;
  basePrice: number;
  taxRatePercent: number;
}

const statusColor: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  confirmed: 'default',
  in_production: 'secondary',
  ready_for_dispatch: 'secondary',
  dispatched: 'secondary',
  delivered: 'secondary',
  installed: 'secondary',
  completed: 'default',
  cancelled: 'destructive',
};

const lineColumns: ColumnDef<OrderLine>[] = [
  { accessorKey: 'lineNumber', header: '#', size: 40 },
  {
    id: 'item',
    header: 'Item',
    cell: ({ row }) => row.original.product?.productName ?? row.original.description ?? '-',
  },
  { accessorKey: 'quantity', header: 'Qty' },
  {
    accessorKey: 'unitPrice',
    header: 'Unit Price',
    cell: ({ row }) => `₹${Number(row.original.unitPrice).toLocaleString('en-IN')}`,
  },
  {
    id: 'discount',
    header: 'Discount',
    cell: ({ row }) => {
      if (row.original.discountType === 'none' || !row.original.discountValue) return '-';
      return row.original.discountType === 'percent'
        ? `${row.original.discountValue}%`
        : `₹${row.original.discountValue}`;
    },
  },
  {
    accessorKey: 'taxAmount',
    header: 'Tax',
    cell: ({ row }) => `₹${Number(row.original.taxAmount).toLocaleString('en-IN')} (${row.original.taxRatePercent}%)`,
  },
  {
    accessorKey: 'lineTotal',
    header: 'Total',
    cell: ({ row }) => `₹${Number(row.original.lineTotal).toLocaleString('en-IN')}`,
  },
  {
    accessorKey: 'priceSource',
    header: 'Source',
    cell: ({ row }) => row.original.priceSource ? <Badge variant="outline" className="text-xs">{row.original.priceSource}</Badge> : null,
  },
];

const scheduleColumns: ColumnDef<PaymentMilestone>[] = [
  { accessorKey: 'milestoneName', header: 'Milestone' },
  { accessorKey: 'percentage', header: '%', cell: ({ row }) => `${row.original.percentage}%` },
  { accessorKey: 'amount', header: 'Amount', cell: ({ row }) => `₹${Number(row.original.amount).toLocaleString('en-IN')}` },
  { accessorKey: 'triggerEvent', header: 'Trigger', cell: ({ row }) => row.original.triggerEvent.replace(/_/g, ' ') },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <Badge variant={row.original.status === 'paid' ? 'default' : 'outline'}>{row.original.status}</Badge>,
  },
  { accessorKey: 'paidAmount', header: 'Paid', cell: ({ row }) => row.original.paidAmount > 0 ? `₹${Number(row.original.paidAmount).toLocaleString('en-IN')}` : '-' },
];

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = React.useState<Order | null>(null);
  const [schedule, setSchedule] = React.useState<PaymentMilestone[] | null>(null);
  const [showAddLine, setShowAddLine] = React.useState(false);
  const [products, setProducts] = React.useState<Product[]>([]);
  const [lineForm, setLineForm] = React.useState({ productId: '', quantity: '1', unitPrice: '' });
  const [showPayment, setShowPayment] = React.useState(false);
  const [payForm, setPayForm] = React.useState({ milestoneId: '', amount: '', paymentMode: 'bank_transfer', reference: '' });
  const [showCancel, setShowCancel] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState('');

  const fetchOrder = React.useCallback(async () => {
    try {
      const res = await apiFetch<{ order: Order }>(`/api/orders/${id}`);
      setOrder(res.order);
    } catch {
      toast.error('Failed to load order');
    }
  }, [id]);

  const fetchSchedule = React.useCallback(async () => {
    try {
      const res = await apiFetch<{ schedule: PaymentMilestone[] }>(`/api/orders/${id}/payment-schedule`);
      setSchedule(res.schedule);
    } catch {
      setSchedule([]);
    }
  }, [id]);

  React.useEffect(() => { fetchOrder(); fetchSchedule(); }, [fetchOrder, fetchSchedule]);

  async function confirmOrder() {
    try {
      await apiFetch(`/api/orders/${id}/confirm`, { method: 'POST' });
      toast.success('Order confirmed');
      fetchOrder();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to confirm');
    }
  }

  async function cancelOrderAction() {
    try {
      await apiFetch(`/api/orders/${id}/cancel`, { method: 'POST', body: { cancellationReason: cancelReason } });
      toast.success('Order cancelled');
      setShowCancel(false);
      fetchOrder();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to cancel');
    }
  }

  async function openAddLine() {
    setShowAddLine(true);
    try {
      const res = await apiFetch<{ products: Product[] }>('/api/products?limit=200');
      setProducts(res.products);
    } catch { /* ignore */ }
  }

  async function addLine() {
    try {
      await apiFetch(`/api/orders/${id}/lines`, {
        method: 'POST',
        body: {
          lineType: 'catalog_product',
          productId: lineForm.productId,
          quantity: Number(lineForm.quantity),
          unitPrice: lineForm.unitPrice ? Number(lineForm.unitPrice) : undefined,
        },
      });
      toast.success('Line added');
      setShowAddLine(false);
      setLineForm({ productId: '', quantity: '1', unitPrice: '' });
      fetchOrder();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to add line');
    }
  }

  async function deleteLine(lineId: string) {
    try {
      await apiFetch(`/api/orders/${id}/lines/${lineId}`, { method: 'DELETE' });
      toast.success('Line removed');
      fetchOrder();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to remove line');
    }
  }

  async function generateSchedule() {
    try {
      await apiFetch(`/api/orders/${id}/payment-schedule/generate`, { method: 'POST' });
      toast.success('Schedule generated');
      fetchSchedule();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to generate schedule');
    }
  }

  async function recordPayment() {
    try {
      await apiFetch(`/api/orders/${id}/payments`, {
        method: 'POST',
        body: {
          milestoneId: payForm.milestoneId,
          amount: Number(payForm.amount),
          paymentMode: payForm.paymentMode,
          reference: payForm.reference || undefined,
        },
      });
      toast.success('Payment recorded');
      setShowPayment(false);
      setPayForm({ milestoneId: '', amount: '', paymentMode: 'bank_transfer', reference: '' });
      fetchSchedule();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to record payment');
    }
  }

  async function generateDocument(docType: 'proforma' | 'sales-order' | 'tax-invoice') {
    try {
      const res = await apiFetch<{ document: { documentNumber: string } }>(`/api/orders/${id}/documents/${docType}`);
      toast.success(`Generated: ${res.document.documentNumber}`);
      fetchOrder();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to generate document');
    }
  }

  if (!order) return <div className="p-8 text-muted-foreground">Loading...</div>;

  const isDraft = order.status === 'draft';
  const isCancelled = order.status === 'cancelled';

  return (
    <div className="space-y-4">
      <PageHeader
        title={order.orderNumber}
        description={`${order.customer.customerName} · ${order.orderType}`}
        actions={
          <div className="flex gap-2 items-center">
            <Button variant="outline" size="sm" onClick={() => router.push('/admin/orders')}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
            {isDraft && (
              <>
                <Button size="sm" variant="default" onClick={confirmOrder}><CheckCircle className="h-4 w-4 mr-1" />Confirm</Button>
                <Button size="sm" variant="destructive" onClick={() => setShowCancel(true)}><XCircle className="h-4 w-4 mr-1" />Cancel</Button>
              </>
            )}
            <Badge variant={statusColor[order.status] ?? 'outline'} className="text-sm">
              {order.status.replace(/_/g, ' ')}
            </Badge>
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="pt-4 text-center">
          <p className="text-xs text-muted-foreground">Subtotal</p>
          <p className="text-lg font-semibold">₹{Number(order.subtotalAmount).toLocaleString('en-IN')}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-xs text-muted-foreground">Discount</p>
          <p className="text-lg font-semibold">₹{Number(order.discountAmount).toLocaleString('en-IN')}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-xs text-muted-foreground">Tax</p>
          <p className="text-lg font-semibold">₹{Number(order.taxAmount).toLocaleString('en-IN')}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-xs text-muted-foreground">Charges</p>
          <p className="text-lg font-semibold">₹{Number(order.chargesAmount).toLocaleString('en-IN')}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-xs text-muted-foreground">Grand Total</p>
          <p className="text-lg font-bold text-primary">₹{Number(order.grandTotal).toLocaleString('en-IN')}</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="lines">
        <TabsList>
          <TabsTrigger value="lines">Lines ({order.lines?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="documents">Documents ({order.documents?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="info">Info</TabsTrigger>
        </TabsList>

        {/* Lines tab */}
        <TabsContent value="lines" className="space-y-3">
          {isDraft && (
            <div className="flex justify-end">
              <Button size="sm" onClick={openAddLine}><Plus className="h-4 w-4 mr-1" />Add Line</Button>
            </div>
          )}
          <DataTable
            columns={[
              ...lineColumns,
              ...(isDraft ? [{
                id: 'actions' as const,
                header: '',
                cell: ({ row }: { row: { original: OrderLine } }) => (
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteLine(row.original.id)}>Remove</Button>
                ),
              }] : []),
            ]}
            data={order.lines ?? []}
            pageSize={50}
          />
        </TabsContent>

        {/* Payments tab */}
        <TabsContent value="payments" className="space-y-3">
          <div className="flex justify-end gap-2">
            {(!schedule || schedule.length === 0) && !isDraft && (
              <Button size="sm" variant="outline" onClick={generateSchedule}><CreditCard className="h-4 w-4 mr-1" />Generate Schedule</Button>
            )}
            {schedule && schedule.length > 0 && (
              <Button size="sm" onClick={() => setShowPayment(true)}><Plus className="h-4 w-4 mr-1" />Record Payment</Button>
            )}
          </div>
          {schedule && schedule.length > 0 ? (
            <DataTable columns={scheduleColumns} data={schedule} pageSize={20} />
          ) : (
            <p className="text-sm text-muted-foreground py-4">No payment schedule generated yet.</p>
          )}
        </TabsContent>

        {/* Documents tab */}
        <TabsContent value="documents" className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => generateDocument('proforma')}><FileText className="h-4 w-4 mr-1" />Proforma</Button>
            {!isDraft && !isCancelled && (
              <>
                <Button size="sm" variant="outline" onClick={() => generateDocument('sales-order')}><FileText className="h-4 w-4 mr-1" />Sales Order</Button>
                <Button size="sm" variant="outline" onClick={() => generateDocument('tax-invoice')}><FileText className="h-4 w-4 mr-1" />Tax Invoice</Button>
              </>
            )}
          </div>
          {order.documents && order.documents.length > 0 ? (
            <div className="border rounded-md divide-y">
              {order.documents.map(doc => (
                <div key={doc.id} className="flex items-center justify-between p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{doc.documentType.replace(/_/g, ' ')}</Badge>
                    <span className="font-mono">{doc.documentNumber}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{new Date(doc.createdAt).toLocaleDateString('en-IN')}</span>
                    {doc.isCancelled && <Badge variant="destructive">Cancelled</Badge>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4">No documents generated yet.</p>
          )}
        </TabsContent>

        {/* Info tab */}
        <TabsContent value="info">
          <Card>
            <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div><span className="text-muted-foreground">Customer:</span> {order.customer.customerName} ({order.customer.customerCode})</div>
              <div><span className="text-muted-foreground">GSTIN:</span> {order.customer.gstin || '-'}</div>
              <div><span className="text-muted-foreground">Order Date:</span> {new Date(order.orderDate).toLocaleDateString('en-IN')}</div>
              <div><span className="text-muted-foreground">Shipping:</span> {order.defaultShippingAddress ? `${order.defaultShippingAddress.addressLine1}, ${order.defaultShippingAddress.city}` : '-'}</div>
              {order.notes && <div className="col-span-full"><span className="text-muted-foreground">Notes:</span> {order.notes}</div>}
              {order.internalNotes && <div className="col-span-full"><span className="text-muted-foreground">Internal Notes:</span> {order.internalNotes}</div>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Line Dialog */}
      <Dialog open={showAddLine} onOpenChange={setShowAddLine}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Order Line</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Product *</Label>
              <Select value={lineForm.productId} onValueChange={v => setLineForm(f => ({ ...f, productId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.productName} ({p.productCode}) — ₹{Number(p.basePrice).toLocaleString('en-IN')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Quantity *</Label><Input type="number" min="1" value={lineForm.quantity} onChange={e => setLineForm(f => ({ ...f, quantity: e.target.value }))} /></div>
              <div><Label>Unit Price (override)</Label><Input type="number" value={lineForm.unitPrice} onChange={e => setLineForm(f => ({ ...f, unitPrice: e.target.value }))} placeholder="Auto-resolve" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddLine(false)}>Cancel</Button>
            <Button onClick={addLine} disabled={!lineForm.productId || !lineForm.quantity}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Milestone *</Label>
              <Select value={payForm.milestoneId} onValueChange={v => setPayForm(f => ({ ...f, milestoneId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select milestone" /></SelectTrigger>
                <SelectContent>
                  {schedule?.filter(m => m.status !== 'paid').map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.milestoneName} — ₹{Number(m.amount).toLocaleString('en-IN')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Amount (₹) *</Label><Input type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} /></div>
            <div><Label>Payment Mode</Label>
              <Select value={payForm.paymentMode} onValueChange={v => setPayForm(f => ({ ...f, paymentMode: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Reference / UTR</Label><Input value={payForm.reference} onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayment(false)}>Cancel</Button>
            <Button onClick={recordPayment} disabled={!payForm.milestoneId || !payForm.amount}>Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Order Dialog */}
      <Dialog open={showCancel} onOpenChange={setShowCancel}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel Order</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Reason *</Label><Input value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Reason for cancellation" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancel(false)}>Back</Button>
            <Button variant="destructive" onClick={cancelOrderAction} disabled={!cancelReason}>Confirm Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
