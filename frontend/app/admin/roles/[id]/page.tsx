'use client';
import * as React from 'react';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable } from '@/components/common/data-table';
import { apiFetch, ApiClientError } from '@/lib/api';
import { toast } from '@/components/ui/sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { Loader2, Save } from 'lucide-react';

interface RoleDetail {
  id: string;
  roleCode: string;
  roleName: string;
  description: string | null;
  isSystemRole: boolean;
  isActive: boolean;
}

interface PermissionRow {
  id: string;
  permissionCode: string;
  description: string | null;
  moduleCode: string;
  featureCode: string;
  actionCode: string;
  scopeFilter: Record<string, unknown> | null;
}

interface RoleUser {
  id: string;
  userCode: string;
  firstName: string;
  lastName: string;
  email: string;
}

export default function RoleDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const [role, setRole] = React.useState<RoleDetail | null>(null);
  const [loading, setLoading] = React.useState(true);

  const fetchRole = React.useCallback(async () => {
    try {
      const r = await apiFetch<RoleDetail>(`/api/roles/${id}`);
      setRole(r);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Could not load role');
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => { void fetchRole(); }, [fetchRole]);

  if (loading || !role) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading role...
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={role.roleName}
        description={`${role.roleCode} · ${role.isSystemRole ? 'System role' : 'Custom role'}`}
        actions={
          <div className="flex gap-2">
            <Badge variant={role.isActive ? 'success' : 'outline'}>
              {role.isActive ? 'active' : 'inactive'}
            </Badge>
            {role.isSystemRole && <Badge variant="secondary">read-only</Badge>}
          </div>
        }
      />

      <Tabs defaultValue="permissions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="users">Assigned Users</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="permissions">
          <PermissionsTab roleId={role.id} isSystemRole={role.isSystemRole} />
        </TabsContent>
        <TabsContent value="users">
          <UsersTab roleId={role.id} />
        </TabsContent>
        <TabsContent value="details">
          <DetailsTab role={role} onUpdated={fetchRole} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function PermissionsTab({ roleId, isSystemRole }: { roleId: string; isSystemRole: boolean }) {
  const [permissions, setPermissions] = React.useState<PermissionRow[] | null>(null);
  const [allPerms, setAllPerms] = React.useState<PermissionRow[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [saving, setSaving] = React.useState(false);
  const [filter, setFilter] = React.useState('');

  React.useEffect(() => {
    apiFetch<{ permissions: PermissionRow[] }>(`/api/roles/${roleId}/permissions`)
      .then((r) => {
        setPermissions(r.permissions);
        setSelected(new Set(r.permissions.map((p) => p.permissionCode)));
      })
      .catch(() => setPermissions([]));

    apiFetch<{ permissions: PermissionRow[] }>('/api/permissions')
      .then((r) => setAllPerms(r.permissions))
      .catch(() => {});
  }, [roleId]);

  function togglePerm(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const assignments = Array.from(selected).map((c) => ({ permissionCode: c }));
      await apiFetch(`/api/roles/${roleId}/permissions`, {
        method: 'POST',
        body: { assignments },
      });
      toast.success('Permissions updated');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const grouped = React.useMemo(() => {
    const map = new Map<string, PermissionRow[]>();
    for (const p of allPerms) {
      if (filter && !p.permissionCode.toLowerCase().includes(filter.toLowerCase())) continue;
      const key = p.moduleCode;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [allPerms, filter]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Permission Matrix</CardTitle>
        <CardDescription>
          {isSystemRole ? 'System roles are read-only.' : 'Check permissions to assign to this role.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Input
          placeholder="Filter permissions..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="mb-4 max-w-sm"
        />
        <div className="space-y-4 max-h-[500px] overflow-y-auto">
          {Array.from(grouped.entries()).map(([mod, perms]) => (
            <div key={mod}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{mod}</p>
              <div className="grid gap-1">
                {perms.map((p) => (
                  <label key={p.permissionCode} className="flex items-center gap-3 rounded px-2 py-1.5 hover:bg-accent cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(p.permissionCode)}
                      onChange={() => togglePerm(p.permissionCode)}
                      disabled={isSystemRole}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="font-mono text-xs">{p.permissionCode}</span>
                    {p.description && <span className="text-xs text-muted-foreground ml-2">{p.description}</span>}
                  </label>
                ))}
              </div>
            </div>
          ))}
          {grouped.size === 0 && permissions !== null && (
            <p className="text-sm text-muted-foreground">No permissions found.</p>
          )}
        </div>
        {!isSystemRole && (
          <Button className="mt-4" onClick={save} disabled={saving}>
            <Save className="mr-1 h-4 w-4" /> {saving ? 'Saving...' : 'Save Permissions'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function UsersTab({ roleId }: { roleId: string }) {
  const [users, setUsers] = React.useState<RoleUser[] | null>(null);

  React.useEffect(() => {
    apiFetch<{ users: RoleUser[] }>(`/api/roles/${roleId}/users`)
      .then((r) => setUsers(r.users))
      .catch(() => setUsers([]));
  }, [roleId]);

  const columns: ColumnDef<RoleUser>[] = [
    { accessorKey: 'userCode', header: 'Code', cell: ({ row }) => <span className="font-mono text-xs">{row.original.userCode}</span> },
    { id: 'name', header: 'Name', cell: ({ row }) => `${row.original.firstName} ${row.original.lastName}` },
    { accessorKey: 'email', header: 'Email', cell: ({ row }) => <span className="text-xs">{row.original.email}</span> },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Assigned Users</CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable columns={columns} data={users ?? []} loading={users === null} pageSize={15} emptyText="No users assigned to this role." />
      </CardContent>
    </Card>
  );
}

function DetailsTab({ role, onUpdated }: { role: RoleDetail; onUpdated: () => void }) {
  const [name, setName] = React.useState(role.roleName);
  const [desc, setDesc] = React.useState(role.description ?? '');
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/api/roles/${role.id}`, {
        method: 'PUT',
        body: { roleName: name, description: desc || undefined },
      });
      toast.success('Role updated');
      onUpdated();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Role Details</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 max-w-lg">
          <div><Label>Role Code</Label><Input value={role.roleCode} disabled /></div>
          <div><Label>Role Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} disabled={role.isSystemRole} /></div>
          <div>
            <Label>Description</Label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} disabled={role.isSystemRole} />
          </div>
          {!role.isSystemRole && (
            <Button className="w-fit" onClick={save} disabled={saving}>
              <Save className="mr-1 h-4 w-4" /> {saving ? 'Saving...' : 'Save'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
