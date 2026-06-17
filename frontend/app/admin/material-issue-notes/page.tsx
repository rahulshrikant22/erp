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

interface MaterialIssueNote {
  id: string;
  minNumber: string;
  mrNumber: string | null;
  fromLocation: string;
  status: string;
  createdAt: string;
}

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  issued: 'default',
  partially_issued: 'outline',
  cancelled: 'destructive',
};

const MIN_STATUSES = ['draft', 'issued', 'partially_issued', 'cancelled'];

const columns: ColumnDef<MaterialIssueNote>[] = [
  { accessorKey: 'minNumber', header: 'MIN #' },
  { accessorKey: 'mrNumber', header: 'MR #', cell: ({ row }) => row.original.mrNumber ?? '-' },
  { accessorKey: 'fromLocation', header: 'Location' },
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
];

export default function MaterialIssueNotesPage() {
  const [mins, setMINs] = React.useState<MaterialIssueNote[] | null>(null);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [locationFilter, setLocationFilter] = React.useState('');

  const fetchMINs = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (locationFilter) params.set('location_search', locationFilter);
      const res = await apiFetch<{ materialIssueNotes: MaterialIssueNote[]; total: number }>(`/api/material-issue-notes?${params}`);
      setMINs(res.materialIssueNotes);
    } catch {
      setMINs([]);
    }
  }, [search, statusFilter, locationFilter]);

  React.useEffect(() => { fetchMINs(); }, [fetchMINs]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Material Issue Notes"
        description={mins ? `${mins.length} MINs` : 'Loading...'}
      />

      <Card>
        <CardContent className="pt-4 flex flex-wrap gap-3">
          <Input placeholder="Search MIN#, MR#..." className="w-48" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {MIN_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Location..." className="w-40" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} />
        </CardContent>
      </Card>

      <DataTable columns={columns} data={mins ?? []} loading={mins === null} pageSize={20} />
    </div>
  );
}
