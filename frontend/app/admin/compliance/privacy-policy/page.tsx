'use client';
import * as React from 'react';
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
import { Plus } from 'lucide-react';

interface PolicyVersion {
  id: string;
  version: string;
  content: string;
  effectiveDate: string;
  isActive: boolean;
  createdAt: string;
}

export default function PrivacyPolicyPage(): React.ReactElement {
  const [versions, setVersions] = React.useState<PolicyVersion[] | null>(null);
  const [creating, setCreating] = React.useState(false);

  const fetch = React.useCallback(async () => {
    try {
      const r = await apiFetch<{ policies: PolicyVersion[] }>('/api/admin/compliance/privacy-policies');
      setVersions(r.policies);
    } catch {
      setVersions([]);
    }
  }, []);

  React.useEffect(() => { void fetch(); }, [fetch]);

  async function setActive(id: string) {
    try {
      await apiFetch(`/api/admin/compliance/privacy-policies/${id}/activate`, { method: 'POST' });
      toast.success('Active version updated');
      void fetch();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed');
    }
  }

  const columns: ColumnDef<PolicyVersion>[] = [
    { accessorKey: 'version', header: 'Version' },
    {
      accessorKey: 'effectiveDate',
      header: 'Effective Date',
      cell: ({ row }) => <span className="text-xs">{new Date(row.original.effectiveDate).toLocaleDateString()}</span>,
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) => row.original.isActive
        ? <Badge variant="success">active</Badge>
        : <Button variant="ghost" size="sm" onClick={() => setActive(row.original.id)}>Set Active</Button>,
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{new Date(row.original.createdAt).toLocaleDateString()}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Privacy Policy"
        description="Manage versioned privacy policy content for DPDP compliance."
        actions={<Button size="sm" onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" /> New Version</Button>}
      />
      <DataTable columns={columns} data={versions ?? []} loading={versions === null} pageSize={10} emptyText="No policy versions." />

      <PolicyDialog open={creating} type="privacy-policies" onClose={() => setCreating(false)} onSaved={() => { setCreating(false); void fetch(); }} />
    </>
  );
}

function PolicyDialog({ open, type, onClose, onSaved }: { open: boolean; type: string; onClose: () => void; onSaved: () => void }) {
  const [version, setVersion] = React.useState('');
  const [effectiveDate, setEffectiveDate] = React.useState('');
  const [content, setContent] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/api/admin/compliance/${type}`, {
        method: 'POST',
        body: { version, effectiveDate, content, isActive: false },
      });
      toast.success('Policy version created');
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New Policy Version</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Version</Label><Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="2.0" /></div>
            <div><Label>Effective Date</Label><Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} /></div>
          </div>
          <div><Label>Content</Label><Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={10} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !version || !content}>{saving ? 'Saving...' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
