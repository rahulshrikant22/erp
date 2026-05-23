'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';
import { cn } from '@/lib/cn';
import { Boxes, LayoutDashboard, User, LogOut, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authStore } from '@/lib/auth-store';

const PUBLIC_PATHS = ['/portal/login', '/portal/signup'];

const NAV = [
  { href: '/portal/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/portal/profile', label: 'Profile', icon: User },
];

export default function PortalLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [menuOpen, setMenuOpen] = React.useState(false);

  const isPublicPage = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  React.useEffect(() => {
    if (!loading && !user && !isPublicPage) {
      router.replace('/portal/login');
    }
  }, [loading, user, isPublicPage, router]);

  if (isPublicPage) return <>{children}</>;

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  function handleLogout() {
    authStore.clear();
    router.replace('/portal/login');
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-white px-4 shadow-sm lg:px-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setMenuOpen((o) => !o)}>
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <Link href="/portal/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sky-700 text-white">
              <Boxes className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold hidden sm:inline">Customer Portal</span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden md:inline">{user.email}</span>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className={cn(
          'fixed inset-y-0 left-0 z-40 w-56 border-r bg-white pt-14 transition-transform lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:translate-x-0',
          menuOpen ? 'translate-x-0' : '-translate-x-full',
        )}>
          <nav className="flex flex-col gap-1 px-3 py-4">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                    active
                      ? 'bg-sky-50 text-sky-800 font-medium'
                      : 'text-foreground/70 hover:bg-slate-100 hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {menuOpen && (
          <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setMenuOpen(false)} />
        )}

        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-4xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
