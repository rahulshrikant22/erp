'use client';
import * as React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch, ApiClientError } from '@/lib/api';
import { Loader2, CheckCircle2 } from 'lucide-react';

export default function PortalSignupPage(): React.ReactElement {
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitted, setSubmitted] = React.useState(false);
  const [accountType, setAccountType] = React.useState('dealer');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    try {
      await apiFetch('/api/public/signup', {
        method: 'POST',
        body: {
          companyName: fd.get('companyName'),
          contactFirstName: fd.get('firstName'),
          contactLastName: fd.get('lastName'),
          email: fd.get('email'),
          phone: fd.get('phone'),
          accountType,
          businessDescription: fd.get('description'),
        },
        anonymous: true,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Signup failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="relative min-h-screen bg-slate-50">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
          <Card className="shadow-lg text-center">
            <CardHeader>
              <div className="mx-auto mb-2">
                <CheckCircle2 className="h-12 w-12 text-green-600" />
              </div>
              <CardTitle className="text-xl">Request Submitted</CardTitle>
              <CardDescription>
                Your signup request has been received. Our team will review and approve your account
                within 1-2 business days. You&apos;ll receive an email once approved.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-center">
              <Button asChild variant="outline">
                <Link href="/portal/login">Back to Login</Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-slate-50">
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-6 py-12">
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
            <CardTitle className="text-xl">Create an Account</CardTitle>
            <CardDescription>For dealers, architects, and direct customers.</CardDescription>
          </CardHeader>
          <form onSubmit={onSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {error}
                </p>
              )}

              <div>
                <Label htmlFor="companyName">Company Name</Label>
                <Input id="companyName" name="companyName" required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" name="firstName" required />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" name="lastName" required />
                </div>
              </div>

              <div>
                <Label htmlFor="email">Business Email</Label>
                <Input id="email" name="email" type="email" required />
              </div>

              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" name="phone" type="tel" />
              </div>

              <div>
                <Label>Account Type</Label>
                <Select value={accountType} onValueChange={setAccountType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dealer">Dealer</SelectItem>
                    <SelectItem value="architect">Architect / Designer</SelectItem>
                    <SelectItem value="direct">Direct Customer</SelectItem>
                    <SelectItem value="corporate">Corporate</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="description">About Your Business</Label>
                <Textarea id="description" name="description" rows={3} placeholder="Brief description of your business..." />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Request
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Already have an account?{' '}
                <Link href="/portal/login" className="font-medium text-primary hover:underline">
                  Sign in →
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
