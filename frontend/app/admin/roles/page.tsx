'use client';
import * as React from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch, ApiClientError } from '@/lib/api';
import { toast } from '@/components/ui/sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Eye } from 'lucide-react';

interface RoleRow {
  id: string;
  roleCode: string;
  roleName: string;
  description: string | null;
  isSystemRole: boolean;
  isActive: boolean;
  userCount?: number;
}

export default function RolesPage(): React.ReactElement {
  const [roles, setRoles] = React.useState<RoleRow[] | null>(null);
  const [creating, setCreating] = React.useState(false);

  const fetchRoles = React.useCallback(async () => {
    try {
      const r = await apiFetch<{ roles: RoleRow[] }>('/api/roles');
      setRoles(r.roles);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Could not load roles');
      setRoles([]);
    }
  }, []);

  React.useEffect(() => { void fetchRoles(); }, [fetchRoles]);

  const columns: ColumnDef<RoleRow>[] = [
    {
      accessorKey: 'roleCode',
      header: 'Code',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.roleCode}</span>,
    },
    { accessorKey: 'roleName', header: 'Name' },
    {
      accessorKey: 'isSystemRole',
      header: 'Type',
      cell: ({ row }) =>
        row.original.isSystemRole
          ? <Badge variant="secondary">system</Badge>
          : <Badge variant="outline">custom</Badge>,
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) =>
        row.original.isActive
          ? <Badge variant="success">active</Badge>
          : <Badge variant="outline">inactive</Badge>,
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => <span className="text-xs text-muted-foreground truncate max-w-xs block">{row.original.description ?? '-'}</span>,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Link href={`/admin/roles/${row.original.id}`}>
          <Button variant="ghost" size="sm">
            <Eye className="mr-1 h-3 w-3" /> View
          </Button>
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        description="Manage roles. System roles are read-only."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-4 w-4" /> New Role
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={roles ?? []}
        loading={roles === null}
        pageSize={15}
        emptyText="No roles configured."
      />

      <CreateRoleDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => { setCreating(false); void fetchRoles(); }}
      />
    </>
  );
}

function CreateRoleDialog({
  open, onClose, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = React.useState('');
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch('/api/roles', {
        method: 'POST',
        body: { roleCode: code, roleName: name, description: description || undefined },
      });
      toast.success('Role created');
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Create Custom Role</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div>
            <Label>Role Code</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="WAREHOUSE_MGR" />
          </div>
          <div>
            <Label>Role Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Warehouse Manager" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !code || !name}>
            {saving ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
