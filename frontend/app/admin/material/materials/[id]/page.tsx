'use client';
import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Upload, Image as ImageIcon, Trash2 } from 'lucide-react';

interface Material {
  id: string;
  materialCode: string;
  materialName: string;
  category: { categoryCode: string; name: string };
  materialType: { typeCode: string; name: string };
  manufacturer: { manufacturerCode: string; name: string };
  attributeHash: string;
  purchaseUom: string;
  consumptionUom: string;
  uomConversionFactor: string;
  minStockLevel: string | null;
  reorderLevel: string | null;
  maxStockLevel: string | null;
  primaryImagePath: string | null;
  hasPendingImage: boolean;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  attributeValues: Array<{
    attribute: { attributeCode: string; label: string; fieldType: string };
    attributeValue: { valueLabel: string; valueShortCode: string } | null;
    rawValue: string | null;
  }>;
}

interface MaterialImage {
  id: string;
  imagePath: string;
  imageType: string;
  isPrimary: boolean;
  displayOrder: number;
  url: string;
}

export default function MaterialDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [material, setMaterial] = React.useState<Material | null>(null);
  const [images, setImages] = React.useState<MaterialImage[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [editNotes, setEditNotes] = React.useState('');
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [mat, imgs] = await Promise.all([
        apiFetch<{ material: Material }>(`/api/material/materials/${id}`),
        apiFetch<{ images: MaterialImage[] }>(`/api/material/materials/${id}/images`),
      ]);
      setMaterial(mat.material);
      setImages(imgs.images);
      setEditNotes(mat.material.notes ?? '');
    } catch {
      toast.error('Failed to load material');
    }
    setLoading(false);
  }, [id]);

  React.useEffect(() => { load(); }, [load]);

  async function handleSaveNotes() {
    setSaving(true);
    try {
      await apiFetch(`/api/material/materials/${id}`, {
        method: 'PUT',
        body: { notes: editNotes },
      });
      toast.success('Notes updated');
      load();
    } catch {
      toast.error('Failed to save');
    }
    setSaving(false);
  }

  async function handleDeactivate() {
    if (!confirm('Deactivate this material?')) return;
    try {
      await apiFetch(`/api/material/materials/${id}`, { method: 'DELETE' });
      toast.success('Material deactivated');
      router.push('/admin/material/materials');
    } catch {
      toast.error('Failed to deactivate');
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append('files', f);
      await apiFetch(`/api/material/materials/${id}/images?image_type=full&is_primary=${images.length === 0 ? 'true' : 'false'}`, {
        formData: fd,
      });
      toast.success('Images uploaded');
      load();
    } catch {
      toast.error('Upload failed');
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSetPrimary(imgId: string) {
    try {
      await apiFetch(`/api/material/material-images/${imgId}/set-primary`, { method: 'POST' });
      toast.success('Primary image updated');
      load();
    } catch {
      toast.error('Failed to set primary');
    }
  }

  async function handleDeleteImage(imgId: string) {
    try {
      await apiFetch(`/api/material/material-images/${imgId}`, { method: 'DELETE' });
      toast.success('Image deleted');
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!material) {
    return <div className="p-6 text-center text-muted-foreground">Material not found</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/admin/material/materials')}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <PageHeader title={material.materialName} />
          <Badge variant="outline">{material.materialCode}</Badge>
          <Badge variant={material.isActive ? 'default' : 'destructive'}>
            {material.isActive ? 'Active' : 'Inactive'}
          </Badge>
          {material.hasPendingImage && <Badge variant="secondary">Pending Image</Badge>}
        </div>
        {material.isActive && (
          <Button variant="destructive" size="sm" onClick={handleDeactivate}>Deactivate</Button>
        )}
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="images">Images ({images.length})</TabsTrigger>
          <TabsTrigger value="used-in">Used In</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-4">
          {/* Classification */}
          <Card>
            <CardHeader><CardTitle className="text-base">Classification</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Category</span>
                  <p className="font-medium">{material.category.name} ({material.category.categoryCode})</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Type</span>
                  <p className="font-medium">{material.materialType.name} ({material.materialType.typeCode})</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Manufacturer</span>
                  <p className="font-medium">{material.manufacturer.name} ({material.manufacturer.manufacturerCode})</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Attributes */}
          <Card>
            <CardHeader><CardTitle className="text-base">Attributes</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {material.attributeValues.map((av, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-muted-foreground min-w-[140px]">{av.attribute.label}:</span>
                    <span className="font-medium">
                      {av.attributeValue
                        ? `${av.attributeValue.valueLabel} (${av.attributeValue.valueShortCode})`
                        : av.rawValue ?? '-'}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* UOM */}
          <Card>
            <CardHeader><CardTitle className="text-base">UOM & Stock</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Purchase UOM</span>
                  <p className="font-medium">{material.purchaseUom}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Consumption UOM</span>
                  <p className="font-medium">{material.consumptionUom}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Conversion Factor</span>
                  <p className="font-medium">{material.uomConversionFactor}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3} />
              <Button size="sm" disabled={saving} onClick={handleSaveNotes}>
                {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Save Notes
              </Button>
            </CardContent>
          </Card>

          {/* Meta */}
          <div className="text-xs text-muted-foreground">
            Hash: {material.attributeHash.slice(0, 16)}... | Created: {new Date(material.createdAt).toLocaleString()} | Updated: {new Date(material.updatedAt).toLocaleString()}
          </div>
        </TabsContent>

        <TabsContent value="images" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Images</CardTitle>
              <div>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />
                <Button size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                  {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
                  Upload
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {images.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                  <ImageIcon className="h-10 w-10" />
                  <p className="text-sm">No images uploaded</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                  {images.map((img) => (
                    <div key={img.id} className="group relative rounded border p-2">
                      <div className="aspect-square overflow-hidden rounded bg-muted">
                        <img src={img.url} alt={img.imageType} className="h-full w-full object-cover" />
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs">
                        <Badge variant="outline">{img.imageType}</Badge>
                        {img.isPrimary && <Badge>Primary</Badge>}
                      </div>
                      <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
                        {!img.isPrimary && (
                          <Button size="sm" variant="secondary" className="h-6 px-2 text-xs" onClick={() => handleSetPrimary(img.id)}>
                            Primary
                          </Button>
                        )}
                        <Button size="sm" variant="destructive" className="h-6 px-2" onClick={() => handleDeleteImage(img.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="used-in">
          <Card>
            <CardHeader><CardTitle className="text-base">Used In BOMs</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">BOM tracking will be available after Phase 2 BOM prompts are built.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
