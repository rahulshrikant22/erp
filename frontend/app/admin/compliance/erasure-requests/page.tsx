'use client';
import * as React from 'react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiFetch, ApiClientError } from '@/lib/api';
import { toast } from '@/components/ui/sonner';
import type { ColumnDef } from '@tanstack/react-table';

interface DataRequest {
  id: string;
  userId: string;
  requestType: string;
  status: string;
  reason: string | null;
  createdAt: string;
  processedAt: string | null;
}

const STATUS_VARIANT: Record<string, 'secondary' | 'success' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  approved: 'success',
  rejected: 'destructive',
  completed: 'success',
};

export default function ErasureRequestsPage(): React.ReactElement {
  const [requests, setRequests] = React.useState<DataRequest[] | null>(null);

  const fetch = React.useCallback(async () => {
    try {
      const r = await apiFetch<{ requests: DataRequest[] }>('/api/dpdp/data-requests');
      setRequests(r.requests);
    } catch {
      setRequests([]);
    }
  }, []);

  React.useEffect(() => { void fetch(); }, [fetch]);

  async function process(id: string, action: 'approve' | 'reject') {
    try {
      await apiFetch(`/api/dpdp/data-requests/${id}/${action}`, { method: 'POST' });
      toast.success(`Request ${action}d`);
      void fetch();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed');
    }
  }

  const columns: ColumnDef<DataRequest>[] = [
    { accessorKey: 'requestType', header: 'Type', cell: ({ row }) => <Badge variant="outline">{row.original.requestType}</Badge> },
    { accessorKey: 'userId', header: 'User ID', cell: ({ row }) => <span className="font-mono text-xs">{row.original.userId.slice(0, 8)}...</span> },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <Badge variant={STATUS_VARIANT[row.original.status] ?? 'outline'}>{row.original.status}</Badge>,
    },
    { accessorKey: 'reason', header: 'Reason', cell: ({ row }) => <span className="text-xs">{row.original.reason ?? '-'}</span> },
    {
      accessorKey: 'createdAt',
      header: 'Submitted',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{new Date(row.original.createdAt).toLocaleDateString()}</span>,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) =>
        row.original.status === 'pending' ? (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => process(row.original.id, 'approve')}>Approve</Button>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => process(row.original.id, 'reject')}>Reject</Button>
          </div>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Data Requests"
        description="Review and process DPDP data export and erasure requests."
      />
      <DataTable columns={columns} data={requests ?? []} loading={requests === null} pageSize={15} emptyText="No pending data requests." />
    </>
  );
}
