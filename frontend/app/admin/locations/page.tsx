'use client';
import * as React from 'react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiFetch, ApiClientError } from '@/lib/api';
import { toast } from '@/components/ui/sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Pencil } from 'lucide-react';

interface LocationRow {
  id: string;
  locationCode: string;
  name: string;
  locationType: string;
  branchId: string | null;
  isActive: boolean;
}

interface Branch { id: string; name: string }

export default function LocationsPage(): React.ReactElement {
  const [locations, setLocations] = React.useState<LocationRow[] | null>(null);
  const [branches, setBranches] = React.useState<Branch[]>([]);
  const [branchFilter, setBranchFilter] = React.useState('');
  const [editing, setEditing] = React.useState<LocationRow | null>(null);
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    apiFetch<{ branches: Branch[] }>('/api/branches').then((r) => setBranches(r.branches)).catch(() => {});
  }, []);

  const fetchLocations = React.useCallback(async () => {
    try {
      const params = branchFilter ? `?branchId=${branchFilter}` : '';
      const r = await apiFetch<{ locations: LocationRow[] }>(`/api/locations${params}`);
      setLocations(r.locations);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Could not load locations');
      setLocations([]);
    }
  }, [branchFilter]);

  React.useEffect(() => { void fetchLocations(); }, [fetchLocations]);

  const columns: ColumnDef<LocationRow>[] = [
    { accessorKey: 'locationCode', header: 'Code', cell: ({ row }) => <span className="font-mono text-xs">{row.original.locationCode}</span> },
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'locationType', header: 'Type', cell: ({ row }) => <Badge variant="outline">{row.original.locationType}</Badge> },
    {
      id: 'branch',
      header: 'Branch',
      cell: ({ row }) => {
        const br = branches.find((b) => b.id === row.original.branchId);
        return <span className="text-xs">{br?.name ?? '-'}</span>;
      },
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) => row.original.isActive ? <Badge variant="success">active</Badge> : <Badge variant="outline">inactive</Badge>,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" onClick={() => setEditing(row.original)}>
          <Pencil className="mr-1 h-3 w-3" /> Edit
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Locations"
        description="Manage storage and operational locations per branch."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add Location
          </Button>
        }
      />

      <div className="mb-4">
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="w-56"><SelectValue placeholder="All Branches" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Branches</SelectItem>
            {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={locations ?? []}
        loading={locations === null}
        pageSize={15}
        emptyText="No locations found."
      />

      <LocationDialog
        open={creating || editing !== null}
        location={editing}
        branches={branches}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); void fetchLocations(); }}
      />
    </>
  );
}

function LocationDialog({
  open, location, branches, onClose, onSaved,
}: {
  open: boolean;
  location: LocationRow | null;
  branches: Branch[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = location !== null;
  const [code, setCode] = React.useState('');
  const [name, setName] = React.useState('');
  const [type, setType] = React.useState('warehouse');
  const [branchId, setBranchId] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (location) {
      setCode(location.locationCode);
      setName(location.name);
      setType(location.locationType);
      setBranchId(location.branchId ?? '');
    } else {
      setCode(''); setName(''); setType('warehouse'); setBranchId('');
    }
  }, [location]);

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name,
        locationType: type,
        branchId: branchId || null,
      };
      if (isEdit) {
        await apiFetch(`/api/locations/${location!.id}`, { method: 'PUT', body });
      } else {
        await apiFetch('/api/locations', { method: 'POST', body: { locationCode: code, ...body } });
      }
      toast.success(isEdit ? 'Location updated' : 'Location created');
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{isEdit ? 'Edit Location' : 'Add Location'}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div><Label>Location Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} disabled={isEdit} placeholder="WH_MAIN" /></div>
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Main Warehouse" /></div>
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="warehouse">Warehouse</SelectItem>
                <SelectItem value="factory">Factory</SelectItem>
                <SelectItem value="showroom">Showroom</SelectItem>
                <SelectItem value="office">Office</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Branch</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name || (!isEdit && !code)}>
            {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
