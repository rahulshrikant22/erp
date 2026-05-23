'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiClientError } from '@/lib/api';
import { authStore } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import type { LoginPayload } from '@/lib/types';

/**
 * Customer-portal login. Same envelope as /api/auth/login but hits
 * /api/portal/auth/login instead. Customers don't share the admin shell;
 * for now we land them on a "thanks, portal coming soon" page since the
 * portal screens themselves are Phase 7.
 */
export default function PortalLoginPage(): React.ReactElement {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [signedIn, setSignedIn] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    try {
      const r = await apiFetch<LoginPayload>('/api/portal/auth/login', {
        method: 'POST',
        body: { email: String(fd.get('email')), password: String(fd.get('password')) },
        anonymous: true,
        skipAutoLogout: true,
      });
      authStore.setSession({
        accessToken: r.accessToken,
        refreshToken: r.refreshToken,
        user: r.user,
      });
      router.replace('/portal/dashboard');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not reach the server.');
    } finally {
      setSubmitting(false);
    }
  }

  if (signedIn) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-slate-50">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-xl">Signed in</CardTitle>
              <CardDescription>
                The customer portal screens are coming in Phase 7. Your session is active and
                will work once the portal UI ships.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button asChild variant="outline" className="w-full">
                <Link href="/login">Switch to admin sign-in</Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-700 text-white shadow-sm">
            <span className="font-mono text-sm font-semibold">P</span>
          </div>
          <p className="text-xs font-mono uppercase tracking-widest text-slate-500">
            Customer Portal
          </p>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">Sign in to the portal</CardTitle>
            <CardDescription>For dealers, architects, and direct customers.</CardDescription>
          </CardHeader>
          <form onSubmit={onSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required autoComplete="email" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign in
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Don&apos;t have an account?{' '}
                <Link href="/portal/signup" className="font-medium text-primary hover:underline">
                  Sign up →
                </Link>
              </p>
              <p className="text-center text-xs text-muted-foreground">
                Internal user?{' '}
                <Link href="/login" className="font-medium text-primary hover:underline">
                  Admin sign-in →
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
