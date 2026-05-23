'use client';
import * as React from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiFetch, ApiClientError } from '@/lib/api';
import { toast } from '@/components/ui/sonner';
import { Save } from 'lucide-react';

interface Preferences {
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
  inApp: boolean;
}

export default function PortalProfilePage(): React.ReactElement {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account details and preferences.</p>
      </div>

      <Tabs defaultValue="details" className="space-y-4">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="password">Password</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <DetailsTab />
        </TabsContent>
        <TabsContent value="password">
          <PasswordTab />
        </TabsContent>
        <TabsContent value="preferences">
          <PreferencesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DetailsTab() {
  const { user } = useAuth();
  const [firstName, setFirstName] = React.useState(user?.firstName ?? '');
  const [lastName, setLastName] = React.useState(user?.lastName ?? '');
  const [phone, setPhone] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    try {
      await apiFetch('/api/portal/users/me', {
        method: 'PUT',
        body: { firstName, lastName, phone: phone || undefined },
      });
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your Details</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 max-w-lg">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>First Name</Label><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
          <div><Label>Last Name</Label><Input value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
        </div>
        <div><Label>Email</Label><Input value={user?.email ?? ''} disabled /></div>
        <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <Button className="w-fit" onClick={save} disabled={saving}>
          <Save className="mr-1 h-4 w-4" /> {saving ? 'Saving...' : 'Save'}
        </Button>
      </CardContent>
    </Card>
  );
}

function PasswordTab() {
  const [currentPw, setCurrentPw] = React.useState('');
  const [newPw, setNewPw] = React.useState('');
  const [confirmPw, setConfirmPw] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  async function changePassword() {
    if (newPw !== confirmPw) { toast.error('Passwords do not match'); return; }
    setSaving(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword: currentPw, newPassword: newPw },
      });
      toast.success('Password changed');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Change Password</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 max-w-sm">
        <div><Label>Current Password</Label><Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} /></div>
        <div><Label>New Password</Label><Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} /></div>
        <div><Label>Confirm New Password</Label><Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} /></div>
        <Button className="w-fit" onClick={changePassword} disabled={saving || !currentPw || !newPw}>
          {saving ? 'Changing...' : 'Change Password'}
        </Button>
      </CardContent>
    </Card>
  );
}

function PreferencesTab() {
  const [prefs, setPrefs] = React.useState<Preferences | null>(null);
  const [saving, setSaving] = React.useState<string | null>(null);

  React.useEffect(() => {
    apiFetch<{ preferences: Preferences }>('/api/notifications/preferences')
      .then((r) => setPrefs(r.preferences))
      .catch(() => setPrefs({ email: true, sms: true, whatsapp: true, inApp: true }));
  }, []);

  async function toggle(key: keyof Preferences, value: boolean) {
    if (!prefs) return;
    setSaving(key);
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    try {
      await apiFetch('/api/notifications/preferences', { method: 'PUT', body: { [key]: value } });
    } catch {
      setPrefs(prefs);
    } finally {
      setSaving(null);
    }
  }

  const channels: { key: keyof Preferences; label: string }[] = [
    { key: 'email', label: 'Email' },
    { key: 'sms', label: 'SMS' },
    { key: 'whatsapp', label: 'WhatsApp' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Communication Preferences</CardTitle>
        <CardDescription>Choose how you receive notifications.</CardDescription>
      </CardHeader>
      <CardContent>
        {prefs && (
          <div className="divide-y max-w-sm">
            {channels.map((ch) => (
              <div key={ch.key} className="flex items-center justify-between py-3">
                <Label>{ch.label}</Label>
                <Switch
                  checked={prefs[ch.key]}
                  onCheckedChange={(v) => toggle(ch.key, v)}
                  disabled={saving === ch.key}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
