'use client';
import * as React from 'react';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataTable } from '@/components/common/data-table';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { apiFetch, ApiClientError } from '@/lib/api';
import { toast } from '@/components/ui/sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { Loader2, Save, ShieldPlus, Trash2 } from 'lucide-react';

interface UserDetail {
  id: string;
  userCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  branchId: string | null;
  departmentId: string | null;
  designationId: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  roles: { roleCode: string; roleName: string }[];
}

interface SessionRow {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  isRevoked: boolean;
  createdAt: string;
  expiresAt: string;
}

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actionAt: string;
  details: unknown;
}

interface OverrideRow {
  id: string;
  permissionCode: string;
  grantType: string;
  reason: string | null;
  expiresAt: string | null;
}

interface Role { id: string; roleCode: string; roleName: string }

export default function UserDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = React.useState<UserDetail | null>(null);
  const [loading, setLoading] = React.useState(true);

  const fetchUser = React.useCallback(async () => {
    try {
      const r = await apiFetch<UserDetail>(`/api/users/${id}`);
      setUser(r);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Could not load user');
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => { void fetchUser(); }, [fetchUser]);

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading user...
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={`${user.firstName} ${user.lastName}`}
        description={`${user.userCode} · ${user.email}`}
        actions={
          <Badge variant={user.isActive ? 'success' : 'destructive'}>
            {user.isActive ? 'active' : 'inactive'}
          </Badge>
        }
      />

      <Tabs defaultValue="info" className="space-y-4">
        <TabsList>
          <TabsTrigger value="info">Basic Info</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <BasicInfoTab user={user} onUpdated={fetchUser} />
        </TabsContent>
        <TabsContent value="roles">
          <RolesTab userId={user.id} currentRoles={user.roles} onUpdated={fetchUser} />
        </TabsContent>
        <TabsContent value="permissions">
          <PermissionOverridesTab userId={user.id} />
        </TabsContent>
        <TabsContent value="sessions">
          <SessionsTab userId={user.id} />
        </TabsContent>
        <TabsContent value="audit">
          <AuditTab userId={user.id} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function BasicInfoTab({ user, onUpdated }: { user: UserDetail; onUpdated: () => void }) {
  const [firstName, setFirstName] = React.useState(user.firstName);
  const [lastName, setLastName] = React.useState(user.lastName);
  const [phone, setPhone] = React.useState(user.phone ?? '');
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/api/users/${user.id}`, {
        method: 'PUT',
        body: { firstName, lastName, phone: phone || undefined },
      });
      toast.success('User updated');
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
        <CardTitle className="text-base">Basic Information</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 max-w-lg">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>First Name</Label><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
            <div><Label>Last Name</Label><Input value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
          </div>
          <div><Label>Email</Label><Input value={user.email} disabled /></div>
          <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Last login: {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}</p>
            <p>Created: {new Date(user.createdAt).toLocaleDateString()}</p>
          </div>
          <Button className="w-fit" onClick={save} disabled={saving}>
            <Save className="mr-1 h-4 w-4" /> {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RolesTab({ userId, currentRoles, onUpdated }: { userId: string; currentRoles: { roleCode: string; roleName: string }[]; onUpdated: () => void }) {
  const [allRoles, setAllRoles] = React.useState<Role[]>([]);
  const [selectedRoles, setSelectedRoles] = React.useState<string[]>(currentRoles.map((r) => r.roleCode));
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    apiFetch<{ roles: Role[] }>('/api/roles').then((r) => setAllRoles(r.roles)).catch(() => {});
  }, []);

  async function saveRoles() {
    setSaving(true);
    try {
      await apiFetch(`/api/users/${userId}/roles`, {
        method: 'POST',
        body: { roleCodes: selectedRoles },
      });
      toast.success('Roles updated');
      onUpdated();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to update roles');
    } finally {
      setSaving(false);
    }
  }

  function toggleRole(code: string) {
    setSelectedRoles((prev) =>
      prev.includes(code) ? prev.filter((r) => r !== code) : [...prev, code],
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Role Assignment</CardTitle>
        <CardDescription>Select roles for this user. Changes take effect on save.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 max-w-lg">
          {allRoles.map((role) => (
            <label key={role.roleCode} className="flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer hover:bg-accent">
              <input
                type="checkbox"
                checked={selectedRoles.includes(role.roleCode)}
                onChange={() => toggleRole(role.roleCode)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <div>
                <p className="text-sm font-medium">{role.roleName}</p>
                <p className="text-xs text-muted-foreground font-mono">{role.roleCode}</p>
              </div>
            </label>
          ))}
          {allRoles.length === 0 && <p className="text-sm text-muted-foreground">No roles loaded.</p>}
        </div>
        <Button className="mt-4" onClick={saveRoles} disabled={saving}>
          <Save className="mr-1 h-4 w-4" /> {saving ? 'Saving...' : 'Save Roles'}
        </Button>
      </CardContent>
    </Card>
  );
}

function PermissionOverridesTab({ userId }: { userId: string }) {
  const [overrides, setOverrides] = React.useState<OverrideRow[] | null>(null);
  const [code, setCode] = React.useState('');
  const [grantType, setGrantType] = React.useState<'allow' | 'deny'>('allow');
  const [reason, setReason] = React.useState('');
  const [adding, setAdding] = React.useState(false);

  const fetchOverrides = React.useCallback(async () => {
    try {
      const r = await apiFetch<{ permissions: OverrideRow[] }>(`/api/rbac/users/${userId}/permissions`);
      const ov = (r as unknown as { overrides?: OverrideRow[] }).overrides ?? [];
      setOverrides(ov);
    } catch {
      setOverrides([]);
    }
  }, [userId]);

  React.useEffect(() => { void fetchOverrides(); }, [fetchOverrides]);

  async function addOverride() {
    if (!code) return;
    setAdding(true);
    try {
      await apiFetch(`/api/users/${userId}/permission-overrides`, {
        method: 'POST',
        body: { permissionCode: code, grantType, reason: reason || undefined },
      });
      toast.success('Override added');
      setCode(''); setReason('');
      void fetchOverrides();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed');
    } finally {
      setAdding(false);
    }
  }

  const columns: ColumnDef<OverrideRow>[] = [
    { accessorKey: 'permissionCode', header: 'Permission' },
    {
      accessorKey: 'grantType',
      header: 'Type',
      cell: ({ row }) => (
        <Badge variant={row.original.grantType === 'allow' ? 'success' : 'destructive'}>
          {row.original.grantType}
        </Badge>
      ),
    },
    { accessorKey: 'reason', header: 'Reason', cell: ({ row }) => <span className="text-xs">{row.original.reason ?? '-'}</span> },
    {
      accessorKey: 'expiresAt',
      header: 'Expires',
      cell: ({ row }) => <span className="text-xs">{row.original.expiresAt ? new Date(row.original.expiresAt).toLocaleDateString() : 'Never'}</span>,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Permission Overrides</CardTitle>
        <CardDescription>Explicit allow/deny overrides for this user.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-4 items-end">
          <div>
            <Label className="text-xs">Permission Code</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="MOD:feature:action" className="w-56" />
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={grantType} onValueChange={(v) => setGrantType(v as 'allow' | 'deny')}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="allow">Allow</SelectItem>
                <SelectItem value="deny">Deny</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" className="w-44" />
          </div>
          <Button size="sm" onClick={addOverride} disabled={adding || !code}>
            <ShieldPlus className="mr-1 h-3 w-3" /> Add
          </Button>
        </div>
        <DataTable columns={columns} data={overrides ?? []} loading={overrides === null} pageSize={10} emptyText="No overrides." />
      </CardContent>
    </Card>
  );
}

function SessionsTab({ userId }: { userId: string }) {
  const [sessions, setSessions] = React.useState<SessionRow[] | null>(null);

  React.useEffect(() => {
    apiFetch<{ sessions: SessionRow[] }>(`/api/rbac/users/${userId}/permissions`)
      .then(() => setSessions([]))
      .catch(() => setSessions([]));
    // Sessions are on /api/auth/sessions (current user only). For admin, show placeholder.
    setSessions([]);
  }, [userId]);

  const columns: ColumnDef<SessionRow>[] = [
    { accessorKey: 'ipAddress', header: 'IP', cell: ({ row }) => <span className="font-mono text-xs">{row.original.ipAddress ?? '-'}</span> },
    { accessorKey: 'userAgent', header: 'User Agent', cell: ({ row }) => <span className="text-xs truncate max-w-xs block">{row.original.userAgent ?? '-'}</span> },
    {
      accessorKey: 'isRevoked',
      header: 'Status',
      cell: ({ row }) => row.original.isRevoked ? <Badge variant="destructive">revoked</Badge> : <Badge variant="success">active</Badge>,
    },
    { accessorKey: 'createdAt', header: 'Created', cell: ({ row }) => <span className="text-xs">{new Date(row.original.createdAt).toLocaleString()}</span> },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sessions</CardTitle>
        <CardDescription>Active and recent sessions for this user.</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable columns={columns} data={sessions ?? []} loading={sessions === null} pageSize={10} emptyText="No sessions found." />
      </CardContent>
    </Card>
  );
}

function AuditTab({ userId }: { userId: string }) {
  const [logs, setLogs] = React.useState<AuditRow[] | null>(null);

  React.useEffect(() => {
    apiFetch<{ logs: AuditRow[] }>(`/api/users/${userId}/audit-trail`)
      .then((r) => setLogs(r.logs))
      .catch(() => setLogs([]));
  }, [userId]);

  const columns: ColumnDef<AuditRow>[] = [
    { accessorKey: 'action', header: 'Action', cell: ({ row }) => <Badge variant="outline">{row.original.action}</Badge> },
    { accessorKey: 'entityType', header: 'Entity', cell: ({ row }) => <span className="text-xs font-mono">{row.original.entityType}</span> },
    { accessorKey: 'entityId', header: 'Entity ID', cell: ({ row }) => <span className="text-xs font-mono">{row.original.entityId ?? '-'}</span> },
    {
      accessorKey: 'actionAt',
      header: 'When',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{new Date(row.original.actionAt).toLocaleString()}</span>,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Audit Trail</CardTitle>
        <CardDescription>Recent actions performed by this user.</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable columns={columns} data={logs ?? []} loading={logs === null} pageSize={15} emptyText="No audit records." />
      </CardContent>
    </Card>
  );
}
