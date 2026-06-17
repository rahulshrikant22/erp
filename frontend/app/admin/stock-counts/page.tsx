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

interface StockCount {
  id: string;
  countNumber: string;
  countType: string;
  location: string;
  status: string;
  scheduledDate: string;
  completedDate: string | null;
}

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  planned: 'secondary',
  in_progress: 'outline',
  completed: 'default',
  cancelled: 'destructive',
};

const COUNT_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'];
const COUNT_TYPES = ['full', 'cycle', 'spot'];

const columns: ColumnDef<StockCount>[] = [
  { accessorKey: 'countNumber', header: 'Count #' },
  {
    accessorKey: 'countType',
    header: 'Type',
    cell: ({ row }) => <Badge variant="outline">{row.original.countType}</Badge>,
  },
  { accessorKey: 'location', header: 'Location' },
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
    accessorKey: 'scheduledDate',
    header: 'Scheduled',
    cell: ({ row }) => new Date(row.original.scheduledDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
  },
  {
    accessorKey: 'completedDate',
    header: 'Completed',
    cell: ({ row }) => row.original.completedDate ? new Date(row.original.completedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-',
  },
];

export default function StockCountsPage() {
  const [counts, setCounts] = React.useState<StockCount[] | null>(null);
  const [showCreate, setShowCreate] = React.useState(false);
  const [form, setForm] = React.useState({ countType: 'cycle', location: '', scheduledDate: '' });
  const [saving, setSaving] = React.useState(false);

  const fetchCounts = React.useCallback(async () => {
    try {
      const res = await apiFetch<{ stockCounts: StockCount[]; total: number }>('/api/stock-counts');
      setCounts(res.stockCounts);
    } catch {
      setCounts([]);
    }
  }, []);

  React.useEffect(() => { fetchCounts(); }, [fetchCounts]);

  async function handleCreate() {
    setSaving(true);
    try {
      const res = await apiFetch<{ stockCount: StockCount }>('/api/stock-counts', {
        method: 'POST',
        body: {
          count_type: form.countType,
          location: form.location,
          scheduled_date: form.scheduledDate,
        },
      });
      toast.success(`Stock count ${res.stockCount.countNumber} created`);
      setShowCreate(false);
      setForm({ countType: 'cycle', location: '', scheduledDate: '' });
      fetchCounts();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to create stock count');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock Counts"
        description={counts ? `${counts.length} count sessions` : 'Loading...'}
        actions={<Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" />New Count</Button>}
      />

      <DataTable columns={columns} data={counts ?? []} loading={counts === null} pageSize={20} />

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Stock Count Session</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Count Type *</Label>
              <Select value={form.countType} onValueChange={(v) => setForm((f) => ({ ...f, countType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COUNT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Location *</Label><Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} /></div>
            <div><Label>Scheduled Date *</Label><Input type="date" value={form.scheduledDate} onChange={(e) => setForm((f) => ({ ...f, scheduledDate: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !form.location || !form.scheduledDate}>{saving ? 'Creating...' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
