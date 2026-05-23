'use client';
import * as React from 'react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiFetch, ApiClientError } from '@/lib/api';
import { toast } from '@/components/ui/sonner';
import type { ColumnDef } from '@tanstack/react-table';

interface LogEntry {
  id: string;
  channel: string;
  recipientAddress: string;
  status: string;
  providerCode: string | null;
  notificationType: string | null;
  errorMessage: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, 'success' | 'destructive' | 'secondary' | 'outline'> = {
  sent: 'success',
  delivered: 'success',
  failed: 'destructive',
  pending: 'secondary',
  queued: 'outline',
};

export default function NotificationLogPage(): React.ReactElement {
  const [logs, setLogs] = React.useState<LogEntry[] | null>(null);
  const [total, setTotal] = React.useState(0);
  const [channel, setChannel] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [search, setSearch] = React.useState('');

  const fetchLogs = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (channel) params.set('channel', channel);
      if (status) params.set('status', status);
      if (search) params.set('recipientAddress', search);
      const r = await apiFetch<{ logs: LogEntry[]; total: number }>(
        `/api/admin/notifications/log?${params.toString()}`,
      );
      setLogs(r.logs);
      setTotal(r.total);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Could not load logs');
      setLogs([]);
    }
  }, [channel, status, search]);

  React.useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  const columns: ColumnDef<LogEntry>[] = [
    {
      accessorKey: 'channel',
      header: 'Channel',
      cell: ({ row }) => <Badge variant="outline">{row.original.channel}</Badge>,
    },
    {
      accessorKey: 'recipientAddress',
      header: 'Recipient',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.recipientAddress}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={STATUS_COLORS[row.original.status] ?? 'outline'}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: 'providerCode',
      header: 'Provider',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.providerCode ?? '-'}</span>,
    },
    {
      accessorKey: 'notificationType',
      header: 'Type',
      cell: ({ row }) => <span className="text-xs">{row.original.notificationType ?? '-'}</span>,
    },
    {
      accessorKey: 'createdAt',
      header: 'Sent At',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.original.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      accessorKey: 'errorMessage',
      header: 'Error',
      cell: ({ row }) =>
        row.original.errorMessage
          ? <span className="text-xs text-destructive">{row.original.errorMessage}</span>
          : <span className="text-xs text-muted-foreground">-</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Notification Log"
        description={`${total} total notifications logged.`}
      />

      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Channel" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Channels</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Statuses</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Search by recipient..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56"
            />
          </div>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={logs ?? []}
        loading={logs === null}
        pageSize={20}
        emptyText="No notification logs found."
      />
    </>
  );
}
