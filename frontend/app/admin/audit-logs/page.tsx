'use client';
import * as React from 'react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { apiFetch } from '@/lib/api';
import type { AuditLogRow } from '@/lib/types';
import type { ColumnDef } from '@tanstack/react-table';
import { Search, Download } from 'lucide-react';

interface FullLogRow extends AuditLogRow {
  beforeData?: unknown;
  afterData?: unknown;
}

export default function AuditLogsPage(): React.ReactElement {
  const [logs, setLogs] = React.useState<AuditLogRow[] | null>(null);
  const [total, setTotal] = React.useState(0);
  const [filters, setFilters] = React.useState({ entityType: '', action: '', search: '' });
  const [detail, setDetail] = React.useState<FullLogRow | null>(null);

  const fetchLogs = React.useCallback(async (): Promise<void> => {
    const qs = new URLSearchParams({ limit: '50' });
    if (filters.entityType) qs.set('entityType', filters.entityType);
    if (filters.action) qs.set('action', filters.action);
    if (filters.search) qs.set('search', filters.search);
    const r = await apiFetch<{ logs: AuditLogRow[]; total: number }>(`/api/audit/logs?${qs}`);
    setLogs(r.logs);
    setTotal(r.total);
  }, [filters]);

  React.useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  function exportCsv() {
    if (!logs || logs.length === 0) return;
    const header = 'Timestamp,Action,Entity Type,Entity ID,Summary,Request ID';
    const rows = logs.map((l) =>
      [
        new Date(l.actionAt).toISOString(),
        l.action,
        l.entityType,
        l.entityId ?? '',
        `"${(l.changesSummary ?? '').replace(/"/g, '""')}"`,
        l.requestId ?? '',
      ].join(','),
    );
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function openDetail(row: AuditLogRow): Promise<void> {
    const r = await apiFetch<{ log: FullLogRow }>(`/api/audit/logs/${row.id}`);
    setDetail(r.log);
  }

  const columns: ColumnDef<AuditLogRow>[] = [
    {
      accessorKey: 'actionAt',
      header: 'When',
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {new Date(row.original.actionAt).toLocaleString()}
        </span>
      ),
    },
    {
      accessorKey: 'action',
      header: 'Action',
      cell: ({ row }) => {
        const a = row.original.action;
        const variant =
          a === 'create' ? 'success' : a === 'delete' ? 'destructive' : 'secondary';
        return <Badge variant={variant}>{a}</Badge>;
      },
    },
    {
      accessorKey: 'entityType',
      header: 'Entity',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-mono text-xs">{row.original.entityType}</span>
          {row.original.entityId && (
            <span className="font-mono text-[10px] text-muted-foreground">
              {row.original.entityId.slice(0, 8)}…
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'changesSummary',
      header: 'Summary',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.changesSummary ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'requestId',
      header: 'Request',
      cell: ({ row }) =>
        row.original.requestId ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            {row.original.requestId.slice(0, 8)}…
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Audit logs"
        description={`${total.toLocaleString()} total events. Filters apply server-side.`}
        actions={
          <Button variant="outline" size="sm" onClick={() => exportCsv()}>
            <Download className="mr-1 h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="grid gap-3 pt-4 md:grid-cols-[1fr_1fr_2fr_auto]">
          <div className="space-y-1">
            <Label className="text-xs">Entity type</Label>
            <Input
              placeholder="User, Module, Role…"
              value={filters.entityType}
              onChange={(e) => setFilters((f) => ({ ...f, entityType: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Action</Label>
            <Input
              placeholder="create / update / delete / login_failure"
              value={filters.action}
              onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Search summary</Label>
            <Input
              placeholder="e.g. isLocked, deactivatedAt…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={() => void fetchLogs()}>
              <Search className="mr-1.5 h-3.5 w-3.5" />
              Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={logs ?? []}
        loading={logs === null}
        pageSize={20}
        onRowClick={(row) => void openDetail(row)}
        emptyText="No audit events match these filters."
      />

      <p className="mt-2 text-xs text-muted-foreground">Click a row for the full diff.</p>

      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {detail ? `${detail.action} on ${detail.entityType}` : ''}
            </DialogTitle>
            <DialogDescription>
              {detail
                ? `${new Date(detail.actionAt).toLocaleString()} · ${detail.changesSummary ?? '—'}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Before
              </h3>
              <pre className="max-h-80 overflow-auto rounded-md bg-muted/40 p-3 text-[11px] leading-snug">
                {detail?.beforeData != null ? JSON.stringify(detail.beforeData, null, 2) : '—'}
              </pre>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                After
              </h3>
              <pre className="max-h-80 overflow-auto rounded-md bg-muted/40 p-3 text-[11px] leading-snug">
                {detail?.afterData != null ? JSON.stringify(detail.afterData, null, 2) : '—'}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
