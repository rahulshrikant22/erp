'use client';
import * as React from 'react';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, ChevronRight, ChevronDown, Trash2, Lock, Unlock, Boxes } from 'lucide-react';

interface Bin {
  id: string;
  binCode: string;
  isFrozen: boolean;
}

interface Rack {
  id: string;
  rackCode: string;
  isFrozen: boolean;
  bins: Bin[];
}

interface StorageLocation {
  id: string;
  locationName: string;
  locationType: string;
  isFrozen: boolean;
  racks: Rack[];
}

export default function StoragePage() {
  const [locations, setLocations] = React.useState<StorageLocation[] | null>(null);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [expandedRacks, setExpandedRacks] = React.useState<Record<string, boolean>>({});

  const [showAddLocation, setShowAddLocation] = React.useState(false);
  const [locationForm, setLocationForm] = React.useState({ locationName: '', locationType: 'warehouse' });

  const [showAddRack, setShowAddRack] = React.useState(false);
  const [rackParentId, setRackParentId] = React.useState('');
  const [rackForm, setRackForm] = React.useState({ rackCode: '' });

  const [showAddBin, setShowAddBin] = React.useState(false);
  const [binParentId, setBinParentId] = React.useState('');
  const [binForm, setBinForm] = React.useState({ binCode: '' });

  const [showBulkBins, setShowBulkBins] = React.useState(false);
  const [bulkRackId, setBulkRackId] = React.useState('');
  const [bulkForm, setBulkForm] = React.useState({ prefix: '', startNumber: '1', count: '10' });

  const [saving, setSaving] = React.useState(false);

  const fetchLocations = React.useCallback(async () => {
    try {
      const res = await apiFetch<{ storageLocations: StorageLocation[] }>('/api/storage-locations');
      setLocations(res.storageLocations);
    } catch {
      setLocations([]);
    }
  }, []);

  React.useEffect(() => { fetchLocations(); }, [fetchLocations]);

  function toggleLocation(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleRack(id: string) {
    setExpandedRacks((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleAddLocation() {
    setSaving(true);
    try {
      await apiFetch('/api/storage-locations', {
        method: 'POST',
        body: { location_name: locationForm.locationName, location_type: locationForm.locationType },
      });
      toast.success('Location added');
      setShowAddLocation(false);
      setLocationForm({ locationName: '', locationType: 'warehouse' });
      fetchLocations();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddRack() {
    setSaving(true);
    try {
      await apiFetch(`/api/storage-locations/${rackParentId}/racks`, {
        method: 'POST',
        body: { rack_code: rackForm.rackCode },
      });
      toast.success('Rack added');
      setShowAddRack(false);
      setRackForm({ rackCode: '' });
      fetchLocations();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddBin() {
    setSaving(true);
    try {
      await apiFetch(`/api/storage-racks/${binParentId}/bins`, {
        method: 'POST',
        body: { bin_code: binForm.binCode },
      });
      toast.success('Bin added');
      setShowAddBin(false);
      setBinForm({ binCode: '' });
      fetchLocations();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleBulkBins() {
    setSaving(true);
    try {
      const res = await apiFetch<{ created: number }>(`/api/storage-racks/${bulkRackId}/bins/bulk`, {
        method: 'POST',
        body: {
          prefix: bulkForm.prefix,
          start_number: Number(bulkForm.startNumber),
          count: Number(bulkForm.count),
        },
      });
      toast.success(`${res.created} bins created`);
      setShowBulkBins(false);
      setBulkForm({ prefix: '', startNumber: '1', count: '10' });
      fetchLocations();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleFreeze(type: 'location' | 'rack' | 'bin', id: string, currentFrozen: boolean) {
    try {
      const endpoint = type === 'location' ? `/api/storage-locations/${id}` : type === 'rack' ? `/api/storage-racks/${id}` : `/api/storage-bins/${id}`;
      await apiFetch(endpoint, { method: 'PATCH', body: { is_frozen: !currentFrozen } });
      toast.success(`${type} ${currentFrozen ? 'unfrozen' : 'frozen'}`);
      fetchLocations();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed');
    }
  }

  async function handleDelete(type: 'location' | 'rack' | 'bin', id: string) {
    try {
      const endpoint = type === 'location' ? `/api/storage-locations/${id}` : type === 'rack' ? `/api/storage-racks/${id}` : `/api/storage-bins/${id}`;
      await apiFetch(endpoint, { method: 'DELETE' });
      toast.success(`${type} deleted`);
      fetchLocations();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to delete');
    }
  }

  if (!locations) {
    return <div className="py-8 text-center text-muted-foreground">Loading storage locations...</div>;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Storage Locations"
        description={`${locations.length} locations`}
        actions={<Button size="sm" onClick={() => setShowAddLocation(true)}><Plus className="h-4 w-4 mr-1" />Add Location</Button>}
      />

      <div className="space-y-2">
        {locations.map((loc) => (
          <Card key={loc.id}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <button onClick={() => toggleLocation(loc.id)} className="p-0.5">
                  {expanded[loc.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <Boxes className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{loc.locationName}</span>
                <Badge variant="outline">{loc.locationType}</Badge>
                {loc.isFrozen && <Badge variant="destructive">Frozen</Badge>}
                <div className="ml-auto flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleToggleFreeze('location', loc.id, loc.isFrozen)} title={loc.isFrozen ? 'Unfreeze' : 'Freeze'}>
                    {loc.isFrozen ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setRackParentId(loc.id); setShowAddRack(true); }}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete('location', loc.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {expanded[loc.id] && (
                <div className="ml-8 mt-2 space-y-1">
                  {loc.racks.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No racks</p>
                  ) : (
                    loc.racks.map((rack) => (
                      <div key={rack.id}>
                        <div className="flex items-center gap-2 py-1">
                          <button onClick={() => toggleRack(rack.id)} className="p-0.5">
                            {expandedRacks[rack.id] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                          <span className="text-sm font-medium">{rack.rackCode}</span>
                          {rack.isFrozen && <Badge variant="destructive" className="text-[10px]">Frozen</Badge>}
                          <span className="text-xs text-muted-foreground">({rack.bins.length} bins)</span>
                          <div className="ml-auto flex gap-1">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleToggleFreeze('rack', rack.id, rack.isFrozen)}>
                              {rack.isFrozen ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setBinParentId(rack.id); setShowAddBin(true); }}>
                              <Plus className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setBulkRackId(rack.id); setShowBulkBins(true); }} title="Bulk add bins">
                              <Boxes className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete('rack', rack.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>

                        {expandedRacks[rack.id] && rack.bins.length > 0 && (
                          <div className="ml-8 flex flex-wrap gap-1 py-1">
                            {rack.bins.map((bin) => (
                              <span key={bin.id} className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs">
                                {bin.binCode}
                                {bin.isFrozen && <Lock className="h-2.5 w-2.5 text-destructive" />}
                                <button onClick={() => handleToggleFreeze('bin', bin.id, bin.isFrozen)} className="hover:text-primary">
                                  {bin.isFrozen ? <Unlock className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5 text-muted-foreground" />}
                                </button>
                                <button onClick={() => handleDelete('bin', bin.id)} className="text-destructive hover:text-destructive/80">
                                  <Trash2 className="h-2.5 w-2.5" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showAddLocation} onOpenChange={setShowAddLocation}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Storage Location</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Name *</Label><Input value={locationForm.locationName} onChange={(e) => setLocationForm((f) => ({ ...f, locationName: e.target.value }))} /></div>
            <div><Label>Type</Label><Input value={locationForm.locationType} onChange={(e) => setLocationForm((f) => ({ ...f, locationType: e.target.value }))} placeholder="warehouse, floor, yard..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddLocation(false)}>Cancel</Button>
            <Button onClick={handleAddLocation} disabled={saving || !locationForm.locationName}>{saving ? 'Adding...' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddRack} onOpenChange={setShowAddRack}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Rack</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Rack Code *</Label><Input value={rackForm.rackCode} onChange={(e) => setRackForm((f) => ({ ...f, rackCode: e.target.value }))} placeholder="e.g. R-01" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddRack(false)}>Cancel</Button>
            <Button onClick={handleAddRack} disabled={saving || !rackForm.rackCode}>{saving ? 'Adding...' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddBin} onOpenChange={setShowAddBin}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Bin</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Bin Code *</Label><Input value={binForm.binCode} onChange={(e) => setBinForm((f) => ({ ...f, binCode: e.target.value }))} placeholder="e.g. B-001" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddBin(false)}>Cancel</Button>
            <Button onClick={handleAddBin} disabled={saving || !binForm.binCode}>{saving ? 'Adding...' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBulkBins} onOpenChange={setShowBulkBins}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bulk Create Bins</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Prefix *</Label><Input value={bulkForm.prefix} onChange={(e) => setBulkForm((f) => ({ ...f, prefix: e.target.value }))} placeholder="e.g. B-" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Start Number</Label><Input type="number" value={bulkForm.startNumber} onChange={(e) => setBulkForm((f) => ({ ...f, startNumber: e.target.value }))} /></div>
              <div><Label>Count</Label><Input type="number" value={bulkForm.count} onChange={(e) => setBulkForm((f) => ({ ...f, count: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkBins(false)}>Cancel</Button>
            <Button onClick={handleBulkBins} disabled={saving || !bulkForm.prefix}>{saving ? 'Creating...' : 'Create Bins'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
