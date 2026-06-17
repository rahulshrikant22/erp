'use client';
import * as React from 'react';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/common/page-header';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PackageCheck, ArrowRightLeft, ClipboardList, Search } from 'lucide-react';

interface DashboardData {
  pendingGRNs: number;
  pendingMINs: number;
  activeStockCounts: number;
}

interface StockLookupResult {
  materialCode: string;
  materialName: string;
  location: string;
  currentQty: number;
  availableQty: number;
  uom: string;
}

export default function StoreKeeperPage() {
  const [dashboard, setDashboard] = React.useState<DashboardData | null>(null);
  const [lookupQuery, setLookupQuery] = React.useState('');
  const [lookupResults, setLookupResults] = React.useState<StockLookupResult[] | null>(null);
  const [searching, setSearching] = React.useState(false);

  React.useEffect(() => {
    apiFetch<{ dashboard: DashboardData }>('/api/store-keeper/dashboard')
      .then((res) => setDashboard(res.dashboard))
      .catch(() => setDashboard({ pendingGRNs: 0, pendingMINs: 0, activeStockCounts: 0 }));
  }, []);

  async function handleLookup() {
    if (!lookupQuery.trim()) return;
    setSearching(true);
    try {
      const params = new URLSearchParams({ search: lookupQuery });
      const res = await apiFetch<{ results: StockLookupResult[] }>(`/api/store-keeper/stock-lookup?${params}`);
      setLookupResults(res.results);
    } catch {
      setLookupResults([]);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <PageHeader title="Store Keeper" description="Today's tasks and quick stock lookup" />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <PackageCheck className="h-8 w-8 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Pending GRNs</p>
              <p className="text-2xl font-semibold">{dashboard?.pendingGRNs ?? '-'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <ArrowRightLeft className="h-8 w-8 text-amber-500" />
            <div>
              <p className="text-xs text-muted-foreground">Pending MINs</p>
              <p className="text-2xl font-semibold">{dashboard?.pendingMINs ?? '-'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <ClipboardList className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Active Stock Counts</p>
              <p className="text-2xl font-semibold">{dashboard?.activeStockCounts ?? '-'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Quick Stock Lookup</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Search material code or name..."
              className="flex-1"
              value={lookupQuery}
              onChange={(e) => setLookupQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
            />
            <button
              onClick={handleLookup}
              disabled={searching}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Search className="h-4 w-4 mr-1" />
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>

          {lookupResults !== null && (
            <div className="mt-4">
              {lookupResults.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No results found</p>
              ) : (
                <div className="space-y-2">
                  {lookupResults.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{item.materialCode}</Badge>
                          <span className="font-medium text-sm">{item.materialName}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{item.location}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm">
                          <span className="text-muted-foreground">Avail: </span>
                          <span className={`font-semibold ${item.availableQty <= 0 ? 'text-destructive' : ''}`}>{item.availableQty}</span>
                          <span className="text-muted-foreground"> / {item.currentQty} {item.uom}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
