'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { apiFetch, ApiClientError } from '@/lib/api';
import type { ModuleSummary } from '@/lib/types';
import { toast } from '@/components/ui/sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { Lock } from 'lucide-react';

type Filter = 'all' | 'active' | 'inactive';

export default function ModulesPage(): React.ReactElement {
  const router = useRouter();
  const [filter, setFilter] = React.useState<Filter>('all');
  const [modules, setModules] = React.useState<ModuleSummary[] | null>(null);
  const [pendingToggle, setPendingToggle] = React.useState<ModuleSummary | null>(null);

  const fetchModules = React.useCallback(async (): Promise<void> => {
    try {
      const r = await apiFetch<{ modules: ModuleSummary[] }>('/api/modules');
      setModules(r.modules);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Could not load modules');
      setModules([]);
    }
  }, []);

  React.useEffect(() => {
    void fetchModules();
  }, [fetchModules]);

  const filtered = React.useMemo(() => {
    if (!modules) return null;
    if (filter === 'active') return modules.filter((m) => m.isActive);
    if (filter === 'inactive') return modules.filter((m) => !m.isActive);
    return modules;
  }, [modules, filter]);

  async function applyToggle(m: ModuleSummary): Promise<void> {
    const action = m.isActive ? 'deactivate' : 'activate';
    try {
      await apiFetch(`/api/modules/${m.moduleCode}/${action}`, {
        method: 'POST',
        body: { reason: `${action} from admin UI` },
      });
      toast.success(`${m.moduleCode} ${action}d`);
      await fetchModules();
    } catch (err) {
      if (err instanceof ApiClientError) {
        const details = err.details as { activeDependents?: string[]; missing?: string[] } | undefined;
        if (details?.activeDependents) {
          toast.error(`Cannot deactivate — depended on by: ${details.activeDependents.join(', ')}`);
        } else if (details?.missing) {
          toast.error(`Cannot activate — first activate: ${details.missing.join(', ')}`);
        } else {
          toast.error(err.message);
        }
      } else {
        toast.error('Network error');
      }
    }
  }

  const columns: ColumnDef<ModuleSummary>[] = [
    {
      accessorKey: 'moduleCode',
      header: 'Code',
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold">{row.original.moduleCode}</span>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Module',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.name}</span>
          {row.original.category && (
            <span className="text-xs text-muted-foreground capitalize">{row.original.category}</span>
          )}
        </div>
      ),
    },
    {
      id: 'flags',
      header: 'Flags',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.isCore && (
            <Badge variant="outline" className="gap-1 font-mono text-[10px]">
              <Lock className="h-3 w-3" />
              core
            </Badge>
          )}
          {row.original.isBypassable && (
            <Badge variant="secondary" className="font-mono text-[10px]">
              bypassable
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) =>
        row.original.isActive ? (
          <Badge variant="success">active</Badge>
        ) : (
          <Badge variant="outline">inactive</Badge>
        ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Toggle</div>,
      cell: ({ row }) => {
        const m = row.original;
        return (
          <div className="flex justify-end">
            <Switch
              checked={m.isActive}
              disabled={m.isCore && m.isActive}
              onClick={(e) => e.stopPropagation()}
              onCheckedChange={() => setPendingToggle(m)}
              aria-label={`Toggle ${m.moduleCode}`}
            />
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Modules"
        description="Enable, disable, and inspect the 35 phase-by-phase modules. Core modules are protected; bypassable modules let dependent workflow steps auto-skip when off."
      />

      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Filter</CardTitle>
          <CardDescription>
            {modules ? `${modules.filter((m) => m.isActive).length} active · ${modules.length} total` : 'Loading…'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="inactive">Inactive</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={filtered ?? []}
        loading={filtered === null}
        pageSize={15}
        emptyText="No modules match the current filter."
      />

      <ConfirmDialog
        open={pendingToggle !== null}
        onOpenChange={(open) => !open && setPendingToggle(null)}
        title={
          pendingToggle?.isActive
            ? `Deactivate ${pendingToggle.moduleCode}?`
            : `Activate ${pendingToggle?.moduleCode ?? ''}?`
        }
        description={
          pendingToggle?.isActive
            ? 'Users will immediately lose access to this module. If other modules depend on it, the change will be refused.'
            : 'The module will become available across the system. Hard upstream dependencies must already be active.'
        }
        confirmLabel={pendingToggle?.isActive ? 'Deactivate' : 'Activate'}
        destructive={pendingToggle?.isActive}
        onConfirm={async () => {
          if (pendingToggle) await applyToggle(pendingToggle);
        }}
      />

      <p className="mt-3 text-xs text-muted-foreground">
        Need to inspect dependencies?{' '}
        <Button
          variant="link"
          className="h-auto p-0 text-xs"
          onClick={() => router.push('/admin/modules/growth-path')}
        >
          See suggested growth path →
        </Button>
      </p>
    </>
  );
}
