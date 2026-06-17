'use client';
import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft, Send } from 'lucide-react';

interface GRNLine {
  id: string;
  lineNumber: number;
  material: { id: string; materialCode: string; materialName: string };
  orderedQty: number;
  receivedQty: number;
  tolerancePercent: number;
  lineStatus: string;
  qcStatus: string;
  uom: string;
}

interface GRNDetail {
  id: string;
  grnNumber: string;
  grnDate: string;
  status: string;
  poNumber: string | null;
  poId: string | null;
  vendor: { id: string; vendorCode: string; vendorName: string };
  vehicleNumber: string | null;
  driverName: string | null;
  driverPhone: string | null;
  gateEntryTime: string | null;
  lines: GRNLine[];
}

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  submitted: 'outline',
  qc_pending: 'outline',
  qc_complete: 'default',
  accepted: 'default',
  rejected: 'destructive',
};

const LINE_QC_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  passed: 'default',
  failed: 'destructive',
  not_required: 'outline',
};

export default function GRNDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [grn, setGRN] = React.useState<GRNDetail | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const fetchGRN = React.useCallback(async () => {
    try {
      const res = await apiFetch<{ grn: GRNDetail }>(`/api/grns/${id}`);
      setGRN(res.grn);
    } catch {
      toast.error('Failed to load GRN');
    }
  }, [id]);

  React.useEffect(() => { fetchGRN(); }, [fetchGRN]);

  if (!grn) {
    return <div className="py-8 text-center text-muted-foreground">Loading GRN...</div>;
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await apiFetch(`/api/grns/${id}/submit`, { method: 'POST' });
      toast.success('GRN submitted - QC triggered');
      fetchGRN();
    } catch (e: any) {
      toast.error(e.message ?? 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={grn.grnNumber}
        description={`${grn.vendor.vendorName}${grn.poNumber ? ` - PO ${grn.poNumber}` : ''}`}
        actions={
          <div className="flex gap-2 items-center">
            <Badge variant={STATUS_COLORS[grn.status] ?? 'outline'} className="text-sm px-3 py-1">
              {grn.status.replace(/_/g, ' ')}
            </Badge>
            {grn.status === 'draft' && (
              <Button size="sm" onClick={handleSubmit} disabled={submitting}>
                <Send className="h-4 w-4 mr-1" />{submitting ? 'Submitting...' : 'Submit'}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => router.push('/admin/grns')}>
              <ArrowLeft className="h-4 w-4 mr-1" />Back
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader><CardTitle className="text-base">Gate Entry Information</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">PO Number</p>
              <p className="font-medium">
                {grn.poNumber ? (
                  <span className="cursor-pointer text-primary underline" onClick={() => grn.poId && router.push(`/admin/purchase-orders/${grn.poId}`)}>
                    {grn.poNumber}
                  </span>
                ) : '-'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Vehicle Number</p>
              <p className="font-medium">{grn.vehicleNumber ?? '-'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Driver</p>
              <p className="font-medium">{grn.driverName ?? '-'}{grn.driverPhone ? ` (${grn.driverPhone})` : ''}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Gate Entry Time</p>
              <p className="font-medium">{grn.gateEntryTime ? new Date(grn.gateEntryTime).toLocaleString() : '-'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Received Lines</CardTitle></CardHeader>
        <CardContent>
          {grn.lines.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No lines</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3">#</th>
                    <th className="py-2 pr-3">Material</th>
                    <th className="py-2 pr-3 text-right">Ordered</th>
                    <th className="py-2 pr-3 text-right">Received</th>
                    <th className="py-2 pr-3">UOM</th>
                    <th className="py-2 pr-3 text-right">Tolerance %</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">QC</th>
                  </tr>
                </thead>
                <tbody>
                  {grn.lines.map((line) => (
                    <tr key={line.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 text-muted-foreground">{line.lineNumber}</td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline" className="mr-1">{line.material.materialCode}</Badge>
                        {line.material.materialName}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">{line.orderedQty}</td>
                      <td className="py-2 pr-3 text-right font-mono">{line.receivedQty}</td>
                      <td className="py-2 pr-3">{line.uom}</td>
                      <td className="py-2 pr-3 text-right font-mono">{line.tolerancePercent}%</td>
                      <td className="py-2 pr-3">
                        <Badge variant={STATUS_COLORS[line.lineStatus] ?? 'outline'}>
                          {line.lineStatus.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant={LINE_QC_COLORS[line.qcStatus] ?? 'outline'}>
                          {line.qcStatus.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
