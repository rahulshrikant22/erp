'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Clock } from 'lucide-react';

interface PurchaseOrder {
  id: string;
  poNumber: string;
  vendor: { id: string; vendorCode: string; vendorName: string };
  poDate: string;
  status: string;
  totalValue: string;
  currency: string;
  expectedDeliveryDate: string | null;
  poType: string;
  ageDays: number;
}

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  pending_approval: 'outline',
  approved: 'default',
  sent_to_vendor: 'default',
  acknowledged: 'default',
  partially_received: 'outline',
  fully_received: 'default',
  cancelled: 'destructive',
  rejected: 'destructive',
};

const PO_STATUSES = ['draft', 'pending_approval', 'approved', 'sent_to_vendor', 'acknowledged', 'partially_received', 'fully_received', 'cancelled', 'rejected'];

const columns: ColumnDef<PurchaseOrder>[] = [
  { accessorKey: 'poNumber', header: 'PO #' },
  {
    id: 'vendor',
    header: 'Vendor',
    cell: ({ row }) => (
      <span>
        <Badge variant="outline" className="mr-1">{row.original.vendor.vendorCode}</Badge>
        {row.original.vendor.vendorName}
      </span>
    ),
  },
  {
    accessorKey: 'poDate',
    header: 'Date',
    cell: ({ row }) => new Date(row.original.poDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={STATUS_COLORS[row.original.status] ?? 'outline'}>
        {row.original.status.replace(/_/g, ' ')}
      </Badge>
    ),
  },
  {
    accessorKey: 'totalValue',
    header: 'Value',
    cell: ({ row }) => `${row.original.currency === 'INR' ? '₹' : row.original.currency + ' '}${Number(row.original.totalValue).toLocaleString('en-IN')}`,
  },
  { accessorKey: 'currency', header: 'Currency' },
  {
    accessorKey: 'expectedDeliveryDate',
    header: 'Expected Delivery',
    cell: ({ row }) => row.original.expectedDeliveryDate ? new Date(row.original.expectedDeliveryDate).toLocaleDateString('en-IN') : '-',
  },
  {
    accessorKey: 'ageDays',
    header: 'Age',
    cell: ({ row }) => (
      <span className="flex items-center gap-1">
        <Clock className="h-3 w-3 text-muted-foreground" />
        {row.original.ageDays}d
      </span>
    ),
  },
];

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const [pos, setPOs] = React.useState<PurchaseOrder[] | null>(null);
  const [pendingApprovals, setPendingApprovals] = React.useState(0);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [vendorFilter, setVendorFilter] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [showCreate, setShowCreate] = React.useState(false);
  const [form, setForm] = React.useState({ vendorId: '', poType: 'domestic', notes: '' });
  const [saving, setSaving] = React.useState(false);

  const fetchPOs = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (vendorFilter) params.set('vendor_search', vendorFilter);
      if (typeFilter !== 'all') params.set('po_type', typeFilter);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const res = await apiFetch<{ purchaseOrders: PurchaseOrder[]; total: number; pendingApprovals: number }>(`/api/purchase-orders?${params}`);
      setPOs(res.purchaseOrders);
      setPendingApprovals(res.pendingApprovals ?? 0);
    } catch {
      setPOs([]);
    }
  }, [search, statusFilter, vendorFilter, typeFilter, dateFrom, dateTo]);

  React.useEffect(() => { fetchPOs(); }, [fetchPOs]);

  async function handleCreate() {
    setSaving(true);
    try {
      const res = await apiFetch<{ purchaseOrder: PurchaseOrder }>('/api/purchase-orders', {
        method: 'POST',
        body: { vendor_id: form.vendorId, po_type: form.poType, notes: form.notes || null },
      });
      toast.success(`PO ${res.purchaseOrder.poNumber} created`);
      setShowCreate(false);
      setForm({ vendorId: '', poType: 'domestic', notes: '' });
      router.push(`/admin/purchase-orders/${res.purchaseOrder.id}`);
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to create PO');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Purchase Orders"
        description={pos ? `${pos.length} POs` : 'Loading...'}
        actions={
          <div className="flex gap-2 items-center">
            {pendingApprovals > 0 && (
              <Badge variant="destructive" className="text-sm px-3 py-1">
                {pendingApprovals} pending approvals
              </Badge>
            )}
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" />Create PO
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="pt-4 flex flex-wrap gap-3">
          <Input placeholder="Search PO#..." className="w-48" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {PO_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Vendor..." className="w-40" value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="domestic">Domestic</SelectItem>
              <SelectItem value="import">Import</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" className="w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" className="w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </CardContent>
      </Card>

      <DataTable columns={columns} data={pos ?? []} loading={pos === null} pageSize={20} onRowClick={(row) => router.push(`/admin/purchase-orders/${row.id}`)} />

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Purchase Order</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Vendor ID *</Label><Input value={form.vendorId} onChange={(e) => setForm((f) => ({ ...f, vendorId: e.target.value }))} placeholder="Vendor UUID" /></div>
            <div>
              <Label>PO Type</Label>
              <Select value={form.poType} onValueChange={(v) => setForm((f) => ({ ...f, poType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="domestic">Domestic</SelectItem>
                  <SelectItem value="import">Import</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !form.vendorId}>{saving ? 'Creating...' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
