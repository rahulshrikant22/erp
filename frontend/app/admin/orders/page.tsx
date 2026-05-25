'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';

interface Order {
  id: string;
  orderNumber: string;
  customer: { customerName: string; customerCode: string };
  status: string;
  orderDate: string;
  orderType: string;
  subtotalAmount: number;
  grandTotal: number;
  _count?: { lines: number };
}

const STATUSES = ['all', 'draft', 'confirmed', 'in_production', 'ready_for_dispatch', 'dispatched', 'delivered', 'installed', 'completed', 'cancelled'] as const;

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

const columns: ColumnDef<Order>[] = [
  { accessorKey: 'orderNumber', header: 'Order #' },
  {
    id: 'customer',
    header: 'Customer',
    cell: ({ row }) => row.original.customer?.customerName ?? '-',
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={statusColor[row.original.status] ?? 'outline'}>
        {row.original.status.replace(/_/g, ' ')}
      </Badge>
    ),
  },
  { accessorKey: 'orderType', header: 'Type', cell: ({ row }) => <Badge variant="outline">{row.original.orderType}</Badge> },
  {
    accessorKey: 'orderDate',
    header: 'Date',
    cell: ({ row }) => new Date(row.original.orderDate).toLocaleDateString('en-IN'),
  },
  {
    accessorKey: 'grandTotal',
    header: 'Total',
    cell: ({ row }) => `₹${Number(row.original.grandTotal).toLocaleString('en-IN')}`,
  },
];

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = React.useState<Order[] | null>(null);
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [showCreate, setShowCreate] = React.useState(false);
  const [customers, setCustomers] = React.useState<{ id: string; customerName: string; customerCode: string }[]>([]);
  const [form, setForm] = React.useState({ customerId: '', orderType: 'regular', notes: '' });
  const [saving, setSaving] = React.useState(false);

  const fetchOrders = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      params.set('limit', '100');
      const res = await apiFetch<{ orders: Order[]; total: number }>(`/api/orders?${params}`);
      setOrders(res.orders);
    } catch {
      setOrders([]);
    }
  }, [statusFilter]);

  React.useEffect(() => { fetchOrders(); }, [fetchOrders]);

  async function openCreateDialog() {
    setShowCreate(true);
    try {
      const res = await apiFetch<{ customers: { id: string; customerName: string; customerCode: string }[] }>('/api/customers?limit=200');
      setCustomers(res.customers);
    } catch { /* ignore */ }
  }

  async function handleCreate() {
    setSaving(true);
    try {
      const res = await apiFetch<{ order: Order }>('/api/orders', {
        method: 'POST',
        body: {
          customerId: form.customerId,
          orderType: form.orderType,
          notes: form.notes || undefined,
        },
      });
      toast.success('Order created');
      setShowCreate(false);
      setForm({ customerId: '', orderType: 'regular', notes: '' });
      router.push(`/admin/orders/${res.order.id}`);
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to create order');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Orders"
        description={orders ? `${orders.length} orders` : 'Loading...'}
        actions={<Button size="sm" onClick={openCreateDialog}><Plus className="h-4 w-4 mr-1" />New Order</Button>}
      />

      <Card>
        <CardContent className="pt-4 flex flex-wrap gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map(s => (
                <SelectItem key={s} value={s}>{s === 'all' ? 'All Statuses' : s.replace(/_/g, ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <DataTable columns={columns} data={orders ?? []} loading={orders === null} pageSize={20} onRowClick={(row) => router.push(`/admin/orders/${row.id}`)} />

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Order</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Customer *</Label>
              <Select value={form.customerId} onValueChange={v => setForm(f => ({ ...f, customerId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.customerName} ({c.customerCode})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Type</Label>
              <Select value={form.orderType} onValueChange={v => setForm(f => ({ ...f, orderType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">Regular</SelectItem>
                  <SelectItem value="sample">Sample</SelectItem>
                  <SelectItem value="replacement">Replacement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !form.customerId}>
              {saving ? 'Creating...' : 'Create Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
