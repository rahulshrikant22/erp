'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ShoppingCart, Clock, Ship, AlertTriangle, PackageCheck, FileCheck } from 'lucide-react';

interface ProcurementKPIs {
  openPOs: { count: number; value: string };
  pendingApprovals: number;
  overduePOs: number;
  activeImports: number;
  reorderAlerts: number;
  pendingGRNs: number;
}

export default function ProcurementDashboardPage() {
  const router = useRouter();
  const [kpis, setKPIs] = React.useState<ProcurementKPIs | null>(null);

  React.useEffect(() => {
    apiFetch<{ kpis: ProcurementKPIs }>('/api/procurement-dashboard/kpis')
      .then((res) => setKPIs(res.kpis))
      .catch(() => setKPIs({
        openPOs: { count: 0, value: '0' },
        pendingApprovals: 0,
        overduePOs: 0,
        activeImports: 0,
        reorderAlerts: 0,
        pendingGRNs: 0,
      }));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="Procurement Dashboard" description="Supply chain overview and quick actions" />

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push('/admin/purchase-orders')}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <ShoppingCart className="h-8 w-8 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Open POs</p>
                <p className="text-xl font-semibold">{kpis?.openPOs.count ?? '-'}</p>
                {kpis && <p className="text-xs text-muted-foreground">₹{Number(kpis.openPOs.value).toLocaleString('en-IN')}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push('/admin/purchase-orders?status=pending_approval')}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <FileCheck className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-xs text-muted-foreground">Pending Approvals</p>
                <p className="text-xl font-semibold">{kpis?.pendingApprovals ?? '-'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push('/admin/purchase-orders?status=overdue')}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-destructive" />
              <div>
                <p className="text-xs text-muted-foreground">Overdue POs</p>
                <p className="text-xl font-semibold">{kpis?.overduePOs ?? '-'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push('/admin/import-shipments')}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Ship className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">Active Imports</p>
                <p className="text-xl font-semibold">{kpis?.activeImports ?? '-'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push('/admin/inventory/reorder-alerts')}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-xs text-muted-foreground">Reorder Alerts</p>
                <p className="text-xl font-semibold">{kpis?.reorderAlerts ?? '-'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push('/admin/grns')}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <PackageCheck className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-xs text-muted-foreground">Pending GRNs</p>
                <p className="text-xl font-semibold">{kpis?.pendingGRNs ?? '-'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <Button className="w-full" onClick={() => router.push('/admin/purchase-orders?status=pending_approval')}>
            <FileCheck className="h-4 w-4 mr-2" />Approve Pending POs
          </Button>
        </Card>
        <Card className="p-4">
          <Button className="w-full" variant="outline" onClick={() => router.push('/admin/purchase-orders?status=overdue')}>
            <Clock className="h-4 w-4 mr-2" />View Overdue POs
          </Button>
        </Card>
        <Card className="p-4">
          <Button className="w-full" variant="outline" onClick={() => router.push('/admin/inventory/reorder-alerts')}>
            <AlertTriangle className="h-4 w-4 mr-2" />Convert Alerts to PR
          </Button>
        </Card>
      </div>
    </div>
  );
}
