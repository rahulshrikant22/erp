'use client';
import * as React from 'react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch, ApiClientError } from '@/lib/api';
import { toast } from '@/components/ui/sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Star, Zap } from 'lucide-react';

interface Provider {
  id: string;
  providerCode: string;
  displayName: string;
  isActive: boolean;
  isPrimary: boolean;
  configuration?: Record<string, unknown>;
}

type Channel = 'email' | 'sms' | 'whatsapp';

const ENDPOINTS: Record<Channel, string> = {
  email: '/api/admin/email-providers',
  sms: '/api/admin/sms-providers',
  whatsapp: '/api/admin/whatsapp-providers',
};

export default function ProvidersPage(): React.ReactElement {
  const [channel, setChannel] = React.useState<Channel>('email');
  const [providers, setProviders] = React.useState<Provider[] | null>(null);
  const [creating, setCreating] = React.useState(false);

  const fetchProviders = React.useCallback(async () => {
    try {
      const r = await apiFetch<{ providers: Provider[] }>(ENDPOINTS[channel]);
      setProviders(r.providers);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Could not load providers');
      setProviders([]);
    }
  }, [channel]);

  React.useEffect(() => { void fetchProviders(); }, [fetchProviders]);

  async function setPrimary(id: string) {
    try {
      await apiFetch(`${ENDPOINTS[channel]}/${id}/set-primary`, { method: 'PUT' });
      toast.success('Primary provider updated');
      void fetchProviders();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed');
    }
  }

  async function testProvider(id: string) {
    try {
      await apiFetch(`${ENDPOINTS[channel]}/${id}/test`, { method: 'POST' });
      toast.success('Test message sent');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Test failed');
    }
  }

  const columns: ColumnDef<Provider>[] = [
    {
      accessorKey: 'providerCode',
      header: 'Code',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.providerCode}</span>,
    },
    { accessorKey: 'displayName', header: 'Name' },
    {
      accessorKey: 'isPrimary',
      header: 'Primary',
      cell: ({ row }) =>
        row.original.isPrimary
          ? <Badge variant="success"><Star className="mr-1 h-3 w-3" /> Primary</Badge>
          : <Button variant="ghost" size="sm" onClick={() => setPrimary(row.original.id)}>Set Primary</Button>,
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
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" onClick={() => testProvider(row.original.id)}>
          <Zap className="mr-1 h-3 w-3" /> Test
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Communication Providers"
        description="Configure email, SMS, and WhatsApp providers. Set primary for failover."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add Provider
          </Button>
        }
      />

      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Channel</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={channel} onValueChange={(v) => setChannel(v as Channel)}>
            <TabsList>
              <TabsTrigger value="email">Email</TabsTrigger>
              <TabsTrigger value="sms">SMS</TabsTrigger>
              <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={providers ?? []}
        loading={providers === null}
        pageSize={10}
        emptyText="No providers configured for this channel."
      />

      <CreateProviderDialog
        open={creating}
        channel={channel}
        onClose={() => setCreating(false)}
        onSaved={() => { setCreating(false); void fetchProviders(); }}
      />
    </>
  );
}

function CreateProviderDialog({
  open, channel, onClose, onSaved,
}: {
  open: boolean;
  channel: Channel;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = React.useState('');
  const [name, setName] = React.useState('');
  const [config, setConfig] = React.useState('{}');
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      let parsedConfig: Record<string, unknown>;
      try { parsedConfig = JSON.parse(config); } catch { toast.error('Invalid JSON'); setSaving(false); return; }

      await apiFetch(ENDPOINTS[channel], {
        method: 'POST',
        body: { providerCode: code, displayName: name, configuration: parsedConfig, isActive: true },
      });
      toast.success('Provider created');
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
        <DialogHeader><DialogTitle>Add {channel} Provider</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div>
            <Label>Provider Code</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="sendgrid" />
          </div>
          <div>
            <Label>Display Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="SendGrid Production" />
          </div>
          <div>
            <Label>Configuration (JSON)</Label>
            <Textarea value={config} onChange={(e) => setConfig(e.target.value)} rows={5} className="font-mono text-xs" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !code || !name}>{saving ? 'Saving...' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
