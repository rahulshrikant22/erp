'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { type ColumnDef } from '@tanstack/react-table';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Plus, ImageOff } from 'lucide-react';

/* ---------- Types ---------- */

interface Category {
  id: string;
  categoryCode: string;
  name: string;
}

interface MaterialType {
  id: string;
  typeCode: string;
  name: string;
}

interface Manufacturer {
  id: string;
  manufacturerCode: string;
  name: string;
}

interface Material {
  id: string;
  materialCode: string;
  materialName: string;
  category: { categoryCode: string; name: string };
  materialType: { typeCode: string; name: string };
  manufacturer: { manufacturerCode: string; name: string };
  isActive: boolean;
  hasPendingImage: boolean;
  updatedAt: string;
}

interface MaterialsResponse {
  total: number;
  page: number;
  limit: number;
  materials: Material[];
}

/* ---------- Columns ---------- */

const columns: ColumnDef<Material>[] = [
  { accessorKey: 'materialCode', header: 'Code' },
  { accessorKey: 'materialName', header: 'Name' },
  {
    id: 'category',
    header: 'Category',
    cell: ({ row }) => (
      <Badge variant="outline">{row.original.category?.categoryCode ?? '-'}</Badge>
    ),
  },
  {
    id: 'type',
    header: 'Type',
    cell: ({ row }) => (
      <Badge variant="secondary">{row.original.materialType?.typeCode ?? '-'}</Badge>
    ),
  },
  {
    id: 'manufacturer',
    header: 'Manufacturer',
    cell: ({ row }) => row.original.manufacturer?.manufacturerCode ?? '-',
  },
  {
    accessorKey: 'isActive',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={row.original.isActive ? 'default' : 'destructive'}>
        {row.original.isActive ? 'active' : 'inactive'}
      </Badge>
    ),
  },
  {
    accessorKey: 'hasPendingImage',
    header: 'Image',
    cell: ({ row }) =>
      row.original.hasPendingImage ? (
        <ImageOff className="h-4 w-4 text-amber-500" />
      ) : null,
  },
  {
    accessorKey: 'updatedAt',
    header: 'Updated',
    cell: ({ row }) => {
      const d = row.original.updatedAt;
      if (!d) return '-';
      return new Date(d).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    },
  },
];

/* ---------- Page ---------- */

export default function MaterialsPage() {
  const router = useRouter();

  /* Data */
  const [materials, setMaterials] = React.useState<Material[] | null>(null);
  const [total, setTotal] = React.useState(0);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [materialTypes, setMaterialTypes] = React.useState<MaterialType[]>([]);
  const [manufacturers, setManufacturers] = React.useState<Manufacturer[]>([]);

  /* Filters */
  const [search, setSearch] = React.useState('');
  const [catFilter, setCatFilter] = React.useState('all');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [mfrFilter, setMfrFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [pendingImages, setPendingImages] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const limit = 50;

  /* Fetch filter options once on mount */
  React.useEffect(() => {
    apiFetch<{ categories: Category[] }>('/api/material/categories')
      .then((res) => setCategories(res.categories))
      .catch(() => {});
    apiFetch<{ materialTypes: MaterialType[] }>('/api/material/material-types')
      .then((res) => setMaterialTypes(res.materialTypes))
      .catch(() => {});
    apiFetch<{ manufacturers: Manufacturer[] }>('/api/material/manufacturers')
      .then((res) => setManufacturers(res.manufacturers))
      .catch(() => {});
  }, []);

  /* Fetch materials */
  const fetchMaterials = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (catFilter !== 'all') params.set('category_id', catFilter);
      if (typeFilter !== 'all') params.set('material_type_id', typeFilter);
      if (mfrFilter !== 'all') params.set('manufacturer_id', mfrFilter);
      if (statusFilter === 'active') params.set('is_active', '1');
      if (statusFilter === 'inactive') params.set('is_active', '0');
      if (pendingImages) params.set('has_pending_image', '1');
      params.set('page', String(page));
      params.set('limit', String(limit));
      const res = await apiFetch<MaterialsResponse>(
        `/api/material/materials?${params}`,
      );
      setMaterials(res.materials);
      setTotal(res.total);
    } catch {
      toast.error('Failed to load materials');
      setMaterials([]);
    }
  }, [search, catFilter, typeFilter, mfrFilter, statusFilter, pendingImages, page]);

  /* Reset to page 1 when any filter changes */
  React.useEffect(() => {
    setPage(1);
  }, [search, catFilter, typeFilter, mfrFilter, statusFilter, pendingImages]);

  React.useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Materials"
        description={materials ? `${total} material${total === 1 ? '' : 's'}` : 'Loading...'}
        actions={
          <Button size="sm" onClick={() => router.push('/admin/material/materials/new')}>
            <Plus className="h-4 w-4 mr-1" />New Material
          </Button>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 flex flex-wrap items-center gap-3">
          <Input
            placeholder="Search code, name..."
            className="w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {materialTypes.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={mfrFilter} onValueChange={setMfrFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Manufacturers</SelectItem>
              {manufacturers.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Switch
              id="pending-images"
              checked={pendingImages}
              onCheckedChange={setPendingImages}
            />
            <Label htmlFor="pending-images" className="text-sm whitespace-nowrap cursor-pointer">
              Pending Images
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <DataTable
        columns={columns}
        data={materials ?? []}
        loading={materials === null}
        pageSize={limit}
        onRowClick={(row) => router.push(`/admin/material/materials/${row.id}`)}
      />

      {/* Server-side pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages} ({total} total)
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
