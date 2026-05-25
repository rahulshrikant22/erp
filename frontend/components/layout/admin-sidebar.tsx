'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import {
  LayoutDashboard,
  Layers,
  Users,
  ShieldCheck,
  GitBranch,
  Workflow,
  ScrollText,
  Settings as SettingsIcon,
  FileText,
  Boxes,
  Building2,
  Sparkles,
  Mail,
  MessageSquare,
  Bell,
  Network,
  BadgeCheck,
  MapPin,
  Shield,
  UserCircle,
  Package,
  ShoppingCart,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { EffectivePermissions } from '@/lib/types';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** When set, hide unless the user has at least one of these permission codes. */
  requires?: string[];
  /** When set, hide unless the named module is currently active. */
  requiresModule?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Identity',
    items: [
      {
        href: '/admin/users',
        label: 'Users',
        icon: Users,
        requires: ['AUTH:users:view'],
      },
      {
        href: '/admin/roles',
        label: 'Roles & permissions',
        icon: ShieldCheck,
        requires: ['RBAC:rbac:view'],
      },
    ],
  },
  {
    label: 'Operations',
    items: [
      {
        href: '/admin/modules',
        label: 'Modules',
        icon: Layers,
        requires: ['MOD_MGMT:mod_mgmt:view'],
      },
      {
        href: '/admin/workflows',
        label: 'Workflows',
        icon: Workflow,
        requires: ['WORKFLOW:workflow:view'],
      },
      {
        href: '/admin/audit-logs',
        label: 'Audit logs',
        icon: ScrollText,
        requires: ['AUDIT:audit:view'],
      },
    ],
  },
  {
    label: 'Sales',
    items: [
      {
        href: '/admin/customers',
        label: 'Customers',
        icon: UserCircle,
        requires: ['CUSTOMER:customer:view'],
      },
      {
        href: '/admin/products',
        label: 'Products',
        icon: Package,
        requires: ['CUSTOMER:customer:view'],
      },
      {
        href: '/admin/orders',
        label: 'Orders',
        icon: ShoppingCart,
        requires: ['ORDER:order:view'],
      },
    ],
  },
  {
    label: 'Master data',
    items: [
      {
        href: '/admin/organization',
        label: 'Organization',
        icon: Building2,
        requires: ['MASTER_DATA:master_data:view'],
      },
      {
        href: '/admin/branches',
        label: 'Branches',
        icon: GitBranch,
        requires: ['MASTER_DATA:master_data:view'],
      },
      {
        href: '/admin/departments',
        label: 'Departments',
        icon: Network,
        requires: ['MASTER_DATA:master_data:view'],
      },
      {
        href: '/admin/designations',
        label: 'Designations',
        icon: BadgeCheck,
        requires: ['MASTER_DATA:master_data:view'],
      },
      {
        href: '/admin/locations',
        label: 'Locations',
        icon: MapPin,
        requires: ['MASTER_DATA:master_data:view'],
      },
      {
        href: '/admin/documents',
        label: 'Documents',
        icon: FileText,
        requires: ['DOC_MGMT:doc_mgmt:view'],
      },
      {
        href: '/admin/custom-fields',
        label: 'Custom fields',
        icon: Sparkles,
        requires: ['CUSTOM_FIELDS:custom_fields:view'],
      },
    ],
  },
  {
    label: 'Communication',
    items: [
      {
        href: '/admin/communication/templates',
        label: 'Templates',
        icon: Mail,
        requires: ['COMMS:comms:view'],
      },
      {
        href: '/admin/communication/providers',
        label: 'Providers',
        icon: MessageSquare,
        requires: ['COMMS:comms:view'],
      },
      {
        href: '/admin/communication/log',
        label: 'Notification log',
        icon: Bell,
        requires: ['COMMS:comms:view'],
      },
    ],
  },
  {
    label: 'Compliance',
    items: [
      {
        href: '/admin/compliance/privacy-policy',
        label: 'Privacy policy',
        icon: Shield,
        requires: ['SETTINGS:settings:view'],
      },
      {
        href: '/admin/compliance/terms-of-service',
        label: 'Terms of service',
        icon: Shield,
        requires: ['SETTINGS:settings:view'],
      },
      {
        href: '/admin/compliance/erasure-requests',
        label: 'Data requests',
        icon: Shield,
        requires: ['SETTINGS:settings:view'],
      },
    ],
  },
  {
    label: 'System',
    items: [
      {
        href: '/admin/settings',
        label: 'Settings',
        icon: SettingsIcon,
        requires: ['SETTINGS:settings:view'],
      },
    ],
  },
];

interface SidebarProps {
  permissions: EffectivePermissions | null;
  /** When the screen is small the sidebar is rendered inside a sheet — close on nav. */
  onNavigate?: () => void;
}

function userHas(perms: EffectivePermissions | null, codes: string[] | undefined): boolean {
  if (!codes || codes.length === 0) return true;
  if (!perms) return false;
  const denied = new Set(
    perms.permissions.filter((p) => p.source === 'override-deny').map((p) => p.permissionCode),
  );
  const has = new Set(
    perms.permissions.filter((p) => p.source !== 'override-deny').map((p) => p.permissionCode),
  );
  return codes.some((c) => has.has(c) && !denied.has(c));
}

export function AdminSidebar({ permissions, onNavigate }: SidebarProps): React.ReactElement {
  const pathname = usePathname();

  const visibleGroups = NAV
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => userHas(permissions, i.requires)),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto px-3 py-4">
      <div className="flex items-center gap-2 px-2 pb-2">
        <Boxes className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Admin
        </span>
      </div>

      {visibleGroups.map((group, idx) => (
        <div key={group.label} className={cn('flex flex-col gap-0.5', idx > 0 && 'mt-3')}>
          <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {group.label}
          </p>
          {group.items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  'group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-slate-900 text-slate-50 font-medium'
                    : 'text-foreground/80 hover:bg-accent hover:text-foreground',
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', active ? 'opacity-100' : 'opacity-70 group-hover:opacity-100')} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}

      <div className="mt-auto rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        Phase 0 build · {visibleGroups.reduce((n, g) => n + g.items.length, 0)} sections visible
      </div>
    </nav>
  );
}
