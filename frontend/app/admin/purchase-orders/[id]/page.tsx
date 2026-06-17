'use client';
import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ArrowLeft, Send, Check, X, Truck, Ban, FileCheck } from 'lucide-react';

interface POLine {
  id: string;
  lineNumber: number;
  material: { id: string; materialCode: string; materialName: string };
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  receivedQty: number;
  lineStatus: string;
  uom: string;
}

interface ApprovalEntry {
  id: string;
  action: string;
  approverName: string;
  comments: string | null;
  createdAt: string;
}

interface CommLogEntry {
  id: string;
  type: string;
  subject: string | null;
  sentAt: string;
  sentBy: string | null;
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  poDate: string;
  status: string;
  poType: string;
  totalValue: string;
  currency: string;
  expectedDeliveryDate: string | null;
  notes: string | null;
  vendor: { id: string; vendorCode: string; vendorName: string; primaryEmail: string | null };
  lines: POLine[];
  approvalHistory: ApprovalEntry[];
  communicationsLog: CommLogEntry[];
}

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  pending_approval: 'outline',
  approved: 'default',
  sent_to_vendor: 'default',
  acknowledged: 'default',
  partially_received: 'outline',
  fully_received: 'default',
  cancelled: 'destructive',
  rejected: 'destructive',
};

const LINE_STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  open: 'secondary',
  partially_received: 'outline',
  fully_received: 'default',
  cancelled: 'destructive',
};

const ACTION_MAP: Record<string, { label: string; icon: React.ElementType; variant: 'default' | 'outline' | 'destructive'; nextStatus: string }> = {
  submit: { label: 'Submit for Approval', icon: Send, variant: 'default', nextStatus: 'pending_approval' },
  approve: { label: 'Approve', icon: Check, variant: 'default', nextStatus: 'approved' },
  reject: { label: 'Reject', icon: X, variant: 'destructive', nextStatus: 'rejected' },
  send: { label: 'Send to Vendor', icon: Truck, variant: 'default', nextStatus: 'sent_to_vendor' },
  acknowledge: { label: 'Acknowledge', icon: FileCheck, variant: 'default', nextStatus: 'acknowledged' },
  cancel: { label: 'Cancel', icon: Ban, variant: 'destructive', nextStatus: 'cancelled' },
};

