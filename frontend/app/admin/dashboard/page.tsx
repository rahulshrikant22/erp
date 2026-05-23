'use client';
import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/components/providers/auth-provider';
import { apiFetch } from '@/lib/api';
import type { ModuleSummary, AuditLogRow } from '@/lib/types';
import { Layers, Activity, ScrollText } from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage(): React.ReactElement {
  const { user } = useAuth();
  const [modules, setModules] = React.useState<ModuleSummary[] | null>(null);
  const [audit, setAudit] = React.useState<AuditLogRow[] | null>(null);

  React.useEffect(() => {
    apiFetch<{ modules: ModuleSummary[] }>('/api/modules').then((r) => setModules(r.modules)).catch(() => setModules([]));
    apiFetch<{ logs: AuditLogRow[]; total: number }>('/api/audit/logs?limit=8').then((r) => setAudit(r.logs)).catch(() => setAudit([]));
  }, []);

  const activeCount = modules?.filter((m) => m.isActive).length ?? null;
  const totalCount = modules?.length ?? null;

  return (
    <>
      <PageHeader
        title={`Welcome${user?.firstName ? `, ${user.firstName}` : ''}`}
        description="Foundation services are running. Module-specific screens are added in their phases."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
              <Activity className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <CardDescription>Status</CardDescription>
              <CardTitle className="text-base">All systems normal</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Backend, database, and audit pipeline reachable. Workflows engine ready to accept
              instances.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-sky-100 text-sky-700">
              <Layers className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <CardDescription>Modules</CardDescription>
              <CardTitle className="text-base">
                {activeCount !== null && totalCount !== null
                  ? `${activeCount} of ${totalCount} active`
                  : <Skeleton className="h-5 w-20" />}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {modules === null ? (
              <Skeleton className="h-5 w-full" />
            ) : (
              modules
                .filter((m) => m.isCore)
                .map((m) => (
                  <Badge key={m.moduleCode} variant="outline" className="font-mono text-[10px]">
                    {m.moduleCode}
                  </Badge>
                ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-100 text-amber-700">
              <ScrollText className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <CardDescription>Audit pulse</CardDescription>
              <CardTitle className="text-base">
                {audit === null ? <Skeleton className="h-5 w-24" /> : `${audit.length} recent events`}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <Link href="/admin/audit-logs" className="text-xs font-medium text-primary hover:underline">
              View full log →
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Recent audit events</CardTitle>
          <CardDescription>Latest mutations across the API</CardDescription>
        </CardHeader>
        <CardContent>
          {audit === null ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit events yet.</p>
          ) : (
            <ol className="divide-y">
              {audit.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-4 py-2 text-sm">
                  <div className="flex min-w-0 items-center gap-3">
                    <Badge
                      variant={
                        row.action === 'create'
                          ? 'success'
                          : row.action === 'delete'
                          ? 'destructive'
                          : 'secondary'
                      }
                      className="shrink-0"
                    >
                      {row.action}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {row.entityType}
                    </span>
                    <span className="truncate text-muted-foreground">{row.changesSummary}</span>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {new Date(row.actionAt).toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </>
  );
}
