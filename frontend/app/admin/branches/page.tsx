'use client';
import * as React from 'react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch, ApiClientError } from '@/lib/api';
import { toast } from '@/components/ui/sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Pencil } from 'lucide-react';

interface BranchRow {
  id: string;
  branchCode: string;
  name: string;
  gstin: string | null;
  city: string | null;
  state: string | null;
  isActive: boolean;
}

export default function BranchesPage(): React.ReactElement {
  const [branches, setBranches] = React.useState<BranchRow[] | null>(null);
  const [editing, setEditing] = React.useState<BranchRow | null>(null);
  const [creating, setCreating] = React.useState(false);

  const fetchBranches = React.useCallback(async () => {
    try {
      const r = await apiFetch<{ branches: BranchRow[] }>('/api/branches');
      setBranches(r.branches);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Could not load branches');
      setBranches([]);
    }
  }, []);

  React.useEffect(() => { void fetchBranches(); }, [fetchBranches]);

  const columns: ColumnDef<BranchRow>[] = [
    { accessorKey: 'branchCode', header: 'Code', cell: ({ row }) => <span className="font-mono text-xs">{row.original.branchCode}</span> },
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'gstin', header: 'GSTIN', cell: ({ row }) => <span className="font-mono text-xs">{row.original.gstin ?? '-'}</span> },
    { accessorKey: 'city', header: 'City', cell: ({ row }) => <span className="text-xs">{row.original.city ?? '-'}</span> },
    { accessorKey: 'state', header: 'State', cell: ({ row }) => <span className="text-xs">{row.original.state ?? '-'}</span> },
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
        title="Branches"
        description="Manage company branches and their details."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add Branch
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={branches ?? []}
        loading={branches === null}
        pageSize={15}
        emptyText="No branches configured."
      />

      <BranchDialog
        open={creating || editing !== null}
        branch={editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); void fetchBranches(); }}
      />
    </>
  );
}

function BranchDialog({
  open, branch, onClose, onSaved,
}: {
  open: boolean;
  branch: BranchRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = branch !== null;
  const [code, setCode] = React.useState('');
  const [name, setName] = React.useState('');
  const [gstin, setGstin] = React.useState('');
  const [city, setCity] = React.useState('');
  const [state, setState] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (branch) {
      setCode(branch.branchCode);
      setName(branch.name);
      setGstin(branch.gstin ?? '');
      setCity(branch.city ?? '');
      setState(branch.state ?? '');
    } else {
      setCode(''); setName(''); setGstin(''); setCity(''); setState('');
    }
  }, [branch]);

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { name, gstin: gstin || undefined, city: city || undefined, state: state || undefined };
      if (isEdit) {
        await apiFetch(`/api/branches/${branch!.id}`, { method: 'PUT', body });
      } else {
        await apiFetch('/api/branches', { method: 'POST', body: { branchCode: code, ...body } });
      }
      toast.success(isEdit ? 'Branch updated' : 'Branch created');
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
        <DialogHeader><DialogTitle>{isEdit ? 'Edit Branch' : 'Add Branch'}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div>
            <Label>Branch Code</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} disabled={isEdit} placeholder="HQ" />
          </div>
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Head Office" />
          </div>
          <div>
            <Label>GSTIN</Label>
            <Input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="22AAAAA0000A1Z5" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>City</Label><Input value={city} onChange={(e) => setCity(e.target.value)} /></div>
            <div><Label>State</Label><Input value={state} onChange={(e) => setState(e.target.value)} /></div>
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
