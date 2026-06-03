'use client';
import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Check,
  Copy,
  Layers,
  Plus,
  Trash2,
  FileText,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface MaterialLine {
  id: string;
  lineSequence: number;
  lineType: string;
  alternateGroupId: string | null;
  materialCategory: { id: string; categoryName: string } | null;
  materialType: { id: string; typeName: string } | null;
  specificMaterial: { id: string; materialCode: string; materialName: string } | null;
  isFinishDependent: boolean;
  quantityPerUnit: string;
  uom: string;
  wastagePercent: string;
  notes: string | null;
}

interface ProcessLine {
  id: string;
  lineSequence: number;
  process: { id: string; processCode: string; processName: string };
  quantity: string;
  timePerUnitMinutes: string | null;
  isOutsourced: boolean;
  estimatedCost: string;
  notes: string | null;
}

interface Subassembly {
  id: string;
  childBom: { id: string; bomCode: string; bomName: string };
  quantity: string;
  notes: string | null;
}

interface BomVersion {
  id: string;
  versionNumber: number;
  versionStatus: string;
  approvedBy: string | null;
  approvedAt: string | null;
  lockedAtProductionStart: boolean;
  materialLines: MaterialLine[];
  processLines: ProcessLine[];
  subassemblies: Subassembly[];
}

interface Bom {
  id: string;
  bomCode: string;
  bomName: string;
  description: string | null;
  status: string;
  currentVersion: number;
  product: { id: string; productCode: string; productName: string };
  sizeVariant: { id: string; variantName: string } | null;
  versions: BomVersion[];
}

interface ProcessOption {
  id: string;
  processCode: string;
  processName: string;
}

interface ChangeLogEntry {
  id: string;
  changeType: string;
  changedBy: string | null;
  changedAt: string;
  changeDetails: unknown;
}

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  approved: 'default',
  superseded: 'outline',
};

// ─── Component ──────────────────────────────────────────────────────────────────

