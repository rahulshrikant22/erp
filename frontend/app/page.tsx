'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';

/**
 * Root → kick the user to the admin shell or the login screen depending on
 * whether they have a live session. Fast client-side redirect; the auth
 * provider hydrates from localStorage on first render.
 */
export default function HomePage(): React.ReactElement {
  const router = useRouter();
  const { user, loading } = useAuth();

  React.useEffect(() => {
    if (loading) return;
    router.replace(user ? '/admin/dashboard' : '/login');
  }, [loading, user, router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      Loading…
    </div>
  );
}
