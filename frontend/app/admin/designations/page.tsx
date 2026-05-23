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

interface DesignationRow {
  id: string;
  designationCode: string;
  name: string;
  departmentId: string | null;
  level: number | null;
  isActive: boolean;
}

interface Department { id: string; name: string }

export default function DesignationsPage(): React.ReactElement {
  const [designations, setDesignations] = React.useState<DesignationRow[] | null>(null);
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [deptFilter, setDeptFilter] = React.useState('');
  const [editing, setEditing] = React.useState<DesignationRow | null>(null);
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    apiFetch<{ departments: Department[] }>('/api/departments').then((r) => setDepartments(r.departments)).catch(() => {});
  }, []);

  const fetchDesignations = React.useCallback(async () => {
    try {
      const params = deptFilter ? `?departmentId=${deptFilter}` : '';
      const r = await apiFetch<{ designations: DesignationRow[] }>(`/api/designations${params}`);
      setDesignations(r.designations);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Could not load designations');
      setDesignations([]);
    }
  }, [deptFilter]);

  React.useEffect(() => { void fetchDesignations(); }, [fetchDesignations]);

  const columns: ColumnDef<DesignationRow>[] = [
    { accessorKey: 'designationCode', header: 'Code', cell: ({ row }) => <span className="font-mono text-xs">{row.original.designationCode}</span> },
    { accessorKey: 'name', header: 'Name' },
    {
      id: 'department',
      header: 'Department',
      cell: ({ row }) => {
        const dept = departments.find((d) => d.id === row.original.departmentId);
        return <span className="text-xs">{dept?.name ?? '-'}</span>;
      },
    },
    { accessorKey: 'level', header: 'Level', cell: ({ row }) => <span className="text-xs">{row.original.level ?? '-'}</span> },
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
        title="Designations"
        description="Manage designations per department."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add Designation
          </Button>
        }
      />

      <div className="mb-4">
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-56"><SelectValue placeholder="All Departments" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Departments</SelectItem>
            {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={designations ?? []}
        loading={designations === null}
        pageSize={15}
        emptyText="No designations found."
      />

      <DesignationDialog
        open={creating || editing !== null}
        designation={editing}
        departments={departments}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); void fetchDesignations(); }}
      />
    </>
  );
}

function DesignationDialog({
  open, designation, departments, onClose, onSaved,
}: {
  open: boolean;
  designation: DesignationRow | null;
  departments: Department[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = designation !== null;
  const [code, setCode] = React.useState('');
  const [name, setName] = React.useState('');
  const [deptId, setDeptId] = React.useState('');
  const [level, setLevel] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (designation) {
      setCode(designation.designationCode);
      setName(designation.name);
      setDeptId(designation.departmentId ?? '');
      setLevel(designation.level?.toString() ?? '');
    } else {
      setCode(''); setName(''); setDeptId(''); setLevel('');
    }
  }, [designation]);

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name,
        departmentId: deptId || null,
        level: level ? parseInt(level) : null,
      };
      if (isEdit) {
        await apiFetch(`/api/designations/${designation!.id}`, { method: 'PUT', body });
      } else {
        await apiFetch('/api/designations', { method: 'POST', body: { designationCode: code, ...body } });
      }
      toast.success(isEdit ? 'Designation updated' : 'Designation created');
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
        <DialogHeader><DialogTitle>{isEdit ? 'Edit Designation' : 'Add Designation'}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div><Label>Designation Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} disabled={isEdit} placeholder="SR_ENGINEER" /></div>
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Senior Engineer" /></div>
          <div>
            <Label>Department</Label>
            <Select value={deptId} onValueChange={setDeptId}>
              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Level</Label><Input type="number" value={level} onChange={(e) => setLevel(e.target.value)} placeholder="1" /></div>
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
