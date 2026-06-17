'use client';
import * as React from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { FileText } from 'lucide-react';

interface ReorderAlert {
  id: string;
  material: { id: string; materialCode: string; materialName: string };
  location: { id: string; locationName: string };
  currentQty: number;
  reorderThreshold: number;
  status: string;
  createdAt: string;
}

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'destructive',
  acknowledged: 'outline',
  resolved: 'default',
  converted: 'default',
};

const columns: ColumnDef<ReorderAlert>[] = [
  {
    id: 'material',
    header: 'Material',
    cell: ({ row }) => (
      <span>
        <Badge variant="outline" className="mr-1">{row.original.material.materialCode}</Badge>
        {row.original.material.materialName}
      </span>
    ),
  },
  {
    id: 'location',
    header: 'Location',
    cell: ({ row }) => row.original.location.locationName,
  },
  {
    accessorKey: 'currentQty',
    header: 'Current Qty',
    cell: ({ row }) => <span className="font-mono text-destructive font-medium">{row.original.currentQty}</span>,
  },
  {
    accessorKey: 'reorderThreshold',
    header: 'Threshold',
    cell: ({ row }) => <span className="font-mono">{row.original.reorderThreshold}</span>,
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
    accessorKey: 'createdAt',
    header: 'Created',
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
  },
];

export default function ReorderAlertsPage() {
  const [alerts, setAlerts] = React.useState<ReorderAlert[] | null>(null);
  const [converting, setConverting] = React.useState<string | null>(null);

  const fetchAlerts = React.useCallback(async () => {
    try {
      const res = await apiFetch<{ reorderAlerts: ReorderAlert[]; total: number }>('/api/inventory/reorder-alerts');
      setAlerts(res.reorderAlerts);
    } catch {
      setAlerts([]);
    }
  }, []);

  React.useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  async function handleConvertToPR(alertId: string) {
    setConverting(alertId);
    try {
      await apiFetch(`/api/inventory/reorder-alerts/${alertId}/convert-to-pr`, { method: 'POST' });
      toast.success('Converted to Purchase Requisition');
      fetchAlerts();
    } catch (e: any) {
      toast.error(e.message ?? 'Conversion failed');
    } finally {
      setConverting(null);
    }
  }

  const columnsWithActions: ColumnDef<ReorderAlert>[] = [
    ...columns,
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => row.original.status === 'active' ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleConvertToPR(row.original.id)}
          disabled={converting === row.original.id}
        >
          <FileText className="h-3.5 w-3.5 mr-1" />
          {converting === row.original.id ? 'Converting...' : 'Convert to PR'}
        </Button>
      ) : null,
    },
  ];

  const activeCount = alerts?.filter((a) => a.status === 'active').length ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reorder Alerts"
        description={alerts ? `${alerts.length} alerts${activeCount > 0 ? ` (${activeCount} active)` : ''}` : 'Loading...'}
      />

      <DataTable columns={columnsWithActions} data={alerts ?? []} loading={alerts === null} pageSize={20} />
    </div>
  );
}
