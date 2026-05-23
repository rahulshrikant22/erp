'use client';
import * as React from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShoppingCart, FileText, Package } from 'lucide-react';

export default function PortalDashboardPage(): React.ReactElement {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome{user?.firstName ? `, ${user.firstName}` : ''}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your customer portal dashboard.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Your Orders</CardTitle>
              <CardDescription className="text-xs">Track and manage orders</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">No orders yet. Order functionality coming in Phase 7.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Recent Quotes</CardTitle>
              <CardDescription className="text-xs">View quotation history</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">No quotes yet. Quote viewing coming in Phase 6.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-700">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Documents</CardTitle>
              <CardDescription className="text-xs">Invoices, delivery notes</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">No documents available yet.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
