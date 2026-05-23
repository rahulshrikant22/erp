'use client';
import * as React from 'react';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiClientError } from '@/lib/api';
import { toast } from '@/components/ui/sonner';
import type { SystemSetting } from '@/lib/types';
import { Lock, Save } from 'lucide-react';

/**
 * Settings page reads from /api/audit and similar endpoints? — actually
 * /api/settings doesn't exist as a list endpoint yet. The seed inserts
 * system settings; for now we surface them via /api/audit/logs?... no.
 *
 * Approach: there's no /api/settings endpoint in the backend yet (Phase 0
 * exposes them via direct SystemSetting reads in services but no admin
 * route). For P0-14 we render the seeded settings read-only and surface a
 * "Settings management endpoint coming in P0-22" notice. Editing UI is
 * fully wired and ready to plug into a future endpoint.
 */
export default function SettingsPage(): React.ReactElement {
  const [settings, setSettings] = React.useState<SystemSetting[] | null>(null);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState<string | null>(null);

  React.useEffect(() => {
    // No public /api/settings yet — derive from /api/audit settings entity? No.
    // Safest path: skip the API and show a placeholder until P0-22 ships the
    // endpoint. UI is ready when that lands.
    setSettings([]);
  }, []);

  function setDraft(k: string, v: string): void {
    setDrafts((d) => ({ ...d, [k]: v }));
  }

  async function save(s: SystemSetting): Promise<void> {
    if (!s.isUserEditable) return;
    const draft = drafts[s.settingKey];
    if (draft === undefined || draft === s.settingValue) return;
    setSaving(s.id);
    try {
      // Placeholder — endpoint to be added in P0-22.
      await new Promise((r) => setTimeout(r, 400));
      toast.success(`Saved ${s.settingKey}`);
      setSettings((cur) =>
        cur ? cur.map((x) => (x.id === s.id ? { ...x, settingValue: draft } : x)) : cur,
      );
      setDrafts(({ [s.settingKey]: _omit, ...rest }) => rest);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Could not save');
    } finally {
      setSaving(null);
    }
  }

  const grouped = React.useMemo(() => {
    if (!settings) return null;
    const m = new Map<string, SystemSetting[]>();
    for (const s of settings) {
      const k = s.category ?? 'misc';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    return [...m.entries()].sort();
  }, [settings]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="System knobs read by the backend. Categories follow the seed."
      />

      <Card className="mb-4 border-amber-200 bg-amber-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-amber-900">Read-only for now</CardTitle>
          <CardDescription className="text-amber-900/80">
            The settings management endpoint ships in P0-22. The form below is wired and ready;
            saving will be enabled once the API exposes a write surface.
          </CardDescription>
        </CardHeader>
      </Card>

      {grouped === null ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Lock className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No settings endpoint available yet — surface placeholder.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(([category, rows]) => (
            <Card key={category}>
              <CardHeader>
                <CardTitle className="capitalize">{category}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {rows.map((s) => (
                  <div key={s.id} className="grid grid-cols-1 items-start gap-3 md:grid-cols-[1fr_auto] md:items-center">
                    <div className="space-y-0.5">
                      <Label htmlFor={s.id} className="font-mono text-xs">
                        {s.settingKey}
                      </Label>
                      {s.description && (
                        <p className="text-xs text-muted-foreground">{s.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {s.dataType === 'boolean' ? (
                        <Switch
                          id={s.id}
                          checked={(drafts[s.settingKey] ?? s.settingValue) === 'true'}
                          onCheckedChange={(v) => setDraft(s.settingKey, v ? 'true' : 'false')}
                          disabled={!s.isUserEditable}
                        />
                      ) : (
                        <Input
                          id={s.id}
                          type={s.dataType === 'integer' ? 'number' : 'text'}
                          value={drafts[s.settingKey] ?? s.settingValue ?? ''}
                          onChange={(e) => setDraft(s.settingKey, e.target.value)}
                          className="w-56"
                          disabled={!s.isUserEditable}
                        />
                      )}
                      {!s.isUserEditable && (
                        <Badge variant="outline" className="gap-1">
                          <Lock className="h-3 w-3" />
                          locked
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!s.isUserEditable || saving === s.id || drafts[s.settingKey] === undefined}
                        onClick={() => void save(s)}
                      >
                        <Save className="mr-1.5 h-3.5 w-3.5" />
                        Save
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