function getAvailableActions(status: string): string[] {
  switch (status) {
    case 'draft': return ['submit', 'cancel'];
    case 'pending_approval': return ['approve', 'reject'];
    case 'approved': return ['send', 'cancel'];
    case 'sent_to_vendor': return ['acknowledge', 'cancel'];
    case 'acknowledged': return ['cancel'];
    default: return [];
  }
}

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [po, setPO] = React.useState<PurchaseOrder | null>(null);
  const [actionLoading, setActionLoading] = React.useState('');

  const fetchPO = React.useCallback(async () => {
    try {
      const res = await apiFetch<{ purchaseOrder: PurchaseOrder }>(`/api/purchase-orders/${id}`);
      setPO(res.purchaseOrder);
    } catch {
      toast.error('Failed to load purchase order');
    }
  }, [id]);

  React.useEffect(() => { fetchPO(); }, [fetchPO]);

  if (!po) {
    return <div className="py-8 text-center text-muted-foreground">Loading purchase order...</div>;
  }

  async function handleAction(actionKey: string) {
    const action = ACTION_MAP[actionKey];
    if (!action) return;
    setActionLoading(actionKey);
    try {
      await apiFetch(`/api/purchase-orders/${id}/transition`, {
        method: 'POST',
        body: { action: actionKey, status: action.nextStatus },
      });
      toast.success(`PO ${actionKey === 'approve' ? 'approved' : actionKey === 'reject' ? 'rejected' : action.label.toLowerCase()}`);
      fetchPO();
    } catch (e: any) {
      toast.error(e.message ?? `Failed to ${actionKey}`);
    } finally {
      setActionLoading('');
    }
  }

  const availableActions = getAvailableActions(po.status);

  return (
    <div className="space-y-4">
      <PageHeader
        title={po.poNumber}
        description={`${po.vendor.vendorName} - ${po.poType}`}
        actions={
          <div className="flex gap-2 items-center">
            <Badge variant={STATUS_COLORS[po.status] ?? 'outline'} className="text-sm px-3 py-1">
              {po.status.replace(/_/g, ' ')}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => router.push('/admin/purchase-orders')}>
              <ArrowLeft className="h-4 w-4 mr-1" />Back
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Vendor</p>
            <p className="font-medium">{po.vendor.vendorCode}</p>
            <p className="text-sm text-muted-foreground">{po.vendor.vendorName}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">PO Date</p>
            <p className="font-medium">{new Date(po.poDate).toLocaleDateString('en-IN')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total Value</p>
            <p className="font-medium">{po.currency === 'INR' ? '₹' : po.currency + ' '}{Number(po.totalValue).toLocaleString('en-IN')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Expected Delivery</p>
            <p className="font-medium">{po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate).toLocaleDateString('en-IN') : '-'}</p>
          </CardContent>
        </Card>
      </div>

      {availableActions.length > 0 && (
        <Card>
          <CardContent className="pt-4 flex flex-wrap gap-2">
            {availableActions.map((actionKey) => {
              const action = ACTION_MAP[actionKey];
              if (!action) return null;
              const Icon = action.icon;
              return (
                <Button
                  key={actionKey}
                  variant={action.variant}
                  size="sm"
                  onClick={() => handleAction(actionKey)}
                  disabled={actionLoading === actionKey}
                >
                  <Icon className="h-4 w-4 mr-1" />
                  {actionLoading === actionKey ? 'Processing...' : action.label}
                </Button>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Order Lines</CardTitle></CardHeader>
        <CardContent>
          {po.lines.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No lines yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3">#</th>
                    <th className="py-2 pr-3">Material</th>
                    <th className="py-2 pr-3 text-right">Qty</th>
                    <th className="py-2 pr-3">UOM</th>
                    <th className="py-2 pr-3 text-right">Unit Price</th>
                    <th className="py-2 pr-3 text-right">Total</th>
                    <th className="py-2 pr-3 text-right">Received</th>
                    <th className="py-2 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {po.lines.map((line) => (
                    <tr key={line.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 text-muted-foreground">{line.lineNumber}</td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline" className="mr-1">{line.material.materialCode}</Badge>
                        {line.material.materialName}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">{line.quantity}</td>
                      <td className="py-2 pr-3">{line.uom}</td>
                      <td className="py-2 pr-3 text-right font-mono">{Number(line.unitPrice).toLocaleString('en-IN')}</td>
                      <td className="py-2 pr-3 text-right font-mono">{Number(line.totalPrice).toLocaleString('en-IN')}</td>
                      <td className="py-2 pr-3 text-right font-mono">{line.receivedQty}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={LINE_STATUS_COLORS[line.lineStatus] ?? 'outline'}>
                          {line.lineStatus.replace(/_/g, ' ')}
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

      <Card>
        <CardHeader><CardTitle className="text-base">Approval History</CardTitle></CardHeader>
        <CardContent>
          {(!po.approvalHistory || po.approvalHistory.length === 0) ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No approval history</p>
          ) : (
            <div className="space-y-2">
              {po.approvalHistory.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 border-b py-2 last:border-0">
                  <Badge variant={entry.action === 'approved' ? 'default' : entry.action === 'rejected' ? 'destructive' : 'outline'}>
                    {entry.action}
                  </Badge>
                  <span className="text-sm font-medium">{entry.approverName}</span>
                  {entry.comments && <span className="text-sm text-muted-foreground">- {entry.comments}</span>}
                  <span className="ml-auto text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Communications Log</CardTitle></CardHeader>
        <CardContent>
          {(!po.communicationsLog || po.communicationsLog.length === 0) ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No communications</p>
          ) : (
            <div className="space-y-2">
              {po.communicationsLog.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 border-b py-2 last:border-0">
                  <Badge variant="outline">{entry.type}</Badge>
                  <span className="text-sm">{entry.subject ?? 'No subject'}</span>
                  {entry.sentBy && <span className="text-sm text-muted-foreground">by {entry.sentBy}</span>}
                  <span className="ml-auto text-xs text-muted-foreground">{new Date(entry.sentAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
