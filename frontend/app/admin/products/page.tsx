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

interface Product {
  id: string;
  productCode: string;
  productName: string;
  categoryId: string;
  category?: { name: string };
  basePrice: number;
  taxRatePercent: number;
  hsnCode: string | null;
  uom: string;
  isActive: boolean;
  isCustom: boolean;
}

interface Category {
  id: string;
  categoryCode: string;
  name: string;
}

const columns: ColumnDef<Product>[] = [
  { accessorKey: 'productCode', header: 'Code' },
  { accessorKey: 'productName', header: 'Name' },
  {
    id: 'category',
    header: 'Category',
    cell: ({ row }) => <Badge variant="outline">{row.original.category?.name ?? '-'}</Badge>,
  },
  { accessorKey: 'hsnCode', header: 'HSN', cell: ({ row }) => row.original.hsnCode || '-' },
  {
    accessorKey: 'basePrice',
    header: 'Base Price',
    cell: ({ row }) => `₹${Number(row.original.basePrice).toLocaleString('en-IN')}`,
  },
  { accessorKey: 'taxRatePercent', header: 'Tax %' },
  { accessorKey: 'uom', header: 'UOM' },
  {
    accessorKey: 'isActive',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={row.original.isActive ? 'default' : 'destructive'}>
        {row.original.isActive ? 'active' : 'inactive'}
      </Badge>
    ),
  },
];

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = React.useState<Product[] | null>(null);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [search, setSearch] = React.useState('');
  const [catFilter, setCatFilter] = React.useState('all');
  const [showCreate, setShowCreate] = React.useState(false);
  const [form, setForm] = React.useState({
    productName: '',
    categoryId: '',
    basePrice: '',
    taxRatePercent: '18',
    hsnCode: '',
    uom: 'PCS',
  });
  const [saving, setSaving] = React.useState(false);

  const fetchProducts = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (catFilter !== 'all') params.set('category', catFilter);
      const res = await apiFetch<{ products: Product[]; total: number }>(`/api/products?${params}`);
      setProducts(res.products);
    } catch {
      setProducts([]);
    }
  }, [search, catFilter]);

  const fetchCategories = React.useCallback(async () => {
    try {
      const res = await apiFetch<{ categories: Category[] }>('/api/product-categories');
      setCategories(res.categories);
    } catch { /* ignore */ }
  }, []);

  React.useEffect(() => { fetchProducts(); }, [fetchProducts]);
  React.useEffect(() => { fetchCategories(); }, [fetchCategories]);

  async function handleCreate() {
    setSaving(true);
    try {
      await apiFetch('/api/products', {
        method: 'POST',
        body: {
          productName: form.productName,
          categoryId: form.categoryId,
          basePrice: Number(form.basePrice),
          taxRatePercent: Number(form.taxRatePercent),
          hsnCode: form.hsnCode || undefined,
          uom: form.uom,
        },
      });
      toast.success('Product created');
      setShowCreate(false);
      setForm({ productName: '', categoryId: '', basePrice: '', taxRatePercent: '18', hsnCode: '', uom: 'PCS' });
      fetchProducts();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to create product');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Products"
        description={products ? `${products.length} products` : 'Loading...'}
        actions={<Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" />Add Product</Button>}
      />

      <Card>
        <CardContent className="pt-4 flex flex-wrap gap-3">
          <Input placeholder="Search name, code, HSN..." className="w-64" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <DataTable columns={columns} data={products ?? []} loading={products === null} pageSize={20} onRowClick={(row) => router.push(`/admin/products/${row.id}`)} />

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Product</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Name *</Label><Input value={form.productName} onChange={e => setForm(f => ({ ...f, productName: e.target.value }))} /></div>
            <div><Label>Category *</Label>
              <Select value={form.categoryId} onValueChange={v => setForm(f => ({ ...f, categoryId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Base Price (₹) *</Label><Input type="number" value={form.basePrice} onChange={e => setForm(f => ({ ...f, basePrice: e.target.value }))} /></div>
              <div><Label>Tax Rate % *</Label><Input type="number" value={form.taxRatePercent} onChange={e => setForm(f => ({ ...f, taxRatePercent: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>HSN Code</Label><Input value={form.hsnCode} onChange={e => setForm(f => ({ ...f, hsnCode: e.target.value }))} placeholder="94036090" /></div>
              <div><Label>UOM</Label><Input value={form.uom} onChange={e => setForm(f => ({ ...f, uom: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !form.productName || !form.categoryId || !form.basePrice}>
              {saving ? 'Saving...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
