'use client';
import * as React from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Package, AlertTriangle, TrendingDown } from 'lucide-react';

interface StockItem {
  id: string;
  material: { id: string; materialCode: string; materialName: string };
  location: { id: string; locationName: string };
  category: string;
  currentQty: number;
  reservedSoft: number;
  reservedHard: number;
  availableQty: number;
  valuationAmount: string;
  uom: string;
  isLowStock: boolean;
}

interface InventoryKPIs {
  totalStockValue: string;
  materialsAtReorder: number;
  recentMovementsCount: number;
}

const columns: ColumnDef<StockItem>[] = [
  {
    id: 'material',
    header: 'Material',
    cell: ({ row }) => (
      <span className="flex items-center gap-1">
        <Badge variant="outline" className="mr-1">{row.original.material.materialCode}</Badge>
        {row.original.material.materialName}
        {row.original.isLowStock && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
      </span>
    ),
  },
  {
    id: 'location',
    header: 'Location',
    cell: ({ row }) => row.original.location.locationName,
  },
  { accessorKey: 'category', header: 'Category', cell: ({ row }) => <Badge variant="secondary">{row.original.category}</Badge> },
  { accessorKey: 'currentQty', header: 'Current', cell: ({ row }) => <span className="font-mono">{row.original.currentQty}</span> },
  { accessorKey: 'reservedSoft', header: 'Reserved (Soft)', cell: ({ row }) => <span className="font-mono">{row.original.reservedSoft}</span> },
  { accessorKey: 'reservedHard', header: 'Reserved (Hard)', cell: ({ row }) => <span className="font-mono">{row.original.reservedHard}</span> },
  {
    accessorKey: 'availableQty',
    header: 'Available',
    cell: ({ row }) => <span className={`font-mono font-medium ${row.original.availableQty <= 0 ? 'text-destructive' : ''}`}>{row.original.availableQty}</span>,
  },
  {
    accessorKey: 'valuationAmount',
    header: 'Valuation',
    cell: ({ row }) => `₹${Number(row.original.valuationAmount).toLocaleString('en-IN')}`,
  },
  { accessorKey: 'uom', header: 'UOM' },
];

export default function InventoryPage() {
  const [stock, setStock] = React.useState<StockItem[] | null>(null);
  const [kpis, setKPIs] = React.useState<InventoryKPIs | null>(null);
  const [search, setSearch] = React.useState('');
  const [locationFilter, setLocationFilter] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState('');
  const [lowStockOnly, setLowStockOnly] = React.useState(false);

  const fetchStock = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (locationFilter) params.set('location_search', locationFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (lowStockOnly) params.set('low_stock', '1');
      const res = await apiFetch<{ stockItems: StockItem[]; total: number }>(`/api/inventory/stock?${params}`);
      setStock(res.stockItems);
    } catch {
      setStock([]);
    }
  }, [search, locationFilter, categoryFilter, lowStockOnly]);

  const fetchKPIs = React.useCallback(async () => {
    try {
      const res = await apiFetch<{ kpis: InventoryKPIs }>('/api/inventory/kpis');
      setKPIs(res.kpis);
    } catch { /* ignore */ }
  }, []);

  React.useEffect(() => { fetchStock(); }, [fetchStock]);
  React.useEffect(() => { fetchKPIs(); }, [fetchKPIs]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Inventory"
        description={stock ? `${stock.length} stock records` : 'Loading...'}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <Package className="h-8 w-8 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Total Stock Value</p>
              <p className="text-xl font-semibold">{kpis ? `₹${Number(kpis.totalStockValue).toLocaleString('en-IN')}` : '-'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
            <div>
              <p className="text-xs text-muted-foreground">Materials at Reorder</p>
              <p className="text-xl font-semibold">{kpis?.materialsAtReorder ?? '-'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <TrendingDown className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Recent Movements</p>
              <p className="text-xl font-semibold">{kpis?.recentMovementsCount ?? '-'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-4 flex flex-wrap items-center gap-3">
          <Input placeholder="Search material..." className="w-56" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Input placeholder="Location..." className="w-40" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} />
          <Input placeholder="Category..." className="w-40" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} />
          <div className="flex items-center gap-2">
            <Switch id="low-stock" checked={lowStockOnly} onCheckedChange={setLowStockOnly} />
            <Label htmlFor="low-stock" className="text-sm whitespace-nowrap cursor-pointer">Low Stock Only</Label>
          </div>
        </CardContent>
      </Card>

      <DataTable columns={columns} data={stock ?? []} loading={stock === null} pageSize={20} />
    </div>
  );
}
