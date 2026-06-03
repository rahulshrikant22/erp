'use client';
import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { type ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { ArrowLeft, Plus, GripVertical } from 'lucide-react';

interface Attribute {
  id: string;
  attributeCode: string;
  label: string;
  fieldType: string;
  displayOrder: number;
  displayGroup: string | null;
  isRequired: boolean;
  isIdentity: boolean;
  feedsName: boolean;
  feedsSku: boolean;
  namePosition: number | null;
  skuPosition: number | null;
  isManufacturerScoped: boolean;
}

interface VisRule {
  id: string;
  attributeId: string;
  dependsOnAttributeId: string;
  conditionOperator: string;
  conditionValues: string[];
  action: string;
}

interface ValDep {
  id: string;
  attributeId: string;
  dependsOnAttributeId: string;
  filterMap: unknown;
}

interface AttrValue {
  id: string;
  valueLabel: string;
  valueShortCode: string;
  displayOrder: number;
  manufacturerId: string | null;
}

const FIELD_TYPES = [
  'single_select', 'multi_select', 'text_free', 'text_autocomplete',
  'numeric', 'dimension', 'boolean', 'color', 'date',
  'image_single', 'image_gallery', 'auto_fill',
];

const columns: ColumnDef<Attribute>[] = [
  { accessorKey: 'displayOrder', header: '#', cell: ({ row }) => <GripVertical className="h-4 w-4 text-muted-foreground" /> },
  { accessorKey: 'attributeCode', header: 'Code' },
  { accessorKey: 'label', header: 'Label' },
  {
    accessorKey: 'fieldType', header: 'Field Type',
    cell: ({ row }) => <Badge variant="outline">{row.original.fieldType}</Badge>,
  },
  {
    id: 'flags', header: 'Flags',
    cell: ({ row }) => {
      const a = row.original;
      const flags = [];
      if (a.isRequired) flags.push('Req');
      if (a.isIdentity) flags.push('ID');
      if (a.feedsName) flags.push(`Name:${a.namePosition}`);
      if (a.feedsSku) flags.push(`SKU:${a.skuPosition}`);
      if (a.isManufacturerScoped) flags.push('Mfr');
      return (
        <div className="flex flex-wrap gap-1">
          {flags.map((f) => <Badge key={f} variant="secondary" className="text-xs">{f}</Badge>)}
        </div>
      );
    },
  },
];

export default function ProfileAttributesPage() {
  const params = useParams();
  const router = useRouter();
  const profileId = params.id as string;

  const [attrs, setAttrs] = React.useState<Attribute[]>([]);
  const [visRules, setVisRules] = React.useState<VisRule[]>([]);
  const [valDeps, setValDeps] = React.useState<ValDep[]>([]);
  const [profileName, setProfileName] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  // Add/edit attribute modal
  const [showAttrModal, setShowAttrModal] = React.useState(false);
  const [editingAttr, setEditingAttr] = React.useState<Attribute | null>(null);
  const [attrForm, setAttrForm] = React.useState({
    attributeCode: '', label: '', fieldType: 'single_select',
    displayOrder: 10, isRequired: false, isIdentity: false,
    feedsName: false, feedsSku: false,
    namePosition: '', skuPosition: '',
    isManufacturerScoped: false,
  });

  // Values panel
  const [selectedAttrId, setSelectedAttrId] = React.useState<string | null>(null);
  const [attrValues, setAttrValues] = React.useState<AttrValue[]>([]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [attrData, rulesData, depsData] = await Promise.all([
        apiFetch<{ attributes: Attribute[] }>(`/api/material/attributes?profile_id=${profileId}`),
        apiFetch<{ rules: VisRule[] }>(`/api/material/visibility-rules?profile_id=${profileId}`),
        apiFetch<{ dependencies: ValDep[] }>(`/api/material/value-dependencies?profile_id=${profileId}`),
      ]);
      // Fix: the API returns arrays directly for attributes endpoint
      setAttrs('attributes' in attrData ? attrData.attributes : (attrData as unknown as Attribute[]));
      setVisRules('rules' in rulesData ? rulesData.rules : []);
      setValDeps('dependencies' in depsData ? depsData.dependencies : []);
    } catch {
      toast.error('Failed to load profile data');
    }
    setLoading(false);
  }, [profileId]);

  React.useEffect(() => { load(); }, [load]);

  const loadValues = React.useCallback(async (attrId: string) => {
    try {
      const data = await apiFetch<AttrValue[]>(`/api/material/attribute-values?attribute_id=${attrId}`);
      setAttrValues(Array.isArray(data) ? data : []);
    } catch {
      setAttrValues([]);
    }
  }, []);

  function openAddAttr() {
    setEditingAttr(null);
    setAttrForm({
      attributeCode: '', label: '', fieldType: 'single_select',
      displayOrder: (attrs.length + 1) * 10, isRequired: false, isIdentity: false,
      feedsName: false, feedsSku: false, namePosition: '', skuPosition: '',
      isManufacturerScoped: false,
    });
    setShowAttrModal(true);
  }

  function openEditAttr(attr: Attribute) {
    setEditingAttr(attr);
    setAttrForm({
      attributeCode: attr.attributeCode,
      label: attr.label,
      fieldType: attr.fieldType,
      displayOrder: attr.displayOrder,
      isRequired: attr.isRequired,
      isIdentity: attr.isIdentity,
      feedsName: attr.feedsName,
      feedsSku: attr.feedsSku,
      namePosition: attr.namePosition?.toString() ?? '',
      skuPosition: attr.skuPosition?.toString() ?? '',
      isManufacturerScoped: attr.isManufacturerScoped,
    });
    setShowAttrModal(true);
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/material/categories')}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <PageHeader title={`Profile: ${profileName || profileId.slice(0, 8)}`} />
      </div>

      {/* Attributes Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Attributes</CardTitle>
          <Button size="sm" onClick={openAddAttr}><Plus className="mr-1 h-4 w-4" /> Add Attribute</Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <DataTable
              columns={columns}
              data={attrs}
              onRowClick={(row) => {
                setSelectedAttrId(row.id);
                loadValues(row.id);
                openEditAttr(row);
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* Visibility Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Visibility Rules ({visRules.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {visRules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No visibility rules defined</p>
          ) : (
            <div className="space-y-2">
              {visRules.map((r) => {
                const target = attrs.find((a) => a.id === r.attributeId);
                const source = attrs.find((a) => a.id === r.dependsOnAttributeId);
                return (
                  <div key={r.id} className="flex items-center gap-2 rounded border p-2 text-sm">
                    <Badge variant="outline">{r.action}</Badge>
                    <span className="font-medium">{target?.label ?? r.attributeId.slice(0, 8)}</span>
                    <span className="text-muted-foreground">when</span>
                    <span className="font-medium">{source?.label ?? r.dependsOnAttributeId.slice(0, 8)}</span>
                    <span className="text-muted-foreground">{r.conditionOperator}</span>
                    <span>{JSON.stringify(r.conditionValues)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Value Dependencies */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Value Dependencies ({valDeps.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {valDeps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No value dependencies defined</p>
          ) : (
            <div className="space-y-2">
              {valDeps.map((d) => {
                const target = attrs.find((a) => a.id === d.attributeId);
                const source = attrs.find((a) => a.id === d.dependsOnAttributeId);
                return (
                  <div key={d.id} className="flex items-center gap-2 rounded border p-2 text-sm">
                    <span className="font-medium">{target?.label ?? '?'}</span>
                    <span className="text-muted-foreground">filtered by</span>
                    <span className="font-medium">{source?.label ?? '?'}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attribute Values for selected attribute */}
      {selectedAttrId && attrValues.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Values ({attrValues.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {attrValues.map((v) => (
                <div key={v.id} className="flex items-center gap-3 rounded border p-2 text-sm">
                  <Badge variant="secondary">{v.valueShortCode}</Badge>
                  <span>{v.valueLabel}</span>
                  <span className="text-xs text-muted-foreground">order: {v.displayOrder}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Attribute Modal */}
      <Dialog open={showAttrModal} onOpenChange={setShowAttrModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingAttr ? 'Edit Attribute' : 'Add Attribute'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Code</Label>
                <Input value={attrForm.attributeCode} onChange={(e) => setAttrForm((f) => ({ ...f, attributeCode: e.target.value }))} disabled={!!editingAttr} />
              </div>
              <div>
                <Label>Label</Label>
                <Input value={attrForm.label} onChange={(e) => setAttrForm((f) => ({ ...f, label: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Field Type</Label>
                <Select value={attrForm.fieldType} onValueChange={(v) => setAttrForm((f) => ({ ...f, fieldType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((ft) => <SelectItem key={ft} value={ft}>{ft}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Display Order</Label>
                <Input type="number" value={attrForm.displayOrder} onChange={(e) => setAttrForm((f) => ({ ...f, displayOrder: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Switch checked={attrForm.isRequired} onCheckedChange={(v) => setAttrForm((f) => ({ ...f, isRequired: v }))} />
                <Label>Required</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={attrForm.isIdentity} onCheckedChange={(v) => setAttrForm((f) => ({ ...f, isIdentity: v }))} />
                <Label>Identity</Label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Switch checked={attrForm.feedsName} onCheckedChange={(v) => setAttrForm((f) => ({ ...f, feedsName: v }))} />
                <Label>Feeds Name</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={attrForm.feedsSku} onCheckedChange={(v) => setAttrForm((f) => ({ ...f, feedsSku: v }))} />
                <Label>Feeds SKU</Label>
              </div>
            </div>
            {attrForm.feedsName && (
              <div>
                <Label>Name Position</Label>
                <Input type="number" value={attrForm.namePosition} onChange={(e) => setAttrForm((f) => ({ ...f, namePosition: e.target.value }))} />
              </div>
            )}
            {attrForm.feedsSku && (
              <div>
                <Label>SKU Position</Label>
                <Input type="number" value={attrForm.skuPosition} onChange={(e) => setAttrForm((f) => ({ ...f, skuPosition: e.target.value }))} />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch checked={attrForm.isManufacturerScoped} onCheckedChange={(v) => setAttrForm((f) => ({ ...f, isManufacturerScoped: v }))} />
              <Label>Manufacturer Scoped</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAttrModal(false)}>Cancel</Button>
            <Button onClick={() => { setShowAttrModal(false); toast.info('Attribute management via API coming in future update'); }}>
              {editingAttr ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
