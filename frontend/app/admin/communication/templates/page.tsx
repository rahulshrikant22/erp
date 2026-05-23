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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiFetch, ApiClientError } from '@/lib/api';
import { toast } from '@/components/ui/sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Pencil } from 'lucide-react';

interface Template {
  id: string;
  templateCode: string;
  name: string;
  channel: string;
  subjectTemplate: string | null;
  bodyTemplate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

type Channel = 'all' | 'email' | 'sms' | 'whatsapp';

const CHANNEL_COLORS: Record<string, 'default' | 'secondary' | 'outline'> = {
  email: 'default',
  sms: 'secondary',
  whatsapp: 'outline',
};

export default function TemplatesPage(): React.ReactElement {
  const [channel, setChannel] = React.useState<Channel>('all');
  const [templates, setTemplates] = React.useState<Template[] | null>(null);
  const [editing, setEditing] = React.useState<Template | null>(null);
  const [creating, setCreating] = React.useState(false);

  const fetchTemplates = React.useCallback(async () => {
    try {
      const channelEndpoints: Record<string, string> = {
        email: '/api/admin/email-templates',
        sms: '/api/admin/sms-templates',
        whatsapp: '/api/admin/whatsapp-templates',
      };
      if (channel === 'all') {
        const [email, sms, whatsapp] = await Promise.all([
          apiFetch<{ templates: Template[] }>(channelEndpoints.email),
          apiFetch<{ templates: Template[] }>(channelEndpoints.sms),
          apiFetch<{ templates: Template[] }>(channelEndpoints.whatsapp),
        ]);
        setTemplates([...email.templates, ...sms.templates, ...whatsapp.templates]);
      } else {
        const r = await apiFetch<{ templates: Template[] }>(channelEndpoints[channel]);
        setTemplates(r.templates);
      }
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Could not load templates');
      setTemplates([]);
    }
  }, [channel]);

  React.useEffect(() => { void fetchTemplates(); }, [fetchTemplates]);

  const columns: ColumnDef<Template>[] = [
    {
      accessorKey: 'templateCode',
      header: 'Code',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.templateCode}</span>,
    },
    { accessorKey: 'name', header: 'Name' },
    {
      accessorKey: 'channel',
      header: 'Channel',
      cell: ({ row }) => (
        <Badge variant={CHANNEL_COLORS[row.original.channel] ?? 'outline'}>
          {row.original.channel}
        </Badge>
      ),
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
        <Button variant="ghost" size="sm" onClick={() => setEditing(row.original)}>
          <Pencil className="mr-1 h-3 w-3" /> Edit
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Communication Templates"
        description="Manage email, SMS, and WhatsApp message templates."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-4 w-4" /> New Template
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
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="email">Email</TabsTrigger>
              <TabsTrigger value="sms">SMS</TabsTrigger>
              <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={templates ?? []}
        loading={templates === null}
        pageSize={15}
        emptyText="No templates found."
      />

      <TemplateDialog
        open={creating || editing !== null}
        template={editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); void fetchTemplates(); }}
      />
    </>
  );
}

function TemplateDialog({
  open, template, onClose, onSaved,
}: {
  open: boolean;
  template: Template | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = template !== null;
  const [code, setCode] = React.useState('');
  const [name, setName] = React.useState('');
  const [ch, setCh] = React.useState('email');
  const [subject, setSubject] = React.useState('');
  const [body, setBody] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (template) {
      setCode(template.templateCode);
      setName(template.name);
      setCh(template.channel);
      setSubject(template.subjectTemplate ?? '');
      setBody(template.bodyTemplate);
    } else {
      setCode(''); setName(''); setCh('email'); setSubject(''); setBody('');
    }
  }, [template]);

  const channelEndpoints: Record<string, string> = {
    email: '/api/admin/email-templates',
    sms: '/api/admin/sms-templates',
    whatsapp: '/api/admin/whatsapp-templates',
  };

  async function handleSave() {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { templateCode: code, name, channel: ch, bodyTemplate: body, isActive: true };
      if (ch === 'email') payload.subjectTemplate = subject;
      if (isEdit) {
        await apiFetch(`${channelEndpoints[template!.channel]}/${template!.id}`, { method: 'PUT', body: payload });
      } else {
        await apiFetch(channelEndpoints[ch], { method: 'POST', body: payload });
      }
      toast.success(isEdit ? 'Template updated' : 'Template created');
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
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Template' : 'New Template'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Template Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} disabled={isEdit} placeholder="welcome_email" />
            </div>
            <div>
              <Label>Channel</Label>
              <Select value={ch} onValueChange={setCh} disabled={isEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Welcome Email" />
          </div>
          {ch === 'email' && (
            <div>
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Welcome {{firstName}}" />
            </div>
          )}
          <div>
            <Label>Body {ch === 'sms' && <span className="text-muted-foreground ml-2 text-xs">{body.length}/160</span>}</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Hello {{firstName}}..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !code || !name || !body}>
            {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
