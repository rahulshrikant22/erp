'use client';
import * as React from 'react';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { apiFetch, ApiClientError } from '@/lib/api';
import { toast } from '@/components/ui/sonner';
import { Loader2, Save, Upload } from 'lucide-react';

interface OrgProfile {
  id: string;
  name: string;
  legalName: string | null;
  gstin: string | null;
  pan: string | null;
  cin: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
  logoUrl: string | null;
  financialYearStart: number | null;
}

export default function OrganizationPage(): React.ReactElement {
  const [org, setOrg] = React.useState<OrgProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState<Partial<OrgProfile>>({});

  React.useEffect(() => {
    apiFetch<OrgProfile>('/api/organization')
      .then((r) => { setOrg(r); setForm(r); })
      .catch((err) => toast.error(err instanceof ApiClientError ? err.message : 'Could not load organization'))
      .finally(() => setLoading(false));
  }, []);

  function set(key: keyof OrgProfile, val: string) {
    setForm((prev) => ({ ...prev, [key]: val || null }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await apiFetch<OrgProfile>('/api/organization', {
        method: 'PUT',
        body: form,
      });
      setOrg(updated);
      setForm(updated);
      toast.success('Organization profile saved');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('logo', file);
    try {
      const r = await apiFetch<{ logoUrl: string }>('/api/organization/logo', {
        method: 'POST',
        formData: fd,
      });
      setForm((prev) => ({ ...prev, logoUrl: r.logoUrl }));
      toast.success('Logo uploaded');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Upload failed');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Organization" description="Your company details and tax information." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Company Details</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <div><Label>Company Name</Label><Input value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} /></div>
            <div><Label>Legal Name</Label><Input value={form.legalName ?? ''} onChange={(e) => set('legalName', e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Phone</Label><Input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></div>
              <div><Label>Email</Label><Input value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} /></div>
            </div>
            <div><Label>Website</Label><Input value={form.website ?? ''} onChange={(e) => set('website', e.target.value)} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Tax & Registration</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <div><Label>GSTIN</Label><Input value={form.gstin ?? ''} onChange={(e) => set('gstin', e.target.value)} placeholder="22AAAAA0000A1Z5" /></div>
            <div><Label>PAN</Label><Input value={form.pan ?? ''} onChange={(e) => set('pan', e.target.value)} placeholder="AAAAA0000A" /></div>
            <div><Label>CIN</Label><Input value={form.cin ?? ''} onChange={(e) => set('cin', e.target.value)} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Address</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <div><Label>Address Line 1</Label><Input value={form.addressLine1 ?? ''} onChange={(e) => set('addressLine1', e.target.value)} /></div>
            <div><Label>Address Line 2</Label><Input value={form.addressLine2 ?? ''} onChange={(e) => set('addressLine2', e.target.value)} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>City</Label><Input value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} /></div>
              <div><Label>State</Label><Input value={form.state ?? ''} onChange={(e) => set('state', e.target.value)} /></div>
              <div><Label>PIN Code</Label><Input value={form.pincode ?? ''} onChange={(e) => set('pincode', e.target.value)} /></div>
            </div>
            <div><Label>Country</Label><Input value={form.country ?? ''} onChange={(e) => set('country', e.target.value)} defaultValue="India" /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Logo</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {form.logoUrl && (
              <img src={form.logoUrl} alt="Company logo" className="h-20 w-auto rounded border" />
            )}
            <div>
              <Label htmlFor="logo-upload" className="cursor-pointer inline-flex items-center gap-2 text-sm text-primary hover:underline">
                <Upload className="h-4 w-4" /> Upload new logo
              </Label>
              <input id="logo-upload" type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-1 h-4 w-4" /> {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </>
  );
}
