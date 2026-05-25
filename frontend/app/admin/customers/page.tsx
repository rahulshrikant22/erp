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

interface Customer {
  id: string;
  customerCode: string;
  customerName: string;
  customerType: string;
  gstin: string | null;
  phone: string | null;
  city: string | null;
  status: string;
}

const TYPES = ['all', 'retail', 'dealer', 'architect', 'interior_designer', 'corporate'] as const;

const columns: ColumnDef<Customer>[] = [
  { accessorKey: 'customerCode', header: 'Code' },
  { accessorKey: 'customerName', header: 'Name' },
  {
    accessorKey: 'customerType',
    header: 'Type',
    cell: ({ row }) => <Badge variant="outline">{row.original.customerType}</Badge>,
  },
  { accessorKey: 'gstin', header: 'GSTIN', cell: ({ row }) => row.original.gstin || '-' },
  { accessorKey: 'phone', header: 'Phone', cell: ({ row }) => row.original.phone || '-' },
  { accessorKey: 'city', header: 'City', cell: ({ row }) => row.original.city || '-' },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={row.original.status === 'active' ? 'default' : 'destructive'}>
        {row.original.status}
      </Badge>
    ),
  },
];

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = React.useState<Customer[] | null>(null);
  const [search, setSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [showCreate, setShowCreate] = React.useState(false);
  const [form, setForm] = React.useState({ customerName: '', customerType: 'retail', gstin: '', phone: '', email: '' });
  const [saving, setSaving] = React.useState(false);

  const fetchCustomers = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      const res = await apiFetch<{ customers: Customer[]; total: number }>(`/api/customers?${params}`);
      setCustomers(res.customers);
    } catch { setCustomers([]); }
  }, [search, typeFilter]);

  React.useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  async function handleCreate() {
    setSaving(true);
    try {
      await apiFetch('/api/customers', { method: 'POST', body: form });
      toast.success('Customer created');
      setShowCreate(false);
      setForm({ customerName: '', customerType: 'retail', gstin: '', phone: '', email: '' });
      fetchCustomers();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to create customer');
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Customers"
        description={customers ? `${customers.length} customers` : 'Loading...'}
        actions={<Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" />Add Customer</Button>}
      />

      <Card>
        <CardContent className="pt-4 flex flex-wrap gap-3">
          <Input placeholder="Search name, code, GSTIN..." className="w-64" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPES.map(t => <SelectItem key={t} value={t}>{t === 'all' ? 'All Types' : t}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <DataTable columns={columns} data={customers ?? []} loading={customers === null} pageSize={20} onRowClick={(row) => router.push(`/admin/customers/${row.id}`)} />

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Customer</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Name *</Label><Input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} /></div>
            <div><Label>Type</Label>
              <Select value={form.customerType} onValueChange={v => setForm(f => ({ ...f, customerType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.filter(t => t !== 'all').map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>GSTIN</Label><Input value={form.gstin} onChange={e => setForm(f => ({ ...f, gstin: e.target.value }))} placeholder="27XXXXX0000X1Z0" /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !form.customerName}>{saving ? 'Saving...' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
