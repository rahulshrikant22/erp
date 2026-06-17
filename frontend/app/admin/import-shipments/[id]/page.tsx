'use client';
import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';

interface LinkedPO {
  id: string;
  poNumber: string;
  vendorName: string;
  totalValue: string;
  currency: string;
}

interface CustomsInfo {
  billOfEntryNumber: string | null;
  billOfEntryDate: string | null;
  customsDuty: string | null;
  igst: string | null;
  otherCharges: string | null;
  chaName: string | null;
  chaContact: string | null;
}

interface LandedCostLine {
  id: string;
  materialCode: string;
  materialName: string;
  fobValue: string;
  freightCost: string;
  dutyAmount: string;
  totalLanded: string;
  perUnitCost: string;
  quantity: number;
  uom: string;
}

interface StatusEvent {
  status: string;
  timestamp: string;
  notes: string | null;
}

interface ImportShipment {
  id: string;
  shipmentNumber: string;
  vesselName: string | null;
  containerNumber: string | null;
  status: string;
  eta: string | null;
  etd: string | null;
  actualArrival: string | null;
  portOfLoading: string | null;
  portOfDischarge: string | null;
  linkedPOs: LinkedPO[];
  customs: CustomsInfo;
  landedCostLines: LandedCostLine[];
  statusTimeline: StatusEvent[];
}

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  booked: 'secondary',
  in_transit: 'outline',
  at_port: 'outline',
  customs_clearance: 'outline',
  delivered: 'default',
  cancelled: 'destructive',
};

const STATUS_ORDER = ['booked', 'in_transit', 'at_port', 'customs_clearance', 'delivered'];

function getNextStatus(current: string): string | null {
  const idx = STATUS_ORDER.indexOf(current);
  if (idx === -1 || idx >= STATUS_ORDER.length - 1) return null;
  return STATUS_ORDER[idx + 1];
}

