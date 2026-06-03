'use client';
import * as React from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';

interface CostingRun {
  id: string;
  costingRunNumber: string;
  runType: string;
  materialCostTotal: string;
  laborCostTotal: string;
  overheadCostTotal: string;
  outsourcingCostTotal: string;
  manufacturingCost: string;
  landingCost: string | null;
  sellingPriceExclTax: string | null;
  mrpInclTax: string | null;
  runAt: string;
  bomVersion: {
    id: string;
    versionNumber: number;
    bom: { id: string; bomCode: string; bomName: string };
  };
}

interface BomOption {
  id: string;
  bomCode: string;
  bomName: string;
  versions: { id: string; versionNumber: number; versionStatus: string }[];
}

const fmt = (v: string | null) => v ? `₹${Number(v).toLocaleString('en-IN')}` : '-';

const columns: ColumnDef<CostingRun>[] = [
  { accessorKey: 'costingRunNumber', header: 'Run #' },
  {
    id: 'bom',
    header: 'BOM',
    cell: ({ row }) => (
      <span>
        <Badge variant="outline" className="mr-1">{row.original.bomVersion.bom.bomCode}</Badge>
        v{row.original.bomVersion.versionNumber}
      </span>
    ),
  },
  {
    accessorKey: 'runType',
    header: 'Type',
    cell: ({ row }) => <Badge variant="outline">{row.original.runType.replace('_', ' ')}</Badge>,
  },
  { id: 'material', header: 'Material', cell: ({ row }) => fmt(row.original.materialCostTotal) },
  { id: 'labor', header: 'Labor', cell: ({ row }) => fmt(row.original.laborCostTotal) },
  { id: 'overhead', header: 'Overhead', cell: ({ row }) => fmt(row.original.overheadCostTotal) },
  { id: 'mfg', header: 'Mfg Cost', cell: ({ row }) => fmt(row.original.manufacturingCost) },
  { id: 'mrp', header: 'MRP', cell: ({ row }) => fmt(row.original.mrpInclTax) },
  {
    id: 'runAt',
    header: 'Date',
    cell: ({ row }) => new Date(row.original.runAt).toLocaleDateString(),
  },
];

export default function CostingPage() {
  const [runs, setRuns] = React.useState<CostingRun[] | null>(null);
  const [boms, setBoms] = React.useState<BomOption[]>([]);
  const [showCreate, setShowCreate] = React.useState(false);
  const [form, setForm] = React.useState({
    bomVersionId: '', runType: 'initial', overheadPercent: '', marginPercent: '', taxRate: '18', quantity: '1',
  });
  const [saving, setSaving] = React.useState(false);

  const fetchRuns = React.useCallback(async () => {
    try {
      const res = await apiFetch<{ runs: CostingRun[] }>('/api/costing/runs');
      setRuns(res.runs);
    } catch {
      setRuns([]);
    }
  }, []);

  const fetchBoms = React.useCallback(async () => {
    try {
      const res = await apiFetch<{ boms: BomOption[] }>('/api/boms?limit=200');
      setBoms(res.boms);
    } catch { /* ignore */ }
  }, []);

  React.useEffect(() => { fetchRuns(); }, [fetchRuns]);
  React.useEffect(() => { fetchBoms(); }, [fetchBoms]);

  async function handleRun() {
    setSaving(true);
    try {
      await apiFetch('/api/costing/runs', {
        method: 'POST',
        body: {
          bom_version_id: form.bomVersionId,
          run_type: form.runType,
          overhead_percent: form.overheadPercent ? Number(form.overheadPercent) : undefined,
          margin_percent: form.marginPercent ? Number(form.marginPercent) : undefined,
          tax_rate: form.taxRate ? Number(form.taxRate) : undefined,
          quantity: form.quantity ? Number(form.quantity) : undefined,
        },
      });
      toast.success('Costing run completed');
      setShowCreate(false);
      fetchRuns();
    } catch (e: any) {
      toast.error(e.message ?? 'Costing run failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Costing"
        description={runs ? `${runs.length} costing runs` : 'Loading...'}
        actions={<Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" />New Run</Button>}
      />

      <DataTable columns={columns} data={runs ?? []} loading={runs === null} pageSize={20} />

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Costing Run</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>BOM Version *</Label>
              <Select value={form.bomVersionId} onValueChange={(v) => setForm((f) => ({ ...f, bomVersionId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select BOM version" /></SelectTrigger>
                <SelectContent>
                  {boms.flatMap((b) =>
                    (b.versions ?? []).map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {b.bomCode} v{v.versionNumber} ({v.versionStatus})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Run Type</Label>
              <Select value={form.runType} onValueChange={(v) => setForm((f) => ({ ...f, runType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="initial">Initial</SelectItem>
                  <SelectItem value="re_cost">Re-cost</SelectItem>
                  <SelectItem value="what_if">What-if</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Overhead %</Label><Input type="number" value={form.overheadPercent} onChange={(e) => setForm((f) => ({ ...f, overheadPercent: e.target.value }))} placeholder="default: 15" /></div>
              <div><Label>Margin %</Label><Input type="number" value={form.marginPercent} onChange={(e) => setForm((f) => ({ ...f, marginPercent: e.target.value }))} placeholder="default: 30" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Tax Rate %</Label><Input type="number" value={form.taxRate} onChange={(e) => setForm((f) => ({ ...f, taxRate: e.target.value }))} /></div>
              <div><Label>Quantity</Label><Input type="number" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleRun} disabled={saving || !form.bomVersionId}>
              {saving ? 'Running...' : 'Run Costing'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