export default function BomDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [bom, setBom] = React.useState<Bom | null>(null);
  const [processes, setProcesses] = React.useState<ProcessOption[]>([]);
  const [changelog, setChangelog] = React.useState<ChangeLogEntry[]>([]);
  const [activeVersionIdx, setActiveVersionIdx] = React.useState(0);
  const [showAddMaterial, setShowAddMaterial] = React.useState(false);
  const [showAddProcess, setShowAddProcess] = React.useState(false);
  const [materialForm, setMaterialForm] = React.useState({ quantityPerUnit: '', uom: 'PCS', wastagePercent: '0', notes: '' });
  const [processForm, setProcessForm] = React.useState({ processId: '', quantity: '1', notes: '' });
  const [saving, setSaving] = React.useState(false);

  const fetchBom = React.useCallback(async () => {
    try {
      const res = await apiFetch<{ bom: Bom }>(`/api/boms/${id}`);
      setBom(res.bom);
    } catch {
      toast.error('Failed to load BOM');
    }
  }, [id]);

  const fetchProcesses = React.useCallback(async () => {
    try {
      const res = await apiFetch<{ processes: ProcessOption[] }>('/api/processes?is_active=true&limit=200');
      setProcesses(res.processes);
    } catch { /* ignore */ }
  }, []);

  const fetchChangelog = React.useCallback(async () => {
    try {
      const res = await apiFetch<{ changelog: ChangeLogEntry[] }>(`/api/boms/${id}/changelog`);
      setChangelog(res.changelog);
    } catch { /* ignore */ }
  }, [id]);

  React.useEffect(() => { fetchBom(); }, [fetchBom]);
  React.useEffect(() => { fetchProcesses(); }, [fetchProcesses]);

  if (!bom) {
    return <div className="py-8 text-center text-muted-foreground">Loading BOM...</div>;
  }

  const version = bom.versions[activeVersionIdx];
  const isDraft = version?.versionStatus === 'draft';

  async function handleApprove() {
    if (!version) return;
    try {
      await apiFetch(`/api/boms/${id}/versions/${version.id}/approve`, { method: 'POST' });
      toast.success(`Version ${version.versionNumber} approved`);
      fetchBom();
    } catch (e: any) {
      toast.error(e.message ?? 'Approval failed');
    }
  }

  async function handleNewVersion() {
    try {
      await apiFetch(`/api/boms/${id}/versions`, { method: 'POST' });
      toast.success('New version created');
      setActiveVersionIdx(0);
      fetchBom();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to create version');
    }
  }

  async function handleAddMaterial() {
    if (!version) return;
    setSaving(true);
    try {
      await apiFetch(`/api/boms/${id}/versions/${version.id}/materials`, {
        method: 'POST',
        body: {
          quantity_per_unit: Number(materialForm.quantityPerUnit),
          uom: materialForm.uom,
          wastage_percent: Number(materialForm.wastagePercent),
          notes: materialForm.notes || null,
        },
      });
      toast.success('Material line added');
      setShowAddMaterial(false);
      setMaterialForm({ quantityPerUnit: '', uom: 'PCS', wastagePercent: '0', notes: '' });
      fetchBom();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddProcess() {
    if (!version) return;
    setSaving(true);
    try {
      await apiFetch(`/api/boms/${id}/versions/${version.id}/processes`, {
        method: 'POST',
        body: {
          process_id: processForm.processId,
          quantity: Number(processForm.quantity),
          notes: processForm.notes || null,
        },
      });
      toast.success('Process line added');
      setShowAddProcess(false);
      setProcessForm({ processId: '', quantity: '1', notes: '' });
      fetchBom();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteMaterial(lineId: string) {
    if (!version) return;
    try {
      await apiFetch(`/api/boms/${id}/versions/${version.id}/materials/${lineId}`, { method: 'DELETE' });
      toast.success('Material line removed');
      fetchBom();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed');
    }
  }

  async function handleDeleteProcess(lineId: string) {
    if (!version) return;
    try {
      await apiFetch(`/api/boms/${id}/versions/${version.id}/processes/${lineId}`, { method: 'DELETE' });
      toast.success('Process line removed');
      fetchBom();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed');
    }
  }

  async function handleDeleteSubassembly(saId: string) {
    if (!version) return;
    try {
      await apiFetch(`/api/boms/${id}/versions/${version.id}/subassemblies/${saId}`, { method: 'DELETE' });
      toast.success('Subassembly removed');
      fetchBom();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed');
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={bom.bomCode}
        description={bom.bomName}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push('/admin/boms')}>
              <ArrowLeft className="h-4 w-4 mr-1" />Back
            </Button>
            <Button variant="outline" size="sm" onClick={handleNewVersion}>
              <Copy className="h-4 w-4 mr-1" />New Version
            </Button>
            {isDraft && (
              <Button size="sm" onClick={handleApprove}>
                <Check className="h-4 w-4 mr-1" />Approve v{version.versionNumber}
              </Button>
            )}
          </div>
        }
      />

      {/* BOM header info */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Product</p>
            <p className="font-medium">{bom.product.productCode} — {bom.product.productName}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Variant</p>
            <p className="font-medium">{bom.sizeVariant?.variantName ?? 'All sizes'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Status</p>
            <Badge variant={STATUS_COLORS[bom.status] ?? 'outline'}>{bom.status}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Current Version</p>
            <p className="font-medium">v{bom.currentVersion}</p>
          </CardContent>
        </Card>
      </div>

      {/* Version selector */}
      {bom.versions.length > 1 && (
        <Card>
          <CardContent className="pt-4 flex flex-wrap gap-2">
            {bom.versions.map((v, idx) => (
              <Button
                key={v.id}
                variant={idx === activeVersionIdx ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveVersionIdx(idx)}
              >
                v{v.versionNumber}
                <Badge variant={STATUS_COLORS[v.versionStatus] ?? 'outline'} className="ml-2 text-[10px]">
                  {v.versionStatus}
                </Badge>
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {version && (
        <Tabs defaultValue="materials">
          <TabsList>
            <TabsTrigger value="materials">
              Materials ({version.materialLines.length})
            </TabsTrigger>
            <TabsTrigger value="processes">
              Processes ({version.processLines.length})
            </TabsTrigger>
            <TabsTrigger value="subassemblies">
              Sub-assemblies ({version.subassemblies.length})
            </TabsTrigger>
            <TabsTrigger value="changelog" onClick={() => fetchChangelog()}>
              Change Log
            </TabsTrigger>
          </TabsList>

          {/* ── Materials Tab ── */}
          <TabsContent value="materials">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">Material Lines</CardTitle>
                {isDraft && (
                  <Button size="sm" variant="outline" onClick={() => setShowAddMaterial(true)}>
                    <Plus className="h-4 w-4 mr-1" />Add Material
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {version.materialLines.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No material lines yet</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 pr-3">#</th>
                          <th className="py-2 pr-3">Type</th>
                          <th className="py-2 pr-3">Category</th>
                          <th className="py-2 pr-3">Material</th>
                          <th className="py-2 pr-3 text-right">Qty</th>
                          <th className="py-2 pr-3">UOM</th>
                          <th className="py-2 pr-3 text-right">Wastage %</th>
                          <th className="py-2 pr-3">Finish?</th>
                          {isDraft && <th className="py-2 w-10" />}
                        </tr>
                      </thead>
                      <tbody>
                        {version.materialLines.map((ml) => (
                          <tr key={ml.id} className="border-b last:border-0">
                            <td className="py-2 pr-3 text-muted-foreground">{ml.lineSequence}</td>
                            <td className="py-2 pr-3">
                              <Badge variant={ml.lineType === 'alternate' ? 'outline' : 'secondary'}>
                                {ml.lineType}
                              </Badge>
                            </td>
                            <td className="py-2 pr-3">{ml.materialCategory?.categoryName ?? '-'}</td>
                            <td className="py-2 pr-3">
                              {ml.specificMaterial
                                ? `${ml.specificMaterial.materialCode} — ${ml.specificMaterial.materialName}`
                                : <span className="text-muted-foreground italic">Generic</span>}
                            </td>
                            <td className="py-2 pr-3 text-right font-mono">{Number(ml.quantityPerUnit)}</td>
                            <td className="py-2 pr-3">{ml.uom}</td>
                            <td className="py-2 pr-3 text-right font-mono">{Number(ml.wastagePercent)}</td>
                            <td className="py-2 pr-3">{ml.isFinishDependent ? 'Yes' : '-'}</td>
                            {isDraft && (
                              <td className="py-2">
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteMaterial(ml.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Processes Tab ── */}
          <TabsContent value="processes">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">Process Lines</CardTitle>
                {isDraft && (
                  <Button size="sm" variant="outline" onClick={() => setShowAddProcess(true)}>
                    <Plus className="h-4 w-4 mr-1" />Add Process
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {version.processLines.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No process lines yet</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 pr-3">#</th>
                          <th className="py-2 pr-3">Process</th>
                          <th className="py-2 pr-3 text-right">Qty</th>
                          <th className="py-2 pr-3 text-right">Time/unit (min)</th>
                          <th className="py-2 pr-3 text-right">Est. Cost (₹)</th>
                          <th className="py-2 pr-3">Outsourced</th>
                          {isDraft && <th className="py-2 w-10" />}
                        </tr>
                      </thead>
                      <tbody>
                        {version.processLines.map((pl) => (
                          <tr key={pl.id} className="border-b last:border-0">
                            <td className="py-2 pr-3 text-muted-foreground">{pl.lineSequence}</td>
                            <td className="py-2 pr-3">
                              <Badge variant="outline" className="mr-1">{pl.process.processCode}</Badge>
                              {pl.process.processName}
                            </td>
                            <td className="py-2 pr-3 text-right font-mono">{Number(pl.quantity)}</td>
                            <td className="py-2 pr-3 text-right font-mono">{pl.timePerUnitMinutes != null ? Number(pl.timePerUnitMinutes) : '-'}</td>
                            <td className="py-2 pr-3 text-right font-mono">₹{Number(pl.estimatedCost).toLocaleString('en-IN')}</td>
                            <td className="py-2 pr-3">{pl.isOutsourced ? <Badge>Yes</Badge> : '-'}</td>
                            {isDraft && (
                              <td className="py-2">
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteProcess(pl.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Subassemblies Tab ── */}
          <TabsContent value="subassemblies">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">Sub-assemblies</CardTitle>
              </CardHeader>
              <CardContent>
                {version.subassemblies.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No sub-assemblies</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 pr-3">Child BOM</th>
                          <th className="py-2 pr-3">Name</th>
                          <th className="py-2 pr-3 text-right">Qty</th>
                          <th className="py-2 pr-3">Notes</th>
                          {isDraft && <th className="py-2 w-10" />}
                        </tr>
                      </thead>
                      <tbody>
                        {version.subassemblies.map((sa) => (
                          <tr key={sa.id} className="border-b last:border-0">
                            <td className="py-2 pr-3">
                              <Badge variant="outline">{sa.childBom.bomCode}</Badge>
                            </td>
                            <td className="py-2 pr-3">{sa.childBom.bomName}</td>
                            <td className="py-2 pr-3 text-right font-mono">{Number(sa.quantity)}</td>
                            <td className="py-2 pr-3 text-muted-foreground">{sa.notes ?? '-'}</td>
                            {isDraft && (
                              <td className="py-2">
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteSubassembly(sa.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Change Log Tab ── */}
          <TabsContent value="changelog">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Change Log</CardTitle>
              </CardHeader>
              <CardContent>
                {changelog.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No changes recorded</p>
                ) : (
                  <div className="space-y-2">
                    {changelog.map((entry) => (
                      <div key={entry.id} className="flex items-center gap-3 border-b py-2 last:border-0">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1">
                          <Badge variant="outline" className="mr-2">{entry.changeType}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(entry.changedAt).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* ── Add Material Dialog ── */}
      <Dialog open={showAddMaterial} onOpenChange={setShowAddMaterial}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Material Line</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Quantity per Unit *</Label><Input type="number" value={materialForm.quantityPerUnit} onChange={(e) => setMaterialForm((f) => ({ ...f, quantityPerUnit: e.target.value }))} /></div>
              <div><Label>UOM</Label><Input value={materialForm.uom} onChange={(e) => setMaterialForm((f) => ({ ...f, uom: e.target.value }))} /></div>
            </div>
            <div><Label>Wastage %</Label><Input type="number" value={materialForm.wastagePercent} onChange={(e) => setMaterialForm((f) => ({ ...f, wastagePercent: e.target.value }))} /></div>
            <div><Label>Notes</Label><Input value={materialForm.notes} onChange={(e) => setMaterialForm((f) => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMaterial(false)}>Cancel</Button>
            <Button onClick={handleAddMaterial} disabled={saving || !materialForm.quantityPerUnit}>
              {saving ? 'Adding...' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Process Dialog ── */}
      <Dialog open={showAddProcess} onOpenChange={setShowAddProcess}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Process Line</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Process *</Label>
              <Select value={processForm.processId} onValueChange={(v) => setProcessForm((f) => ({ ...f, processId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select process" /></SelectTrigger>
                <SelectContent>
                  {processes.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.processCode} — {p.processName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Quantity</Label><Input type="number" value={processForm.quantity} onChange={(e) => setProcessForm((f) => ({ ...f, quantity: e.target.value }))} /></div>
            <div><Label>Notes</Label><Input value={processForm.notes} onChange={(e) => setProcessForm((f) => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddProcess(false)}>Cancel</Button>
            <Button onClick={handleAddProcess} disabled={saving || !processForm.processId}>
              {saving ? 'Adding...' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
