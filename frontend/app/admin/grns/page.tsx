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

interface GRN {
  id: string;
  grnNumber: string;
  vendor: { id: string; vendorCode: string; vendorName: string };
  poNumber: string | null;
  grnDate: string;
  status: string;
  totalQty: number;
  qcStatus: string;
}

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  submitted: 'outline',
  qc_pending: 'outline',
  qc_complete: 'default',
  accepted: 'default',
  rejected: 'destructive',
};

const QC_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  in_progress: 'outline',
  passed: 'default',
  failed: 'destructive',
  partial: 'outline',
  not_required: 'secondary',
};

const GRN_STATUSES = ['draft', 'submitted', 'qc_pending', 'qc_complete', 'accepted', 'rejected'];

const columns: ColumnDef<GRN>[] = [
  { accessorKey: 'grnNumber', header: 'GRN #' },
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
  { accessorKey: 'poNumber', header: 'PO #', cell: ({ row }) => row.original.poNumber ?? '-' },
  {
    accessorKey: 'grnDate',
    header: 'Date',
    cell: ({ row }) => new Date(row.original.grnDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
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
    accessorKey: 'totalQty',
    header: 'Total Qty',
    cell: ({ row }) => row.original.totalQty,
  },
  {
    accessorKey: 'qcStatus',
    header: 'QC Status',
    cell: ({ row }) => (
      <Badge variant={QC_COLORS[row.original.qcStatus] ?? 'outline'}>
        {row.original.qcStatus.replace(/_/g, ' ')}
      </Badge>
    ),
  },
];

export default function GRNsPage() {
  const router = useRouter();
  const [grns, setGRNs] = React.useState<GRN[] | null>(null);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [vendorFilter, setVendorFilter] = React.useState('');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');

  const fetchGRNs = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (vendorFilter) params.set('vendor_search', vendorFilter);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const res = await apiFetch<{ grns: GRN[]; total: number }>(`/api/grns?${params}`);
      setGRNs(res.grns);
    } catch {
      setGRNs([]);
    }
  }, [search, statusFilter, vendorFilter, dateFrom, dateTo]);

  React.useEffect(() => { fetchGRNs(); }, [fetchGRNs]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Goods Receipt Notes"
        description={grns ? `${grns.length} GRNs` : 'Loading...'}
      />

      <Card>
        <CardContent className="pt-4 flex flex-wrap gap-3">
          <Input placeholder="Search GRN#..." className="w-48" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {GRN_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Vendor..." className="w-40" value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} />
          <Input type="date" className="w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" className="w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </CardContent>
      </Card>

      <DataTable columns={columns} data={grns ?? []} loading={grns === null} pageSize={20} onRowClick={(row) => router.push(`/admin/grns/${row.id}`)} />
    </div>
  );
}
