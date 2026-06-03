'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';

interface Category { id: string; categoryCode: string; name: string }
interface MatType { id: string; typeCode: string; name: string }
interface Attribute {
  id: string; attributeCode: string; label: string; fieldType: string;
  isRequired: boolean; placeholder: string | null; helpText: string | null;
  defaultValue: string | null;
}
interface AttrValue { id: string; valueLabel: string; valueShortCode: string }

const STEPS = ['Classification', 'Attributes', 'UOM & Stock', 'Review & Save'];

export default function NewMaterialPage() {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [saving, setSaving] = React.useState(false);

  // Step 1 state
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [types, setTypes] = React.useState<MatType[]>([]);
  const [categoryId, setCategoryId] = React.useState('');
  const [materialTypeId, setMaterialTypeId] = React.useState('');

  // Step 2 state
  const [attrs, setAttrs] = React.useState<Attribute[]>([]);
  const [attrValues, setAttrValues] = React.useState<Record<string, AttrValue[]>>({});
  const [formValues, setFormValues] = React.useState<Record<string, { attributeValueId?: string; rawValue?: string }>>({});

  // Preview
  const [preview, setPreview] = React.useState<{ materialName: string; materialCode: string } | null>(null);

  // Step 3 state
  const [purchaseUom, setPurchaseUom] = React.useState('NOS');
  const [consumptionUom, setConsumptionUom] = React.useState('NOS');
  const [conversionFactor, setConversionFactor] = React.useState('1');
  const [notes, setNotes] = React.useState('');

  React.useEffect(() => {
    Promise.all([
      apiFetch<{ categories: Category[] }>('/api/material/categories'),
      apiFetch<{ materialTypes: MatType[] }>('/api/material/material-types'),
    ]).then(([catData, typeData]) => {
      setCategories(catData.categories);
      setTypes(typeData.materialTypes);
    }).catch(() => toast.error('Failed to load lookup data'));
  }, []);

  // Load attributes when category+type selected
  React.useEffect(() => {
    if (!categoryId || !materialTypeId) return;
    (async () => {
      try {
        const profiles = await apiFetch<Array<{ id: string }>>(`/api/material/category-type-profiles?category_id=${categoryId}&material_type_id=${materialTypeId}`);
        if (!profiles || profiles.length === 0) {
          toast.error('No profile exists for this combination');
          return;
        }
        const profileId = profiles[0].id;
        const attrList = await apiFetch<Attribute[]>(`/api/material/attributes?profile_id=${profileId}`);
        const resolved = Array.isArray(attrList) ? attrList : [];
        setAttrs(resolved);

        // Load values for each dropdown-type attribute
        const valMap: Record<string, AttrValue[]> = {};
        for (const attr of resolved) {
          if (['single_select', 'multi_select', 'dropdown', 'text_autocomplete', 'dimension'].includes(attr.fieldType)) {
            const vals = await apiFetch<AttrValue[]>(`/api/material/attribute-values?attribute_id=${attr.id}`);
            valMap[attr.id] = Array.isArray(vals) ? vals : [];
          }
        }
        setAttrValues(valMap);
        setFormValues({});
      } catch {
        toast.error('Failed to load profile attributes');
      }
    })();
  }, [categoryId, materialTypeId]);

  // Preview name/code when attributes change
  React.useEffect(() => {
    if (step < 2 || attrs.length === 0) return;
    const attrArr = Object.entries(formValues)
      .filter(([, v]) => v.attributeValueId || v.rawValue)
      .map(([attrId, v]) => ({
        attribute_id: attrId,
        attribute_value_id: v.attributeValueId ?? undefined,
        raw_value: v.rawValue ?? undefined,
      }));
    if (attrArr.length === 0) return;

    apiFetch<{ materialName: string; materialCode: string }>('/api/material/materials/preview-name-and-code', {
      method: 'POST',
      body: { category_id: categoryId, material_type_id: materialTypeId, attribute_values: attrArr },
    }).then(setPreview).catch(() => setPreview(null));
  }, [formValues, step, categoryId, materialTypeId, attrs]);

  function setAttrValue(attrId: string, valueId?: string, rawValue?: string) {
    setFormValues((prev) => ({ ...prev, [attrId]: { attributeValueId: valueId, rawValue } }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const attrArr = Object.entries(formValues)
        .filter(([, v]) => v.attributeValueId || v.rawValue)
        .map(([attrId, v]) => ({
          attribute_id: attrId,
          attribute_value_id: v.attributeValueId ?? undefined,
          raw_value: v.rawValue ?? undefined,
        }));

      const data = await apiFetch<{ material: { id: string } }>('/api/material/materials', {
        method: 'POST',
        body: {
          category_id: categoryId,
          material_type_id: materialTypeId,
          attribute_values: attrArr,
          purchase_uom: purchaseUom,
          consumption_uom: consumptionUom,
          conversion_factor: parseFloat(conversionFactor) || 1,
          notes: notes || undefined,
        },
      });
      toast.success('Material created');
      router.push(`/admin/material/materials/${data.material.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create material';
      toast.error(msg);
    }
    setSaving(false);
  }

  function canAdvance() {
    if (step === 0) return categoryId && materialTypeId;
    if (step === 1) {
      for (const attr of attrs) {
        if (!attr.isRequired) continue;
        if (attr.fieldType === 'image_single' || attr.fieldType === 'image_gallery' || attr.fieldType === 'auto_fill') continue;
        const v = formValues[attr.id];
        if (!v || (!v.attributeValueId && !v.rawValue)) return false;
      }
      return true;
    }
    if (step === 2) return purchaseUom && consumptionUom;
    return true;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/material/materials')}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <PageHeader title="New Material" />
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            {i > 0 && <div className="h-px w-8 bg-border" />}
            <button
              onClick={() => i < step && setStep(i)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
                i === step ? 'bg-primary text-primary-foreground' : i < step ? 'bg-green-100 text-green-800 cursor-pointer' : 'bg-muted text-muted-foreground'
              }`}
            >
              {i < step ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>}
              {s}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Preview bar */}
      {preview && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="py-3">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">Preview:</span>
              <span className="font-medium">{preview.materialName}</span>
              <Badge variant="outline">{preview.materialCode}</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1: Classification */}
      {step === 0 && (
        <Card>
          <CardHeader><CardTitle>Step 1: Classification</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.categoryCode})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Material Type</Label>
              <Select value={materialTypeId} onValueChange={setMaterialTypeId}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} ({t.typeCode})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Attributes */}
      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>Step 2: Attributes</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {attrs.filter((a) => a.fieldType !== 'image_single' && a.fieldType !== 'image_gallery' && a.fieldType !== 'auto_fill').map((attr) => {
              const vals = attrValues[attr.id];
              return (
                <div key={attr.id}>
                  <Label>
                    {attr.label}
                    {attr.isRequired && <span className="ml-1 text-red-500">*</span>}
                  </Label>
                  {vals && vals.length > 0 ? (
                    <Select
                      value={formValues[attr.id]?.attributeValueId ?? ''}
                      onValueChange={(v) => setAttrValue(attr.id, v)}
                    >
                      <SelectTrigger><SelectValue placeholder={attr.placeholder ?? `Select ${attr.label}`} /></SelectTrigger>
                      <SelectContent>
                        {vals.map((v) => <SelectItem key={v.id} value={v.id}>{v.valueLabel} ({v.valueShortCode})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : attr.fieldType === 'numeric' || attr.fieldType === 'dimension' ? (
                    <Input
                      type="number"
                      placeholder={attr.placeholder ?? ''}
                      value={formValues[attr.id]?.rawValue ?? ''}
                      onChange={(e) => setAttrValue(attr.id, undefined, e.target.value)}
                    />
                  ) : (
                    <Input
                      placeholder={attr.placeholder ?? ''}
                      value={formValues[attr.id]?.rawValue ?? ''}
                      onChange={(e) => setAttrValue(attr.id, undefined, e.target.value)}
                    />
                  )}
                  {attr.helpText && <p className="mt-1 text-xs text-muted-foreground">{attr.helpText}</p>}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Step 3: UOM & Stock */}
      {step === 2 && (
        <Card>
          <CardHeader><CardTitle>Step 3: UOM & Stock</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Purchase UOM <span className="text-red-500">*</span></Label>
                <Input value={purchaseUom} onChange={(e) => setPurchaseUom(e.target.value)} />
              </div>
              <div>
                <Label>Consumption UOM <span className="text-red-500">*</span></Label>
                <Input value={consumptionUom} onChange={(e) => setConsumptionUom(e.target.value)} />
              </div>
              <div>
                <Label>Conversion Factor</Label>
                <Input type="number" value={conversionFactor} onChange={(e) => setConversionFactor(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Review */}
      {step === 3 && (
        <Card>
          <CardHeader><CardTitle>Step 4: Review & Save</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Category:</span>{' '}
                <span className="font-medium">{categories.find((c) => c.id === categoryId)?.name}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Type:</span>{' '}
                <span className="font-medium">{types.find((t) => t.id === materialTypeId)?.name}</span>
              </div>
            </div>
            <div className="space-y-1 text-sm">
              {attrs.filter((a) => formValues[a.id]).map((attr) => {
                const v = formValues[attr.id];
                const val = attrValues[attr.id]?.find((av) => av.id === v?.attributeValueId);
                return (
                  <div key={attr.id} className="flex gap-2">
                    <span className="text-muted-foreground w-40">{attr.label}:</span>
                    <span className="font-medium">{val ? `${val.valueLabel} (${val.valueShortCode})` : v?.rawValue}</span>
                  </div>
                );
              })}
            </div>
            {preview && (
              <div className="rounded border bg-muted/50 p-3 text-sm">
                <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{preview.materialName}</span></div>
                <div><span className="text-muted-foreground">Code:</span> <Badge variant="outline">{preview.materialCode}</Badge></div>
              </div>
            )}
            <div className="text-sm">
              <div><span className="text-muted-foreground">UOM:</span> {purchaseUom} → {consumptionUom} (×{conversionFactor})</div>
              {notes && <div><span className="text-muted-foreground">Notes:</span> {notes}</div>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Previous
        </Button>
        {step < STEPS.length - 1 ? (
          <Button disabled={!canAdvance()} onClick={() => setStep((s) => s + 1)}>
            Next <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <Button disabled={saving} onClick={handleSave}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Material
          </Button>
        )}
      </div>
    </div>
  );
}
