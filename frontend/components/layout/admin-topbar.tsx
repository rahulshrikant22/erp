'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';
import {
  Avatar,
  AvatarFallback,
} from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Bell, Menu, Search, Settings, LogOut, KeyRound, User } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface Props {
  onToggleSidebar: () => void;
}

function initials(first?: string, last?: string, email?: string): string {
  const f = (first ?? '').trim();
  const l = (last ?? '').trim();
  if (f || l) return `${f[0] ?? ''}${l[0] ?? ''}`.toUpperCase();
  return (email ?? '?')[0]?.toUpperCase() ?? '?';
}

export function AdminTopBar({ onToggleSidebar }: Props): React.ReactElement {
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onToggleSidebar}
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-white">
          <span className="font-mono text-xs font-semibold">M</span>
        </div>
        <p className="hidden text-sm font-semibold tracking-tight md:block">
          Modular Furniture <span className="font-mono text-xs text-muted-foreground">ERP</span>
        </p>
      </div>

      <div className="ml-4 hidden flex-1 max-w-md md:flex">
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search… (coming soon)"
            disabled
            className="pl-8 bg-muted/30 disabled:cursor-default"
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Notifications (placeholder)"
          disabled
          className="relative"
        >
          <Bell className="h-5 w-5" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full px-1.5 py-1 transition-colors hover:bg-accent"
              aria-label="User menu"
            >
              <Avatar className="h-7 w-7">
                <AvatarFallback>{initials(user?.firstName, user?.lastName, user?.email)}</AvatarFallback>
              </Avatar>
              <span className="hidden max-w-[140px] truncate text-left text-sm md:inline">
                {user?.firstName ? `${user.firstName} ${user.lastName ?? ''}` : user?.email}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
              <span className="text-sm font-semibold leading-tight">
                {user?.firstName ? `${user.firstName} ${user.lastName ?? ''}` : 'Signed in'}
              </span>
              <span className="text-xs font-normal leading-tight text-muted-foreground">
                {user?.email}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/admin/profile')}>
              <User className="mr-2 h-4 w-4" />
              <span>Profile</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/change-password')}>
              <KeyRound className="mr-2 h-4 w-4" />
              <span>Change password</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/admin/settings')}>
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => void logout()}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
