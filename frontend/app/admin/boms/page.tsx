'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';

interface Bom {
  id: string;
  bomCode: string;
  bomName: string;
  status: string;
  currentVersion: number;
  product: { id: string; productCode: string; productName: string };
  sizeVariant: { id: string; variantName: string } | null;
  updatedAt: string;
}

interface Product {
  id: string;
  productCode: string;
  productName: string;
  sizeVariants?: { id: string; variantName: string }[];
}

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  active: 'default',
  archived: 'destructive',
};

const columns: ColumnDef<Bom>[] = [
  { accessorKey: 'bomCode', header: 'BOM Code' },
  { accessorKey: 'bomName', header: 'Name' },
  {
    id: 'product',
    header: 'Product',
    cell: ({ row }) => (
      <span>
        <Badge variant="outline" className="mr-1">{row.original.product.productCode}</Badge>
        {row.original.product.productName}
      </span>
    ),
  },
  {
    id: 'variant',
    header: 'Variant',
    cell: ({ row }) => row.original.sizeVariant?.variantName ?? '-',
  },
  {
    accessorKey: 'currentVersion',
    header: 'Version',
    cell: ({ row }) => `v${row.original.currentVersion}`,
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
];

export default function BomsPage() {
  const router = useRouter();
  const [boms, setBoms] = React.useState<Bom[] | null>(null);
  const [products, setProducts] = React.useState<Product[]>([]);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [showCreate, setShowCreate] = React.useState(false);
  const [form, setForm] = React.useState({ productId: '', sizeVariantId: '', description: '' });
  const [saving, setSaving] = React.useState(false);

  const selectedProduct = products.find((p) => p.id === form.productId);

  const fetchBoms = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await apiFetch<{ boms: Bom[]; total: number }>(`/api/boms?${params}`);
      setBoms(res.boms);
    } catch {
      setBoms([]);
    }
  }, [search, statusFilter]);

  const fetchProducts = React.useCallback(async () => {
    try {
      const res = await apiFetch<{ products: Product[] }>('/api/products?limit=200');
      setProducts(res.products);
    } catch { /* ignore */ }
  }, []);

  React.useEffect(() => { fetchBoms(); }, [fetchBoms]);
  React.useEffect(() => { fetchProducts(); }, [fetchProducts]);

  async function handleCreate() {
    setSaving(true);
    try {
      const res = await apiFetch<{ bom: Bom }>('/api/boms', {
        method: 'POST',
        body: {
          product_id: form.productId,
          product_size_variant_id: form.sizeVariantId || null,
          description: form.description || null,
        },
      });
      toast.success(`BOM ${res.bom.bomCode} created`);
      setShowCreate(false);
      setForm({ productId: '', sizeVariantId: '', description: '' });
      fetchBoms();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to create BOM');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bill of Materials"
        description={boms ? `${boms.length} BOMs` : 'Loading...'}
        actions={<Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" />New BOM</Button>}
      />

      <Card>
        <CardContent className="pt-4 flex flex-wrap gap-3">
          <Input placeholder="Search code, name..." className="w-64" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <DataTable columns={columns} data={boms ?? []} loading={boms === null} pageSize={20} onRowClick={(row) => router.push(`/admin/boms/${row.id}`)} />

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Bill of Materials</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Product *</Label>
              <Select value={form.productId} onValueChange={(v) => setForm((f) => ({ ...f, productId: v, sizeVariantId: '' }))}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.productCode} — {p.productName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedProduct?.sizeVariants && selectedProduct.sizeVariants.length > 0 && (
              <div>
                <Label>Size Variant</Label>
                <Select value={form.sizeVariantId} onValueChange={(v) => setForm((f) => ({ ...f, sizeVariantId: v }))}>
                  <SelectTrigger><SelectValue placeholder="All sizes (optional)" /></SelectTrigger>
                  <SelectContent>
                    {selectedProduct.sizeVariants.map((sv) => (
                      <SelectItem key={sv.id} value={sv.id}>{sv.variantName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !form.productId}>
              {saving ? 'Creating...' : 'Create BOM'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
