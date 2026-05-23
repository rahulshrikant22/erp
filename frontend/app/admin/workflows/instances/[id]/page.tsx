'use client';
import * as React from 'react';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { apiFetch, ApiClientError } from '@/lib/api';
import { toast } from '@/components/ui/sonner';
import { Loader2, CheckCircle2, XCircle, Clock, Ban } from 'lucide-react';

interface WorkflowInstance {
  id: string;
  workflowCode: string;
  workflowName: string;
  targetEntity: string;
  targetEntityId: string;
  status: string;
  currentStep: number;
  initiatedAt: string;
  completedAt: string | null;
  history: HistoryEntry[];
  steps: StepDef[];
}

interface HistoryEntry {
  id: string;
  stepIndex: number;
  action: string;
  actorId: string | null;
  comment: string | null;
  createdAt: string;
}

interface StepDef {
  stepIndex: number;
  stepType: string;
  name: string;
  config: Record<string, unknown>;
}

export default function WorkflowInstancePage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const [instance, setInstance] = React.useState<WorkflowInstance | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [confirmCancel, setConfirmCancel] = React.useState(false);

  const fetch = React.useCallback(async () => {
    try {
      const r = await apiFetch<WorkflowInstance>(`/api/workflows/instances/${id}`);
      setInstance(r);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Could not load instance');
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => { void fetch(); }, [fetch]);

  async function cancelInstance() {
    try {
      await apiFetch(`/api/workflows/instances/${id}/cancel`, { method: 'POST', body: { reason: 'Cancelled from admin UI' } });
      toast.success('Workflow cancelled');
      void fetch();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Cancel failed');
    }
  }

  async function approve() {
    try {
      await apiFetch(`/api/workflows/instances/${id}/approve`, { method: 'POST', body: { comment: 'Approved from admin UI' } });
      toast.success('Step approved');
      void fetch();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Approve failed');
    }
  }

  async function reject() {
    try {
      await apiFetch(`/api/workflows/instances/${id}/reject`, { method: 'POST', body: { comment: 'Rejected from admin UI' } });
      toast.success('Step rejected');
      void fetch();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Reject failed');
    }
  }

  if (loading || !instance) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
      </div>
    );
  }

  const statusVariant = instance.status === 'active' ? 'warning' : instance.status === 'completed' ? 'success' : 'destructive';

  return (
    <>
      <PageHeader
        title={`${instance.workflowName}`}
        description={`${instance.workflowCode} · ${instance.targetEntity}:${instance.targetEntityId.slice(0, 8)}`}
        actions={
          <div className="flex gap-2">
            <Badge variant={statusVariant as 'success'}>{instance.status}</Badge>
            {instance.status === 'active' && (
              <Button variant="destructive" size="sm" onClick={() => setConfirmCancel(true)}>
                <Ban className="mr-1 h-3 w-3" /> Cancel
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Steps</CardTitle>
            <CardDescription>Current position: step {instance.currentStep + 1}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {instance.steps.map((step) => {
                const isCurrent = step.stepIndex === instance.currentStep;
                const isDone = step.stepIndex < instance.currentStep;
                return (
                  <div key={step.stepIndex} className={`flex items-start gap-3 rounded-md border p-3 ${isCurrent ? 'border-amber-300 bg-amber-50' : ''}`}>
                    <div className="mt-0.5">
                      {isDone ? <CheckCircle2 className="h-5 w-5 text-green-600" /> :
                       isCurrent ? <Clock className="h-5 w-5 text-amber-600" /> :
                       <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{step.name}</p>
                      <p className="text-xs text-muted-foreground">Type: {step.stepType} · Step {step.stepIndex + 1}</p>
                    </div>
                  </div>
                );
              })}
              {instance.steps.length === 0 && (
                <p className="text-sm text-muted-foreground">No step definitions available.</p>
              )}
            </div>

            {instance.status === 'active' && (
              <div className="flex gap-2 mt-4">
                <Button size="sm" onClick={approve}>
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Approve
                </Button>
                <Button variant="destructive" size="sm" onClick={reject}>
                  <XCircle className="mr-1 h-3 w-3" /> Reject
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">History</CardTitle>
          </CardHeader>
          <CardContent>
            {instance.history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No history entries.</p>
            ) : (
              <div className="space-y-3">
                {instance.history.map((h) => (
                  <div key={h.id} className="flex gap-3 border-l-2 border-muted pl-3 py-1">
                    <div>
                      <p className="text-sm">
                        <Badge variant="outline" className="mr-2">{h.action}</Badge>
                        Step {h.stepIndex + 1}
                      </p>
                      {h.comment && <p className="text-xs text-muted-foreground mt-0.5">{h.comment}</p>}
                      <p className="text-xs text-muted-foreground mt-0.5">{new Date(h.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel this workflow?"
        description="This will permanently cancel the workflow instance. Pending approvals will be dismissed."
        destructive
        onOpenChange={(o) => { if (!o) setConfirmCancel(false); }}
        onConfirm={() => { void cancelInstance(); setConfirmCancel(false); }}
      />
    </>
  );
}
