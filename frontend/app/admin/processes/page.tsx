'use client';
import * as React from 'react';
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
import { Plus, Upload } from 'lucide-react';

interface Process {
  id: string;
  processCode: string;
  processName: string;
  processCategory: string;
  standardTimeMinutes: string | null;
  timeUnit: string;
  laborCostPerHour: string | null;
  machineCostPerHour: string | null;
  isOutsourced: boolean;
  isActive: boolean;
}

const CATEGORIES = ['cutting', 'edge_banding', 'drilling', 'lamination', 'sanding', 'assembly', 'finishing', 'outsource'];

const columns: ColumnDef<Process>[] = [
  { accessorKey: 'processCode', header: 'Code' },
  { accessorKey: 'processName', header: 'Name' },
  {
    accessorKey: 'processCategory',
    header: 'Category',
    cell: ({ row }) => <Badge variant="outline">{row.original.processCategory}</Badge>,
  },
  {
    id: 'time',
    header: 'Std Time',
    cell: ({ row }) => row.original.standardTimeMinutes ? `${Number(row.original.standardTimeMinutes)} min/${row.original.timeUnit}` : '-',
  },
  {
    id: 'laborCost',
    header: 'Labor ₹/hr',
    cell: ({ row }) => row.original.laborCostPerHour ? `₹${Number(row.original.laborCostPerHour)}` : '-',
  },
  {
    id: 'machineCost',
    header: 'Machine ₹/hr',
    cell: ({ row }) => row.original.machineCostPerHour ? `₹${Number(row.original.machineCostPerHour)}` : '-',
  },
  {
    accessorKey: 'isOutsourced',
    header: 'Outsourced',
    cell: ({ row }) => row.original.isOutsourced ? <Badge>Yes</Badge> : '-',
  },
  {
    accessorKey: 'isActive',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={row.original.isActive ? 'default' : 'destructive'}>
        {row.original.isActive ? 'active' : 'inactive'}
      </Badge>
    ),
  },
];

export default function ProcessesPage() {
  const [processes, setProcesses] = React.useState<Process[] | null>(null);
  const [search, setSearch] = React.useState('');
  const [catFilter, setCatFilter] = React.useState('all');
  const [showCreate, setShowCreate] = React.useState(false);
  const [form, setForm] = React.useState({
    processCode: '', processName: '', processCategory: '', standardTimeMinutes: '',
    timeUnit: 'per_panel', laborCostPerHour: '', machineCostPerHour: '', isOutsourced: false,
  });
  const [saving, setSaving] = React.useState(false);

  const fetchProcesses = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (catFilter !== 'all') params.set('category', catFilter);
      const res = await apiFetch<{ processes: Process[]; total: number }>(`/api/processes?${params}`);
      setProcesses(res.processes);
    } catch {
      setProcesses([]);
    }
  }, [search, catFilter]);

  React.useEffect(() => { fetchProcesses(); }, [fetchProcesses]);

  async function handleCreate() {
    setSaving(true);
    try {
      await apiFetch('/api/processes', {
        method: 'POST',
        body: {
          process_code: form.processCode,
          process_name: form.processName,
          process_category: form.processCategory,
          standard_time_minutes: form.standardTimeMinutes ? Number(form.standardTimeMinutes) : null,
          time_unit: form.timeUnit,
          labor_cost_per_hour: form.laborCostPerHour ? Number(form.laborCostPerHour) : null,
          machine_cost_per_hour: form.machineCostPerHour ? Number(form.machineCostPerHour) : null,
          is_outsourced: form.isOutsourced,
        },
      });
      toast.success('Process created');
      setShowCreate(false);
      setForm({ processCode: '', processName: '', processCategory: '', standardTimeMinutes: '', timeUnit: 'per_panel', laborCostPerHour: '', machineCostPerHour: '', isOutsourced: false });
      fetchProcesses();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to create process');
    } finally {
      setSaving(false);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await apiFetch<{ created: number; skipped: number; errors: unknown[] }>('/api/processes/import', { formData: fd });
      toast.success(`Imported: ${res.created} created, ${res.skipped} skipped, ${res.errors.length} errors`);
      fetchProcesses();
    } catch (err: any) {
      toast.error(err.message ?? 'Import failed');
    }
    e.target.value = '';
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Processes"
        description={processes ? `${processes.length} processes` : 'Loading...'}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" asChild>
              <label className="cursor-pointer">
                <Upload className="h-4 w-4 mr-1" />Import CSV
                <input type="file" accept=".csv" className="hidden" onChange={handleImport} />
              </label>
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" />Add Process</Button>
          </div>
        }
      />

      <Card>
        <CardContent className="pt-4 flex flex-wrap gap-3">
          <Input placeholder="Search code, name..." className="w-64" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.replace('_', ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <DataTable columns={columns} data={processes ?? []} loading={processes === null} pageSize={20} />

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Process</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Code *</Label><Input value={form.processCode} onChange={(e) => setForm((f) => ({ ...f, processCode: e.target.value }))} placeholder="e.g. CNC-6S" /></div>
              <div><Label>Name *</Label><Input value={form.processName} onChange={(e) => setForm((f) => ({ ...f, processName: e.target.value }))} /></div>
            </div>
            <div>
              <Label>Category *</Label>
              <Select value={form.processCategory} onValueChange={(v) => setForm((f) => ({ ...f, processCategory: v }))}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Std Time (min)</Label><Input type="number" value={form.standardTimeMinutes} onChange={(e) => setForm((f) => ({ ...f, standardTimeMinutes: e.target.value }))} /></div>
              <div><Label>Time Unit</Label><Input value={form.timeUnit} onChange={(e) => setForm((f) => ({ ...f, timeUnit: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Labor ₹/hr</Label><Input type="number" value={form.laborCostPerHour} onChange={(e) => setForm((f) => ({ ...f, laborCostPerHour: e.target.value }))} /></div>
              <div><Label>Machine ₹/hr</Label><Input type="number" value={form.machineCostPerHour} onChange={(e) => setForm((f) => ({ ...f, machineCostPerHour: e.target.value }))} /></div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="outsourced" checked={form.isOutsourced} onChange={(e) => setForm((f) => ({ ...f, isOutsourced: e.target.checked }))} />
              <Label htmlFor="outsourced">Outsourced process</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !form.processCode || !form.processName || !form.processCategory}>
              {saving ? 'Saving...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
