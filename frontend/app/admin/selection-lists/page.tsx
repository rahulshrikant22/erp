'use client';
import * as React from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SelectionList {
  id: string;
  selectionListCode: string;
  status: string;
  finishGroupName: string | null;
  order: { id: string; orderNumber: string };
  _count: { items: number };
  updatedAt: string;
}

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  submitted: 'outline',
  approved: 'default',
  applied_to_bom: 'default',
};

const columns: ColumnDef<SelectionList>[] = [
  { accessorKey: 'selectionListCode', header: 'Code' },
  {
    id: 'order',
    header: 'Order',
    cell: ({ row }) => <Badge variant="outline">{row.original.order.orderNumber}</Badge>,
  },
  { id: 'finishGroup', header: 'Finish Group', cell: ({ row }) => row.original.finishGroupName ?? '-' },
  { id: 'items', header: 'Items', cell: ({ row }) => row.original._count.items },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={STATUS_COLORS[row.original.status] ?? 'outline'}>
        {row.original.status.replace('_', ' ')}
      </Badge>
    ),
  },
];

export default function SelectionListsPage() {
  const [lists, setLists] = React.useState<SelectionList[] | null>(null);
  const [statusFilter, setStatusFilter] = React.useState('all');

  const fetch = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await apiFetch<{ selectionLists: SelectionList[]; total: number }>(`/api/selection-lists?${params}`);
      setLists(res.selectionLists);
    } catch {
      setLists([]);
    }
  }, [statusFilter]);

  React.useEffect(() => { fetch(); }, [fetch]);

  return (
    <div className="space-y-4">
      <PageHeader title="Selection Lists" description={lists ? `${lists.length} lists` : 'Loading...'} />
      <Card>
        <CardContent className="pt-4 flex flex-wrap gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="applied_to_bom">Applied</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
      <DataTable columns={columns} data={lists ?? []} loading={lists === null} pageSize={20} />
    </div>
  );
}