export default function ImportShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [shipment, setShipment] = React.useState<ImportShipment | null>(null);
  const [transitioning, setTransitioning] = React.useState(false);

  const fetchShipment = React.useCallback(async () => {
    try {
      const res = await apiFetch<{ importShipment: ImportShipment }>(`/api/import-shipments/${id}`);
      setShipment(res.importShipment);
    } catch {
      toast.error('Failed to load shipment');
    }
  }, [id]);

  React.useEffect(() => { fetchShipment(); }, [fetchShipment]);

  if (!shipment) {
    return <div className="py-8 text-center text-muted-foreground">Loading shipment...</div>;
  }

  const nextStatus = getNextStatus(shipment.status);

  async function handleTransition() {
    if (!nextStatus) return;
    setTransitioning(true);
    try {
      await apiFetch(`/api/import-shipments/${id}/transition`, {
        method: 'POST',
        body: { status: nextStatus },
      });
      toast.success(`Status updated to ${nextStatus.replace(/_/g, ' ')}`);
      fetchShipment();
    } catch (e: any) {
      toast.error(e.message ?? 'Transition failed');
    } finally {
      setTransitioning(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={shipment.shipmentNumber}
        description={shipment.vesselName ?? 'Import Shipment'}
        actions={
          <div className="flex gap-2 items-center">
            <Badge variant={STATUS_COLORS[shipment.status] ?? 'outline'} className="text-sm px-3 py-1">
              {shipment.status.replace(/_/g, ' ')}
            </Badge>
            {nextStatus && (
              <Button size="sm" onClick={handleTransition} disabled={transitioning}>
                {transitioning ? 'Updating...' : `Move to ${nextStatus.replace(/_/g, ' ')}`}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => router.push('/admin/import-shipments')}>
              <ArrowLeft className="h-4 w-4 mr-1" />Back
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pos">Linked POs ({shipment.linkedPOs?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="customs">Customs</TabsTrigger>
          <TabsTrigger value="landed-cost">Landed Cost ({shipment.landedCostLines?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Vessel</p>
                <p className="font-medium">{shipment.vesselName ?? '-'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Container</p>
                <p className="font-medium">{shipment.containerNumber ?? '-'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">ETA</p>
                <p className="font-medium">{shipment.eta ? new Date(shipment.eta).toLocaleDateString('en-IN') : '-'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">ETD</p>
                <p className="font-medium">{shipment.etd ? new Date(shipment.etd).toLocaleDateString('en-IN') : '-'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Port of Loading</p>
                <p className="font-medium">{shipment.portOfLoading ?? '-'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Port of Discharge</p>
                <p className="font-medium">{shipment.portOfDischarge ?? '-'}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader><CardTitle className="text-base">Status Timeline</CardTitle></CardHeader>
            <CardContent>
              {(!shipment.statusTimeline || shipment.statusTimeline.length === 0) ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No status events</p>
              ) : (
                <div className="space-y-3">
                  {shipment.statusTimeline.map((event, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className={`h-3 w-3 rounded-full ${idx === 0 ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
                      <div>
                        <Badge variant="outline">{event.status.replace(/_/g, ' ')}</Badge>
                        <span className="ml-2 text-xs text-muted-foreground">{new Date(event.timestamp).toLocaleString()}</span>
                        {event.notes && <p className="text-sm text-muted-foreground mt-0.5">{event.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pos">
          <Card>
            <CardHeader><CardTitle className="text-base">Linked Purchase Orders</CardTitle></CardHeader>
            <CardContent>
              {(!shipment.linkedPOs || shipment.linkedPOs.length === 0) ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No linked POs</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-3">PO #</th>
                        <th className="py-2 pr-3">Vendor</th>
                        <th className="py-2 pr-3 text-right">Value</th>
                        <th className="py-2 pr-3">Currency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shipment.linkedPOs.map((po) => (
                        <tr key={po.id} className="border-b last:border-0 cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/admin/purchase-orders/${po.id}`)}>
                          <td className="py-2 pr-3 font-medium">{po.poNumber}</td>
                          <td className="py-2 pr-3">{po.vendorName}</td>
                          <td className="py-2 pr-3 text-right font-mono">{Number(po.totalValue).toLocaleString('en-IN')}</td>
                          <td className="py-2 pr-3">{po.currency}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="customs">
          <Card>
            <CardHeader><CardTitle className="text-base">Customs Details</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Bill of Entry Number</p>
                  <p className="font-medium">{shipment.customs?.billOfEntryNumber ?? '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Bill of Entry Date</p>
                  <p className="font-medium">{shipment.customs?.billOfEntryDate ? new Date(shipment.customs.billOfEntryDate).toLocaleDateString('en-IN') : '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Customs Duty</p>
                  <p className="font-medium">{shipment.customs?.customsDuty ? `₹${Number(shipment.customs.customsDuty).toLocaleString('en-IN')}` : '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">IGST</p>
                  <p className="font-medium">{shipment.customs?.igst ? `₹${Number(shipment.customs.igst).toLocaleString('en-IN')}` : '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Other Charges</p>
                  <p className="font-medium">{shipment.customs?.otherCharges ? `₹${Number(shipment.customs.otherCharges).toLocaleString('en-IN')}` : '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">CHA Name</p>
                  <p className="font-medium">{shipment.customs?.chaName ?? '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">CHA Contact</p>
                  <p className="font-medium">{shipment.customs?.chaContact ?? '-'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="landed-cost">
          <Card>
            <CardHeader><CardTitle className="text-base">Landed Cost Breakdown</CardTitle></CardHeader>
            <CardContent>
              {(!shipment.landedCostLines || shipment.landedCostLines.length === 0) ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No landed cost data</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-3">Material</th>
                        <th className="py-2 pr-3 text-right">Qty</th>
                        <th className="py-2 pr-3">UOM</th>
                        <th className="py-2 pr-3 text-right">FOB</th>
                        <th className="py-2 pr-3 text-right">Freight</th>
                        <th className="py-2 pr-3 text-right">Duty</th>
                        <th className="py-2 pr-3 text-right">Total Landed</th>
                        <th className="py-2 pr-3 text-right">Per Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shipment.landedCostLines.map((line) => (
                        <tr key={line.id} className="border-b last:border-0">
                          <td className="py-2 pr-3">
                            <Badge variant="outline" className="mr-1">{line.materialCode}</Badge>
                            {line.materialName}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono">{line.quantity}</td>
                          <td className="py-2 pr-3">{line.uom}</td>
                          <td className="py-2 pr-3 text-right font-mono">{Number(line.fobValue).toLocaleString('en-IN')}</td>
                          <td className="py-2 pr-3 text-right font-mono">{Number(line.freightCost).toLocaleString('en-IN')}</td>
                          <td className="py-2 pr-3 text-right font-mono">{Number(line.dutyAmount).toLocaleString('en-IN')}</td>
                          <td className="py-2 pr-3 text-right font-mono font-semibold">{Number(line.totalLanded).toLocaleString('en-IN')}</td>
                          <td className="py-2 pr-3 text-right font-mono">{Number(line.perUnitCost).toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
