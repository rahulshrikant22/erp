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
import { Plus, Star, Ban, CheckCircle } from 'lucide-react';

interface Vendor {
  id: string;
  vendorCode: string;
  vendorName: string;
  vendorType: string;
  gstin: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  rating: number | null;
  status: string;
  activePOCount: number;
}

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  blacklisted: 'destructive',
  inactive: 'secondary',
};

function RatingStars({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-muted-foreground">-</span>;
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i < rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} />
      ))}
    </span>
  );
}

const columns: ColumnDef<Vendor>[] = [
  { accessorKey: 'vendorCode', header: 'Code' },
  { accessorKey: 'vendorName', header: 'Name' },
  {
    accessorKey: 'vendorType',
    header: 'Type',
    cell: ({ row }) => <Badge variant="outline">{row.original.vendorType}</Badge>,
  },
  { accessorKey: 'gstin', header: 'GSTIN', cell: ({ row }) => row.original.gstin ?? '-' },
  { accessorKey: 'primaryEmail', header: 'Email', cell: ({ row }) => row.original.primaryEmail ?? '-' },
  { accessorKey: 'primaryPhone', header: 'Phone', cell: ({ row }) => row.original.primaryPhone ?? '-' },
  {
    id: 'rating',
    header: 'Rating',
    cell: ({ row }) => <RatingStars rating={row.original.rating} />,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={STATUS_COLORS[row.original.status] ?? 'outline'}>{row.original.status}</Badge>
    ),
  },
  {
    accessorKey: 'activePOCount',
    header: 'Active POs',
    cell: ({ row }) => row.original.activePOCount ?? 0,
  },
];

export default function VendorsPage() {
  const router = useRouter();
  const [vendors, setVendors] = React.useState<Vendor[] | null>(null);
  const [search, setSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [showCreate, setShowCreate] = React.useState(false);
  const [form, setForm] = React.useState({
    vendorName: '', vendorType: 'domestic', gstin: '', pan: '', primaryEmail: '', primaryPhone: '',
  });
  const [saving, setSaving] = React.useState(false);

  const fetchVendors = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (typeFilter !== 'all') params.set('vendor_type', typeFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await apiFetch<{ vendors: Vendor[]; total: number }>(`/api/vendors?${params}`);
      setVendors(res.vendors);
    } catch {
      setVendors([]);
    }
  }, [search, typeFilter, statusFilter]);

  React.useEffect(() => { fetchVendors(); }, [fetchVendors]);

  async function handleCreate() {
    setSaving(true);
    try {
      const res = await apiFetch<{ vendor: Vendor }>('/api/vendors', {
        method: 'POST',
        body: {
          vendor_name: form.vendorName,
          vendor_type: form.vendorType,
          gstin: form.gstin || null,
          pan: form.pan || null,
          primary_email: form.primaryEmail || null,
          primary_phone: form.primaryPhone || null,
        },
      });
      toast.success(`Vendor ${res.vendor.vendorCode} created`);
      setShowCreate(false);
      setForm({ vendorName: '', vendorType: 'domestic', gstin: '', pan: '', primaryEmail: '', primaryPhone: '' });
      fetchVendors();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to create vendor');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleBlacklist(vendor: Vendor, e: React.MouseEvent) {
    e.stopPropagation();
    const newStatus = vendor.status === 'blacklisted' ? 'active' : 'blacklisted';
    try {
      await apiFetch(`/api/vendors/${vendor.id}`, {
        method: 'PATCH',
        body: { status: newStatus },
      });
      toast.success(`Vendor ${newStatus === 'blacklisted' ? 'blacklisted' : 'reactivated'}`);
      fetchVendors();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to update vendor');
    }
  }

  const columnsWithActions: ColumnDef<Vendor>[] = [
    ...columns,
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); router.push(`/admin/vendors/${row.original.id}`); }}>
            <CheckCircle className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive"
            onClick={(e) => handleToggleBlacklist(row.original, e)}
            title={row.original.status === 'blacklisted' ? 'Unblacklist' : 'Blacklist'}
          >
            <Ban className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Vendors"
        description={vendors ? `${vendors.length} vendors` : 'Loading...'}
        actions={<Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" />New Vendor</Button>}
      />

      <Card>
        <CardContent className="pt-4 flex flex-wrap gap-3">
          <Input placeholder="Search name, code, GSTIN..." className="w-64" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="domestic">Domestic</SelectItem>
              <SelectItem value="import">Import</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="blacklisted">Blacklisted</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <DataTable columns={columnsWithActions} data={vendors ?? []} loading={vendors === null} pageSize={20} onRowClick={(row) => router.push(`/admin/vendors/${row.id}`)} />

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Vendor</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Vendor Name *</Label>
              <Input value={form.vendorName} onChange={(e) => setForm((f) => ({ ...f, vendorName: e.target.value }))} />
            </div>
            <div>
              <Label>Type *</Label>
              <Select value={form.vendorType} onValueChange={(v) => setForm((f) => ({ ...f, vendorType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="domestic">Domestic</SelectItem>
                  <SelectItem value="import">Import</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>GSTIN</Label><Input value={form.gstin} onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value }))} placeholder="22AAAAA0000A1Z5" /></div>
              <div><Label>PAN</Label><Input value={form.pan} onChange={(e) => setForm((f) => ({ ...f, pan: e.target.value }))} placeholder="AAAAA0000A" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Email</Label><Input type="email" value={form.primaryEmail} onChange={(e) => setForm((f) => ({ ...f, primaryEmail: e.target.value }))} /></div>
              <div><Label>Phone</Label><Input value={form.primaryPhone} onChange={(e) => setForm((f) => ({ ...f, primaryPhone: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !form.vendorName}>
              {saving ? 'Creating...' : 'Create Vendor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
