'use client';
import * as React from 'react';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { apiFetch, ApiClientError } from '@/lib/api';
import { toast } from '@/components/ui/sonner';
import { Loader2 } from 'lucide-react';

interface Preferences {
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
  inApp: boolean;
}

const CHANNELS: { key: keyof Preferences; label: string; description: string; alwaysOn?: boolean }[] = [
  { key: 'email', label: 'Email', description: 'Receive notifications via email.' },
  { key: 'sms', label: 'SMS', description: 'Receive notifications via text message.' },
  { key: 'whatsapp', label: 'WhatsApp', description: 'Receive notifications on WhatsApp.' },
  { key: 'inApp', label: 'In-App', description: 'Notifications inside the application. Always enabled for transactional alerts.', alwaysOn: true },
];

export default function CommunicationPreferencesPage(): React.ReactElement {
  const [prefs, setPrefs] = React.useState<Preferences | null>(null);
  const [saving, setSaving] = React.useState<string | null>(null);

  React.useEffect(() => {
    apiFetch<{ preferences: Preferences }>('/api/notifications/preferences')
      .then((r) => setPrefs(r.preferences))
      .catch((err) => {
        toast.error(err instanceof ApiClientError ? err.message : 'Could not load preferences');
        setPrefs({ email: true, sms: true, whatsapp: true, inApp: true });
      });
  }, []);

  async function toggle(key: keyof Preferences, value: boolean) {
    if (!prefs) return;
    setSaving(key);
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    try {
      await apiFetch('/api/notifications/preferences', {
        method: 'PUT',
        body: { [key]: value },
      });
      toast.success(`${key} notifications ${value ? 'enabled' : 'disabled'}`);
    } catch (err) {
      setPrefs(prefs);
      toast.error(err instanceof ApiClientError ? err.message : 'Failed to update');
    } finally {
      setSaving(null);
    }
  }

  if (!prefs) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading preferences...
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Communication Preferences"
        description="Choose how you receive notifications. Transactional alerts are always delivered."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notification Channels</CardTitle>
          <CardDescription>Toggle channels for marketing and optional notifications.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {CHANNELS.map((ch) => (
              <div key={ch.key} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">{ch.label}</Label>
                  <p className="text-xs text-muted-foreground">{ch.description}</p>
                </div>
                <Switch
                  checked={prefs[ch.key]}
                  onCheckedChange={(v) => toggle(ch.key, v)}
                  disabled={ch.alwaysOn || saving === ch.key}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
