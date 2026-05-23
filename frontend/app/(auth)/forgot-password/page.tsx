'use client';
import * as React from 'react';
import Link from 'next/link';
import { apiFetch, ApiClientError } from '@/lib/api';
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
import { Loader2, MailCheck } from 'lucide-react';

export default function ForgotPasswordPage(): React.ReactElement {
  const [submitting, setSubmitting] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    try {
      await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        body: { email: String(fd.get('email')) },
        anonymous: true,
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not reach the server.');
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <MailCheck className="h-5 w-5" />
          </div>
          <CardTitle className="text-xl">Check your email</CardTitle>
          <CardDescription>
            If we have an account for that address, a reset link has been sent. The link is
            valid for one hour.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">Forgot your password?</CardTitle>
        <CardDescription>
          Enter the email you sign in with and we&apos;ll send you a link to reset it.
        </CardDescription>
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
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send reset link
          </Button>
          <Link
            href="/login"
            className="text-center text-xs font-medium text-muted-foreground hover:text-primary hover:underline"
          >
            ← Back to sign in
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
