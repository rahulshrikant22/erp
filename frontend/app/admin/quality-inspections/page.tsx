'use client';
import * as React from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

interface QualityInspection {
  id: string;
  inspectionNumber: string;
  grnNumber: string;
  materialCode: string;
  materialName: string;
  result: string;
  inspector: string | null;
  inspectedAt: string | null;
  createdAt: string;
  quantity: number;
  defectQty: number;
  notes: string | null;
}

const RESULT_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  passed: 'default',
  failed: 'destructive',
  conditional: 'outline',
};

const RESULTS = ['pending', 'passed', 'failed', 'conditional'];

const columns: ColumnDef<QualityInspection>[] = [
  { accessorKey: 'inspectionNumber', header: 'Inspection #' },
  { accessorKey: 'grnNumber', header: 'GRN #' },
  {
    id: 'material',
    header: 'Material',
    cell: ({ row }) => (
      <span>
        <Badge variant="outline" className="mr-1">{row.original.materialCode}</Badge>
        {row.original.materialName}
      </span>
    ),
  },
  {
    accessorKey: 'quantity',
    header: 'Qty',
    cell: ({ row }) => row.original.quantity,
  },
  {
    accessorKey: 'defectQty',
    header: 'Defects',
    cell: ({ row }) => row.original.defectQty > 0 ? <span className="text-destructive font-medium">{row.original.defectQty}</span> : '0',
  },
  {
    accessorKey: 'result',
    header: 'Result',
    cell: ({ row }) => (
      <Badge variant={RESULT_COLORS[row.original.result] ?? 'outline'}>
        {row.original.result}
      </Badge>
    ),
  },
  { accessorKey: 'inspector', header: 'Inspector', cell: ({ row }) => row.original.inspector ?? '-' },
  {
    accessorKey: 'createdAt',
    header: 'Date',
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
  },
];

export default function QualityInspectionsPage() {
  const [inspections, setInspections] = React.useState<QualityInspection[] | null>(null);
  const [search, setSearch] = React.useState('');
  const [resultFilter, setResultFilter] = React.useState('all');
  const [materialFilter, setMaterialFilter] = React.useState('');
  const [inspectorFilter, setInspectorFilter] = React.useState('');

  const fetchInspections = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (resultFilter !== 'all') params.set('result', resultFilter);
      if (materialFilter) params.set('material_search', materialFilter);
      if (inspectorFilter) params.set('inspector', inspectorFilter);
      const res = await apiFetch<{ qualityInspections: QualityInspection[]; total: number }>(`/api/quality-inspections?${params}`);
      setInspections(res.qualityInspections);
    } catch {
      setInspections([]);
    }
  }, [search, resultFilter, materialFilter, inspectorFilter]);

  React.useEffect(() => { fetchInspections(); }, [fetchInspections]);

  const pendingCount = inspections?.filter((i) => i.result === 'pending').length ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Quality Inspections"
        description={inspections ? `${inspections.length} inspections${pendingCount > 0 ? ` (${pendingCount} pending)` : ''}` : 'Loading...'}
      />

      <Card>
        <CardContent className="pt-4 flex flex-wrap gap-3">
          <Input placeholder="Search inspection#, GRN#..." className="w-56" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={resultFilter} onValueChange={setResultFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Results</SelectItem>
              {RESULTS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Material..." className="w-40" value={materialFilter} onChange={(e) => setMaterialFilter(e.target.value)} />
          <Input placeholder="Inspector..." className="w-40" value={inspectorFilter} onChange={(e) => setInspectorFilter(e.target.value)} />
        </CardContent>
      </Card>

      <DataTable columns={columns} data={inspections ?? []} loading={inspections === null} pageSize={20} />
    </div>
  );
}
