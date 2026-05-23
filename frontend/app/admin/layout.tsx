'use client';
import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';
import { AdminTopBar } from '@/components/layout/admin-topbar';
import { AdminSidebar } from '@/components/layout/admin-sidebar';
import { apiFetch } from '@/lib/api';
import type { EffectivePermissions } from '@/lib/types';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

const SIDEBAR_W = 'w-60';

export default function AdminLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const [permissions, setPermissions] = React.useState<EffectivePermissions | null>(null);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  // Auth gate.
  React.useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, router, pathname]);

  // Load effective permissions for the navigation filter.
  React.useEffect(() => {
    if (!user || user.userType !== 'internal') return;
    let cancelled = false;
    apiFetch<EffectivePermissions>(`/api/rbac/users/${user.id}/permissions`)
      .then((p) => {
        if (!cancelled) setPermissions(p);
      })
      .catch(() => {
        // Without permissions we'll show only the dashboard. Don't crash the
        // shell over a transient API hiccup.
        if (!cancelled) setPermissions(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AdminTopBar onToggleSidebar={() => setSidebarOpen((s) => !s)} />

      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside
          className={cn(
            SIDEBAR_W,
            'hidden shrink-0 border-r bg-slate-50/40 lg:flex lg:flex-col',
          )}
        >
          <AdminSidebar permissions={permissions} />
        </aside>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
        )}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-background transition-transform lg:hidden',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="flex h-14 items-center px-4 text-sm font-semibold">Menu</div>
          <AdminSidebar
            permissions={permissions}
            onNavigate={() => setSidebarOpen(false)}
          />
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 bg-slate-50/40">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8 lg:py-8">{children}</div>
        </main>
      </div>

      <footer className="flex h-10 shrink-0 items-center justify-between border-t bg-background px-4 text-xs text-muted-foreground lg:px-6">
        <p>
          Modular Furniture ERP · <span className="font-mono">Phase 0 · v0.1.0</span>
        </p>
        <p className="hidden md:block">Connected to localhost:4000</p>
      </footer>
    </div>
  );
}
