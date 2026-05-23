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

interface DeptRow {
  id: string;
  departmentCode: string;
  name: string;
  parentDepartmentId: string | null;
  parentName?: string | null;
  isActive: boolean;
}

export default function DepartmentsPage(): React.ReactElement {
  const [depts, setDepts] = React.useState<DeptRow[] | null>(null);
  const [editing, setEditing] = React.useState<DeptRow | null>(null);
  const [creating, setCreating] = React.useState(false);

  const fetchDepts = React.useCallback(async () => {
    try {
      const r = await apiFetch<{ departments: DeptRow[] }>('/api/departments');
      setDepts(r.departments);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Could not load departments');
      setDepts([]);
    }
  }, []);

  React.useEffect(() => { void fetchDepts(); }, [fetchDepts]);

  const columns: ColumnDef<DeptRow>[] = [
    { accessorKey: 'departmentCode', header: 'Code', cell: ({ row }) => <span className="font-mono text-xs">{row.original.departmentCode}</span> },
    { accessorKey: 'name', header: 'Name' },
    {
      id: 'parent',
      header: 'Parent',
      cell: ({ row }) => {
        if (!row.original.parentDepartmentId) return <span className="text-xs text-muted-foreground">—</span>;
        const parent = depts?.find((d) => d.id === row.original.parentDepartmentId);
        return <span className="text-xs">{parent?.name ?? row.original.parentDepartmentId}</span>;
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
        title="Departments"
        description="Manage organizational departments."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add Department
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={depts ?? []}
        loading={depts === null}
        pageSize={15}
        emptyText="No departments found."
      />

      <DeptDialog
        open={creating || editing !== null}
        dept={editing}
        allDepts={depts ?? []}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); void fetchDepts(); }}
      />
    </>
  );
}

function DeptDialog({
  open, dept, allDepts, onClose, onSaved,
}: {
  open: boolean;
  dept: DeptRow | null;
  allDepts: DeptRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = dept !== null;
  const [code, setCode] = React.useState('');
  const [name, setName] = React.useState('');
  const [parentId, setParentId] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (dept) {
      setCode(dept.departmentCode);
      setName(dept.name);
      setParentId(dept.parentDepartmentId ?? '');
    } else {
      setCode(''); setName(''); setParentId('');
    }
  }, [dept]);

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { name, parentDepartmentId: parentId || null };
      if (isEdit) {
        await apiFetch(`/api/departments/${dept!.id}`, { method: 'PUT', body });
      } else {
        await apiFetch('/api/departments', { method: 'POST', body: { departmentCode: code, ...body } });
      }
      toast.success(isEdit ? 'Department updated' : 'Department created');
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
        <DialogHeader><DialogTitle>{isEdit ? 'Edit Department' : 'Add Department'}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div>
            <Label>Department Code</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} disabled={isEdit} placeholder="PRODUCTION" />
          </div>
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Production" />
          </div>
          <div>
            <Label>Parent Department</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger><SelectValue placeholder="None (top-level)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {allDepts.filter((d) => d.id !== dept?.id).map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
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
