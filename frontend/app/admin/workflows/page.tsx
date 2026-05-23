'use client';
import * as React from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiFetch } from '@/lib/api';
import type { WorkflowInstanceRow } from '@/lib/types';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight, Workflow, Eye } from 'lucide-react';

interface WorkflowDef {
  id: string;
  workflowCode: string;
  name: string;
  description: string | null;
  isActive: boolean;
  stepsCount?: number;
}

export default function WorkflowsPage(): React.ReactElement {
  const [active, setActive] = React.useState<WorkflowInstanceRow[] | null>(null);
  const [completed, setCompleted] = React.useState<WorkflowInstanceRow[] | null>(null);

  React.useEffect(() => {
    apiFetch<{ instances: WorkflowInstanceRow[] }>('/api/workflows/instances?status=active')
      .then((r) => setActive(r.instances))
      .catch(() => setActive([]));
    apiFetch<{ instances: WorkflowInstanceRow[] }>('/api/workflows/instances?status=completed')
      .then((r) => setCompleted(r.instances))
      .catch(() => setCompleted([]));
  }, []);

  const instanceColumns: ColumnDef<WorkflowInstanceRow>[] = [
    {
      accessorKey: 'workflowCode',
      header: 'Workflow',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-mono text-xs font-semibold">{row.original.workflowCode}</span>
          <span className="text-xs text-muted-foreground">{row.original.workflowName}</span>
        </div>
      ),
    },
    {
      accessorKey: 'targetEntity',
      header: 'Target',
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.targetEntity}:{row.original.targetEntityId.slice(0, 8)}...
        </span>
      ),
    },
    {
      accessorKey: 'currentStep',
      header: 'Step',
      cell: ({ row }) => <span className="font-mono text-xs">#{row.original.currentStep + 1}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = row.original.status;
        const variant = s === 'active' ? 'warning' : s === 'completed' ? 'success' : 'destructive';
        return <Badge variant={variant}>{s}</Badge>;
      },
    },
    {
      accessorKey: 'initiatedAt',
      header: 'Started',
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {new Date(row.original.initiatedAt).toLocaleString()}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Link href={`/admin/workflows/instances/${row.original.id}`}>
          <Button variant="ghost" size="sm"><Eye className="mr-1 h-3 w-3" /> View</Button>
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Workflows"
        description="Approval flows, status transitions, and workflow management."
      />

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-100 text-amber-700">
              <Workflow className="h-5 w-5" />
            </div>
            <div>
              <CardDescription>Active</CardDescription>
              <CardTitle className="text-base">
                {active === null ? '...' : `${active.length} pending`}
              </CardTitle>
            </div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
              <ArrowRight className="h-5 w-5" />
            </div>
            <div>
              <CardDescription>Completed (last 100)</CardDescription>
              <CardTitle className="text-base">
                {completed === null ? '...' : `${completed.length} done`}
              </CardTitle>
            </div>
          </CardHeader>
        </Card>
      </div>

      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">Active Instances</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          <DataTable
            columns={instanceColumns}
            data={active ?? []}
            loading={active === null}
            pageSize={15}
            emptyText="No active workflow instances."
          />
        </TabsContent>

        <TabsContent value="completed">
          <DataTable
            columns={instanceColumns}
            data={completed ?? []}
            loading={completed === null}
            pageSize={15}
            emptyText="No completed workflow instances."
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
