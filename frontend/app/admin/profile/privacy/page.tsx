'use client';
import * as React from 'react';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { apiFetch, ApiClientError } from '@/lib/api';
import { toast } from '@/components/ui/sonner';
import { Download, Trash2 } from 'lucide-react';

interface Consent {
  id: string;
  consentType: string;
  status: string;
  grantedAt: string;
}

export default function PrivacyPage(): React.ReactElement {
  const [consents, setConsents] = React.useState<Consent[]>([]);
  const [confirmExport, setConfirmExport] = React.useState(false);
  const [confirmErasure, setConfirmErasure] = React.useState(false);
  const [erasureReason, setErasureReason] = React.useState('');

  React.useEffect(() => {
    apiFetch<{ consents: Consent[] }>('/api/dpdp/consents')
      .then((r) => setConsents(r.consents))
      .catch(() => {});
  }, []);

  async function requestExport() {
    try {
      await apiFetch('/api/dpdp/export-request', { method: 'POST' });
      toast.success('Data export requested. You will receive an email when ready.');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Request failed');
    }
  }

  async function requestErasure() {
    try {
      await apiFetch('/api/dpdp/erasure-request', {
        method: 'POST',
        body: { reason: erasureReason || 'User requested account deletion' },
      });
      toast.success('Erasure request submitted. Our team will review it.');
      setErasureReason('');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Request failed');
    }
  }

  async function withdrawConsent(consentId: string) {
    try {
      await apiFetch(`/api/dpdp/consents/${consentId}/withdraw`, { method: 'POST' });
      toast.success('Consent withdrawn');
      setConsents((prev) => prev.map((c) => c.id === consentId ? { ...c, status: 'withdrawn' } : c));
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Failed');
    }
  }

  return (
    <>
      <PageHeader
        title="Privacy & Data"
        description="Manage your consents and data under the Digital Personal Data Protection Act."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your Consents</CardTitle>
            <CardDescription>Marketing consents can be withdrawn. Transactional consents are required.</CardDescription>
          </CardHeader>
          <CardContent>
            {consents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No consents recorded.</p>
            ) : (
              <div className="divide-y">
                {consents.map((c) => (
                  <div key={c.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium">{c.consentType}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.status === 'active' ? `Granted ${new Date(c.grantedAt).toLocaleDateString()}` : c.status}
                      </p>
                    </div>
                    {c.status === 'active' && c.consentType !== 'transactional' && (
                      <Button variant="ghost" size="sm" onClick={() => withdrawConsent(c.id)}>Withdraw</Button>
                    )}
                    <Badge variant={c.status === 'active' ? 'success' : 'outline'}>{c.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Download My Data</CardTitle>
              <CardDescription>Request a copy of all your personal data.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => setConfirmExport(true)}>
                <Download className="mr-1 h-4 w-4" /> Request Data Export
              </Button>
            </CardContent>
          </Card>

          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="text-base text-destructive">Delete My Account</CardTitle>
              <CardDescription>Request erasure of your data. Some data may be retained for legal compliance.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Reason (optional)</Label>
                <Textarea value={erasureReason} onChange={(e) => setErasureReason(e.target.value)} rows={2} />
              </div>
              <Button variant="destructive" onClick={() => setConfirmErasure(true)}>
                <Trash2 className="mr-1 h-4 w-4" /> Request Account Deletion
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmExport}
        title="Request Data Export?"
        description="We'll compile your data and email you a download link within 72 hours."
        onOpenChange={(o) => { if (!o) setConfirmExport(false); }}
        onConfirm={() => { void requestExport(); setConfirmExport(false); }}
      />

      <ConfirmDialog
        open={confirmErasure}
        title="Request Account Deletion?"
        description="This will submit a request to delete your account and data. Our team will review it. Some data (invoices, legal records) may be retained as required by law."
        destructive
        onOpenChange={(o) => { if (!o) setConfirmErasure(false); }}
        onConfirm={() => { void requestErasure(); setConfirmErasure(false); }}
      />
    </>
  );
}
