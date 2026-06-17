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
import { Plus, AlertTriangle } from 'lucide-react';

interface ImportShipment {
  id: string;
  shipmentNumber: string;
  vesselName: string | null;
  containerNumber: string | null;
  status: string;
  eta: string | null;
  portOfDischarge: string | null;
  isOverdue: boolean;
}

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  booked: 'secondary',
  in_transit: 'outline',
  at_port: 'outline',
  customs_clearance: 'outline',
  delivered: 'default',
  cancelled: 'destructive',
};

const SHIPMENT_STATUSES = ['booked', 'in_transit', 'at_port', 'customs_clearance', 'delivered', 'cancelled'];

const columns: ColumnDef<ImportShipment>[] = [
  {
    accessorKey: 'shipmentNumber',
    header: 'Shipment #',
    cell: ({ row }) => (
      <span className="flex items-center gap-1">
        {row.original.shipmentNumber}
        {row.original.isOverdue && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
      </span>
    ),
  },
  { accessorKey: 'vesselName', header: 'Vessel', cell: ({ row }) => row.original.vesselName ?? '-' },
  { accessorKey: 'containerNumber', header: 'Container', cell: ({ row }) => row.original.containerNumber ?? '-' },
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
    accessorKey: 'eta',
    header: 'ETA',
    cell: ({ row }) => row.original.eta ? new Date(row.original.eta).toLocaleDateString('en-IN') : '-',
  },
  { accessorKey: 'portOfDischarge', header: 'Port', cell: ({ row }) => row.original.portOfDischarge ?? '-' },
];

export default function ImportShipmentsPage() {
  const router = useRouter();
  const [shipments, setShipments] = React.useState<ImportShipment[] | null>(null);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [showCreate, setShowCreate] = React.useState(false);
  const [form, setForm] = React.useState({ vesselName: '', containerNumber: '', eta: '', portOfDischarge: '' });
  const [saving, setSaving] = React.useState(false);

  const fetchShipments = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const res = await apiFetch<{ importShipments: ImportShipment[]; total: number }>(`/api/import-shipments?${params}`);
      setShipments(res.importShipments);
    } catch {
      setShipments([]);
    }
  }, [search, statusFilter, dateFrom, dateTo]);

  React.useEffect(() => { fetchShipments(); }, [fetchShipments]);

  async function handleCreate() {
    setSaving(true);
    try {
      const res = await apiFetch<{ importShipment: ImportShipment }>('/api/import-shipments', {
        method: 'POST',
        body: {
          vessel_name: form.vesselName || null,
          container_number: form.containerNumber || null,
          eta: form.eta || null,
          port_of_discharge: form.portOfDischarge || null,
        },
      });
      toast.success(`Shipment ${res.importShipment.shipmentNumber} created`);
      setShowCreate(false);
      setForm({ vesselName: '', containerNumber: '', eta: '', portOfDischarge: '' });
      router.push(`/admin/import-shipments/${res.importShipment.id}`);
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to create shipment');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Import Shipments"
        description={shipments ? `${shipments.length} shipments` : 'Loading...'}
        actions={<Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" />New Shipment</Button>}
      />

      <Card>
        <CardContent className="pt-4 flex flex-wrap gap-3">
          <Input placeholder="Search shipment#, vessel..." className="w-56" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {SHIPMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" className="w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" className="w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </CardContent>
      </Card>

      <DataTable columns={columns} data={shipments ?? []} loading={shipments === null} pageSize={20} onRowClick={(row) => router.push(`/admin/import-shipments/${row.id}`)} />

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Import Shipment</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Vessel Name</Label><Input value={form.vesselName} onChange={(e) => setForm((f) => ({ ...f, vesselName: e.target.value }))} /></div>
            <div><Label>Container Number</Label><Input value={form.containerNumber} onChange={(e) => setForm((f) => ({ ...f, containerNumber: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>ETA</Label><Input type="date" value={form.eta} onChange={(e) => setForm((f) => ({ ...f, eta: e.target.value }))} /></div>
              <div><Label>Port of Discharge</Label><Input value={form.portOfDischarge} onChange={(e) => setForm((f) => ({ ...f, portOfDischarge: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? 'Creating...' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
