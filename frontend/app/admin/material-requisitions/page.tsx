'use client';
import * as React from 'react';
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
import { Plus } from 'lucide-react';

interface MaterialRequisition {
  id: string;
  mrNumber: string;
  mrType: string;
  status: string;
  createdAt: string;
  productionJob: string | null;
}

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  submitted: 'outline',
  approved: 'default',
  partially_issued: 'outline',
  fully_issued: 'default',
  cancelled: 'destructive',
};

const MR_STATUSES = ['draft', 'submitted', 'approved', 'partially_issued', 'fully_issued', 'cancelled'];
const MR_TYPES = ['production', 'maintenance', 'general', 'project'];

const columns: ColumnDef<MaterialRequisition>[] = [
  { accessorKey: 'mrNumber', header: 'MR #' },
  {
    accessorKey: 'mrType',
    header: 'Type',
    cell: ({ row }) => <Badge variant="outline">{row.original.mrType}</Badge>,
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
    accessorKey: 'createdAt',
    header: 'Date',
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
  },
  {
    accessorKey: 'productionJob',
    header: 'Production Job',
    cell: ({ row }) => row.original.productionJob ?? '-',
  },
];

export default function MaterialRequisitionsPage() {
  const [mrs, setMRs] = React.useState<MaterialRequisition[] | null>(null);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [showCreate, setShowCreate] = React.useState(false);
  const [form, setForm] = React.useState({ mrType: 'production', notes: '' });
  const [saving, setSaving] = React.useState(false);

  const fetchMRs = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('mr_type', typeFilter);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const res = await apiFetch<{ materialRequisitions: MaterialRequisition[]; total: number }>(`/api/material-requisitions?${params}`);
      setMRs(res.materialRequisitions);
    } catch {
      setMRs([]);
    }
  }, [search, statusFilter, typeFilter, dateFrom, dateTo]);

  React.useEffect(() => { fetchMRs(); }, [fetchMRs]);

  async function handleCreate() {
    setSaving(true);
    try {
      const res = await apiFetch<{ materialRequisition: MaterialRequisition }>('/api/material-requisitions', {
        method: 'POST',
        body: { mr_type: form.mrType, notes: form.notes || null },
      });
      toast.success(`MR ${res.materialRequisition.mrNumber} created`);
      setShowCreate(false);
      setForm({ mrType: 'production', notes: '' });
      fetchMRs();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to create MR');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Material Requisitions"
        description={mrs ? `${mrs.length} MRs` : 'Loading...'}
        actions={<Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" />Create MR</Button>}
      />

      <Card>
        <CardContent className="pt-4 flex flex-wrap gap-3">
          <Input placeholder="Search MR#..." className="w-48" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {MR_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {MR_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" className="w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" className="w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </CardContent>
      </Card>

      <DataTable columns={columns} data={mrs ?? []} loading={mrs === null} pageSize={20} />

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Material Requisition</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>MR Type *</Label>
              <Select value={form.mrType} onValueChange={(v) => setForm((f) => ({ ...f, mrType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MR_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional" /></div>
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
