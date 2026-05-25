'use client';
import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable } from '@/components/common/data-table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { type ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, Plus } from 'lucide-react';

interface Customer {
  id: string;
  customerCode: string;
  customerName: string;
  customerType: string;
  gstin: string | null;
  pan: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  addresses: Address[];
  contacts: Contact[];
}

interface Address {
  id: string;
  addressType: string;
  addressLine1: string;
  city: string;
  state: string;
  pincode: string;
  isDefaultBilling: boolean;
  isDefaultShipping: boolean;
}

interface Contact {
  id: string;
  contactName: string;
  designation: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
}

const addrColumns: ColumnDef<Address>[] = [
  { accessorKey: 'addressType', header: 'Type', cell: ({ row }) => <Badge variant="outline">{row.original.addressType}</Badge> },
  { accessorKey: 'addressLine1', header: 'Address' },
  { accessorKey: 'city', header: 'City' },
  { accessorKey: 'state', header: 'State' },
  { accessorKey: 'pincode', header: 'Pincode' },
  { id: 'defaults', header: 'Default', cell: ({ row }) => (
    <div className="flex gap-1">
      {row.original.isDefaultBilling && <Badge variant="secondary">Billing</Badge>}
      {row.original.isDefaultShipping && <Badge variant="secondary">Shipping</Badge>}
    </div>
  )},
];

const contactColumns: ColumnDef<Contact>[] = [
  { accessorKey: 'contactName', header: 'Name' },
  { accessorKey: 'designation', header: 'Designation', cell: ({ row }) => row.original.designation || '-' },
  { accessorKey: 'phone', header: 'Phone', cell: ({ row }) => row.original.phone || '-' },
  { accessorKey: 'email', header: 'Email', cell: ({ row }) => row.original.email || '-' },
  { id: 'primary', header: '', cell: ({ row }) => row.original.isPrimary ? <Badge>Primary</Badge> : null },
];

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [customer, setCustomer] = React.useState<Customer | null>(null);
  const [showAddAddr, setShowAddAddr] = React.useState(false);
  const [addrForm, setAddrForm] = React.useState({ addressType: 'shipping', addressLine1: '', city: '', state: '', pincode: '', isDefaultShipping: false, isDefaultBilling: false });
  const [showAddContact, setShowAddContact] = React.useState(false);
  const [contactForm, setContactForm] = React.useState({ contactName: '', designation: '', phone: '', email: '', isPrimary: false });

  const fetchCustomer = React.useCallback(async () => {
    try {
      const res = await apiFetch<{ customer: Customer }>(`/api/customers/${id}`);
      setCustomer(res.customer);
    } catch { toast.error('Failed to load customer'); }
  }, [id]);

  React.useEffect(() => { fetchCustomer(); }, [fetchCustomer]);

  async function saveAddress() {
    try {
      await apiFetch(`/api/customers/${id}/addresses`, { method: 'POST', body: addrForm });
      toast.success('Address added');
      setShowAddAddr(false);
      fetchCustomer();
    } catch (e: any) { toast.error(e.message); }
  }

  async function saveContact() {
    try {
      await apiFetch(`/api/customers/${id}/contacts`, { method: 'POST', body: contactForm });
      toast.success('Contact added');
      setShowAddContact(false);
      fetchCustomer();
    } catch (e: any) { toast.error(e.message); }
  }

  if (!customer) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      <PageHeader
        title={customer.customerName}
        description={`${customer.customerCode} · ${customer.customerType}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push('/admin/customers')}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
            <Badge variant={customer.status === 'active' ? 'default' : 'destructive'}>{customer.status}</Badge>
          </div>
        }
      />

      <Card>
        <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span className="text-muted-foreground">GSTIN:</span> {customer.gstin || '-'}</div>
          <div><span className="text-muted-foreground">PAN:</span> {customer.pan || '-'}</div>
          <div><span className="text-muted-foreground">Phone:</span> {customer.phone || '-'}</div>
          <div><span className="text-muted-foreground">Email:</span> {customer.email || '-'}</div>
        </CardContent>
      </Card>

      <Tabs defaultValue="addresses">
        <TabsList>
          <TabsTrigger value="addresses">Addresses ({customer.addresses?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="contacts">Contacts ({customer.contacts?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="addresses" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowAddAddr(true)}><Plus className="h-4 w-4 mr-1" />Add Address</Button>
          </div>
          <DataTable columns={addrColumns} data={customer.addresses ?? []} pageSize={10} />
        </TabsContent>

        <TabsContent value="contacts" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowAddContact(true)}><Plus className="h-4 w-4 mr-1" />Add Contact</Button>
          </div>
          <DataTable columns={contactColumns} data={customer.contacts ?? []} pageSize={10} />
        </TabsContent>
      </Tabs>

      <Dialog open={showAddAddr} onOpenChange={setShowAddAddr}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Address</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Type</Label>
              <Select value={addrForm.addressType} onValueChange={v => setAddrForm(f => ({ ...f, addressType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="billing">Billing</SelectItem>
                  <SelectItem value="shipping">Shipping</SelectItem>
                  <SelectItem value="site">Site</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Address Line 1 *</Label><Input value={addrForm.addressLine1} onChange={e => setAddrForm(f => ({ ...f, addressLine1: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>City *</Label><Input value={addrForm.city} onChange={e => setAddrForm(f => ({ ...f, city: e.target.value }))} /></div>
              <div><Label>State *</Label><Input value={addrForm.state} onChange={e => setAddrForm(f => ({ ...f, state: e.target.value }))} /></div>
            </div>
            <div><Label>Pincode *</Label><Input value={addrForm.pincode} onChange={e => setAddrForm(f => ({ ...f, pincode: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddAddr(false)}>Cancel</Button>
            <Button onClick={saveAddress} disabled={!addrForm.addressLine1 || !addrForm.city || !addrForm.state || !addrForm.pincode}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddContact} onOpenChange={setShowAddContact}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Name *</Label><Input value={contactForm.contactName} onChange={e => setContactForm(f => ({ ...f, contactName: e.target.value }))} /></div>
            <div><Label>Designation</Label><Input value={contactForm.designation} onChange={e => setContactForm(f => ({ ...f, designation: e.target.value }))} /></div>
            <div><Label>Phone</Label><Input value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div><Label>Email</Label><Input value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddContact(false)}>Cancel</Button>
            <Button onClick={saveContact} disabled={!contactForm.contactName}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
