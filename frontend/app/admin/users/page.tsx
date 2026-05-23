'use client';
import * as React from 'react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { apiFetch, ApiClientError } from '@/lib/api';
import { toast } from '@/components/ui/sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Lock, Unlock, LogOut, KeyRound, UserX, RotateCcw, Upload } from 'lucide-react';

interface UserRow {
  id: string;
  userCode: string;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
  lastLoginAt: string | null;
  branchName: string | null;
  departmentName: string | null;
  designationName: string | null;
  roles: { roleCode: string; roleName: string }[];
}

interface Branch { id: string; name: string }
interface Department { id: string; name: string }
interface Role { id: string; roleCode: string; roleName: string }

export default function UsersPage(): React.ReactElement {
  const [users, setUsers] = React.useState<UserRow[] | null>(null);
  const [total, setTotal] = React.useState(0);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [branchFilter, setBranchFilter] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [confirmAction, setConfirmAction] = React.useState<{ userId: string; action: string; label: string } | null>(null);

  const [branches, setBranches] = React.useState<Branch[]>([]);
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [roles, setRoles] = React.useState<Role[]>([]);

  React.useEffect(() => {
    apiFetch<{ branches: Branch[] }>('/api/branches').then((r) => setBranches(r.branches)).catch(() => {});
    apiFetch<{ departments: Department[] }>('/api/departments').then((r) => setDepartments(r.departments)).catch(() => {});
    apiFetch<{ roles: Role[] }>('/api/roles').then((r) => setRoles(r.roles)).catch(() => {});
  }, []);

  const fetchUsers = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('isActive', statusFilter);
      if (branchFilter) params.set('branchId', branchFilter);
      const r = await apiFetch<{ users: UserRow[]; total: number; page: number; limit: number }>(
        `/api/users?${params.toString()}`,
      );
      setUsers(r.users);
      setTotal(r.total);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Could not load users');
      setUsers([]);
    }
  }, [search, statusFilter, branchFilter]);

  React.useEffect(() => { void fetchUsers(); }, [fetchUsers]);

  async function executeAction(userId: string, action: string) {
    try {
      await apiFetch(`/api/users/${userId}/${action}`, { method: 'POST' });
      toast.success(`User ${action} successful`);
      void fetchUsers();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : `${action} failed`);
    }
  }

  const columns: ColumnDef<UserRow>[] = [
    {
      accessorKey: 'userCode',
      header: 'Code',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.userCode}</span>,
    },
    {
      id: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-sm">{row.original.firstName} {row.original.lastName}</p>
          <p className="text-xs text-muted-foreground">{row.original.email}</p>
        </div>
      ),
    },
    {
      id: 'branch',
      header: 'Branch',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.branchName ?? '-'}</span>
      ),
    },
    {
      id: 'roles',
      header: 'Roles',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.roles.length > 0
            ? row.original.roles.map((r) => (
                <Badge key={r.roleCode} variant="outline" className="text-xs">{r.roleName}</Badge>
              ))
            : <span className="text-xs text-muted-foreground">—</span>}
        </div>
      ),
    },
    {
      accessorKey: 'lastLoginAt',
      header: 'Last Login',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.lastLoginAt ? new Date(row.original.lastLoginAt).toLocaleDateString() : 'Never'}
        </span>
      ),
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) =>
        row.original.isActive
          ? <Badge variant="success">active</Badge>
          : <Badge variant="destructive">inactive</Badge>,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex gap-1">
          {row.original.isActive ? (
            <>
              <Button variant="ghost" size="sm" title="Lock"
                onClick={() => setConfirmAction({ userId: row.original.id, action: 'lock', label: `Lock ${row.original.firstName}?` })}>
                <Lock className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" title="Force Logout"
                onClick={() => setConfirmAction({ userId: row.original.id, action: 'force-logout', label: `Force logout ${row.original.firstName}?` })}>
                <LogOut className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" title="Reset Password"
                onClick={() => setConfirmAction({ userId: row.original.id, action: 'reset-password', label: `Reset password for ${row.original.firstName}?` })}>
                <KeyRound className="h-3 w-3" />
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" title="Reactivate"
              onClick={() => setConfirmAction({ userId: row.original.id, action: 'reactivate', label: `Reactivate ${row.original.firstName}?` })}>
              <RotateCcw className="h-3 w-3" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Users"
        description={`${total} users total.`}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => toast.info('CSV import coming soon')}>
              <Upload className="mr-1 h-4 w-4" /> Import
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-4 w-4" /> Add User
            </Button>
          </div>
        }
      />

      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Input
              placeholder="Search name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All</SelectItem>
                <SelectItem value="true">Active</SelectItem>
                <SelectItem value="false">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Branch" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Branches</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={users ?? []}
        loading={users === null}
        pageSize={20}
        emptyText="No users found."
      />

      <CreateUserDialog
        open={creating}
        branches={branches}
        departments={departments}
        roles={roles}
        onClose={() => setCreating(false)}
        onSaved={() => { setCreating(false); void fetchUsers(); }}
      />

      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction?.label ?? ''}
        description="This action will take effect immediately."
        onOpenChange={(o) => { if (!o) setConfirmAction(null); }}
        onConfirm={() => {
          if (confirmAction) {
            void executeAction(confirmAction.userId, confirmAction.action);
          }
          setConfirmAction(null);
        }}
      />
    </>
  );
}

function CreateUserDialog({
  open, branches, departments, roles, onClose, onSaved,
}: {
  open: boolean;
  branches: Branch[];
  departments: Department[];
  roles: Role[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [branchId, setBranchId] = React.useState('');
  const [departmentId, setDepartmentId] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { firstName, lastName, email };
      if (branchId) body.branchId = branchId;
      if (departmentId) body.departmentId = departmentId;
      await apiFetch('/api/users', { method: 'POST', body });
      toast.success('User created — temporary password sent via email');
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
        <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>First Name</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <Label>Last Name</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
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
            <div>
              <Label>Department</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !firstName || !lastName || !email}>
            {saving ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
