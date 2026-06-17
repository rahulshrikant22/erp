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
import { Plus, Zap } from 'lucide-react';

interface PurchaseRequisition {
  id: string;
  prNumber: string;
  prType: string;
  source: string;
  status: string;
  totalValue: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  pending_approval: 'outline',
  approved: 'default',
  rejected: 'destructive',
  converted: 'default',
  cancelled: 'destructive',
};

const PR_STATUSES = ['draft', 'pending_approval', 'approved', 'rejected', 'converted', 'cancelled'];
const PR_TYPES = ['standard', 'urgent', 'blanket'];

const columns: ColumnDef<PurchaseRequisition>[] = [
  { accessorKey: 'prNumber', header: 'PR #' },
  {
    accessorKey: 'prType',
    header: 'Type',
    cell: ({ row }) => <Badge variant="outline">{row.original.prType}</Badge>,
  },
  { accessorKey: 'source', header: 'Source' },
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
    header: 'Total Value',
    cell: ({ row }) => row.original.totalValue ? `₹${Number(row.original.totalValue).toLocaleString('en-IN')}` : '-',
  },
  {
    accessorKey: 'createdAt',
    header: 'Date',
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
  },
];

export default function PurchaseRequisitionsPage() {
  const router = useRouter();
  const [prs, setPRs] = React.useState<PurchaseRequisition[] | null>(null);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [showCreate, setShowCreate] = React.useState(false);
  const [form, setForm] = React.useState({ prType: 'standard', notes: '' });
  const [saving, setSaving] = React.useState(false);
  const [running, setRunning] = React.useState(false);

  const fetchPRs = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('pr_type', typeFilter);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const res = await apiFetch<{ purchaseRequisitions: PurchaseRequisition[]; total: number }>(`/api/purchase-requisitions?${params}`);
      setPRs(res.purchaseRequisitions);
    } catch {
      setPRs([]);
    }
  }, [search, statusFilter, typeFilter, dateFrom, dateTo]);

  React.useEffect(() => { fetchPRs(); }, [fetchPRs]);

  async function handleCreate() {
    setSaving(true);
    try {
      const res = await apiFetch<{ purchaseRequisition: PurchaseRequisition }>('/api/purchase-requisitions', {
        method: 'POST',
        body: { pr_type: form.prType, notes: form.notes || null },
      });
      toast.success(`PR ${res.purchaseRequisition.prNumber} created`);
      setShowCreate(false);
      setForm({ prType: 'standard', notes: '' });
      fetchPRs();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to create PR');
    } finally {
      setSaving(false);
    }
  }

  async function handleAutoGenerate() {
    setRunning(true);
    try {
      const res = await apiFetch<{ created: number }>('/api/purchase-requisitions/auto-generate', { method: 'POST' });
      toast.success(`Auto-generation complete: ${res.created} PRs created`);
      fetchPRs();
    } catch (e: any) {
      toast.error(e.message ?? 'Auto-generation failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Purchase Requisitions"
        description={prs ? `${prs.length} PRs` : 'Loading...'}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleAutoGenerate} disabled={running}>
              <Zap className="h-4 w-4 mr-1" />{running ? 'Running...' : 'Run Auto-Generation'}
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" />Create PR
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="pt-4 flex flex-wrap gap-3">
          <Input placeholder="Search PR#..." className="w-48" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {PR_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {PR_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" className="w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="From" />
          <Input type="date" className="w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="To" />
        </CardContent>
      </Card>

      <DataTable columns={columns} data={prs ?? []} loading={prs === null} pageSize={20} />

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Purchase Requisition</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>PR Type *</Label>
              <Select value={form.prType} onValueChange={(v) => setForm((f) => ({ ...f, prType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PR_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" /></div>
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
