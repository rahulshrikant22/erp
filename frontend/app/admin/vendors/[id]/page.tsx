'use client';
import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2, Star, Upload, AlertTriangle } from 'lucide-react';

interface Contact {
  id: string;
  contactName: string;
  role: string;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
}

interface Address {
  id: string;
  addressType: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

interface VendorDocument {
  id: string;
  documentType: string;
  fileName: string;
  expiryDate: string | null;
  uploadedAt: string;
}

interface RateContract {
  id: string;
  material: { id: string; materialCode: string; materialName: string };
  manufacturer: string | null;
  unitPrice: string;
  currency: string;
  validFrom: string;
  validTo: string;
}

interface POHistoryItem {
  id: string;
  poNumber: string;
  date: string;
  status: string;
  totalValue: string;
  currency: string;
}

interface Performance {
  avgLeadTimeDays: number | null;
  onTimePercent: number | null;
  rejectPercent: number | null;
  totalPOs: number;
  totalGRNs: number;
}

interface Vendor {
  id: string;
  vendorCode: string;
  vendorName: string;
  legalName: string | null;
  vendorType: string;
  gstin: string | null;
  pan: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  paymentTermsDays: number | null;
  rating: number | null;
  status: string;
  contacts: Contact[];
  addresses: Address[];
  documents: VendorDocument[];
  rateContracts: RateContract[];
}

const STATUS_COLORS: Record<string, 'default' | 'destructive' | 'secondary'> = {
  active: 'default',
  blacklisted: 'destructive',
  inactive: 'secondary',
};

const CONTACT_ROLES = ['sales', 'accounts', 'dispatch', 'owner'];
const ADDRESS_TYPES = ['registered', 'factory', 'warehouse', 'billing'];

export default function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [vendor, setVendor] = React.useState<Vendor | null>(null);
  const [poHistory, setPOHistory] = React.useState<POHistoryItem[]>([]);
  const [performance, setPerformance] = React.useState<Performance | null>(null);
  const [saving, setSaving] = React.useState(false);

  const [editForm, setEditForm] = React.useState({
    vendorName: '', legalName: '', vendorType: 'domestic', gstin: '', pan: '',
    primaryEmail: '', primaryPhone: '', bankName: '', bankAccountNumber: '',
    bankIfsc: '', paymentTermsDays: '',
  });

  const [showAddContact, setShowAddContact] = React.useState(false);
  const [contactForm, setContactForm] = React.useState({ contactName: '', role: 'sales', email: '', phone: '', isPrimary: false });

  const [showAddAddress, setShowAddAddress] = React.useState(false);
  const [addressForm, setAddressForm] = React.useState({ addressType: 'registered', line1: '', line2: '', city: '', state: '', pincode: '', country: 'India' });

  const [showAddRate, setShowAddRate] = React.useState(false);
  const [rateForm, setRateForm] = React.useState({ materialId: '', manufacturer: '', unitPrice: '', currency: 'INR', validFrom: '', validTo: '' });

  const fetchVendor = React.useCallback(async () => {
    try {
      const res = await apiFetch<{ vendor: Vendor }>(`/api/vendors/${id}`);
      setVendor(res.vendor);
      setEditForm({
        vendorName: res.vendor.vendorName,
        legalName: res.vendor.legalName ?? '',
        vendorType: res.vendor.vendorType,
        gstin: res.vendor.gstin ?? '',
        pan: res.vendor.pan ?? '',
        primaryEmail: res.vendor.primaryEmail ?? '',
        primaryPhone: res.vendor.primaryPhone ?? '',
        bankName: res.vendor.bankName ?? '',
        bankAccountNumber: res.vendor.bankAccountNumber ?? '',
        bankIfsc: res.vendor.bankIfsc ?? '',
        paymentTermsDays: res.vendor.paymentTermsDays != null ? String(res.vendor.paymentTermsDays) : '',
      });
    } catch {
      toast.error('Failed to load vendor');
    }
  }, [id]);

  const fetchPOHistory = React.useCallback(async () => {
    try {
      const res = await apiFetch<{ purchaseOrders: POHistoryItem[] }>(`/api/vendors/${id}/purchase-orders`);
      setPOHistory(res.purchaseOrders);
    } catch { /* ignore */ }
  }, [id]);

  const fetchPerformance = React.useCallback(async () => {
    try {
      const res = await apiFetch<{ performance: Performance }>(`/api/vendors/${id}/performance`);
      setPerformance(res.performance);
    } catch { /* ignore */ }
  }, [id]);

  React.useEffect(() => { fetchVendor(); }, [fetchVendor]);

  if (!vendor) {
    return <div className="py-8 text-center text-muted-foreground">Loading vendor...</div>;
  }

  async function handleSaveBasicInfo() {
    setSaving(true);
    try {
      await apiFetch(`/api/vendors/${id}`, {
        method: 'PATCH',
        body: {
          vendor_name: editForm.vendorName,
          legal_name: editForm.legalName || null,
          vendor_type: editForm.vendorType,
          gstin: editForm.gstin || null,
          pan: editForm.pan || null,
          primary_email: editForm.primaryEmail || null,
          primary_phone: editForm.primaryPhone || null,
          bank_name: editForm.bankName || null,
          bank_account_number: editForm.bankAccountNumber || null,
          bank_ifsc: editForm.bankIfsc || null,
          payment_terms_days: editForm.paymentTermsDays ? Number(editForm.paymentTermsDays) : null,
        },
      });
      toast.success('Vendor updated');
      fetchVendor();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to update');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddContact() {
    setSaving(true);
    try {
      await apiFetch(`/api/vendors/${id}/contacts`, {
        method: 'POST',
        body: {
          contact_name: contactForm.contactName,
          role: contactForm.role,
          email: contactForm.email || null,
          phone: contactForm.phone || null,
          is_primary: contactForm.isPrimary,
        },
      });
      toast.success('Contact added');
      setShowAddContact(false);
      setContactForm({ contactName: '', role: 'sales', email: '', phone: '', isPrimary: false });
      fetchVendor();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteContact(contactId: string) {
    try {
      await apiFetch(`/api/vendors/${id}/contacts/${contactId}`, { method: 'DELETE' });
      toast.success('Contact removed');
      fetchVendor();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed');
    }
  }

  async function handleAddAddress() {
    setSaving(true);
    try {
      await apiFetch(`/api/vendors/${id}/addresses`, {
        method: 'POST',
        body: {
          address_type: addressForm.addressType,
          line1: addressForm.line1,
          line2: addressForm.line2 || null,
          city: addressForm.city,
          state: addressForm.state,
          pincode: addressForm.pincode,
          country: addressForm.country,
        },
      });
      toast.success('Address added');
      setShowAddAddress(false);
      setAddressForm({ addressType: 'registered', line1: '', line2: '', city: '', state: '', pincode: '', country: 'India' });
      fetchVendor();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAddress(addrId: string) {
    try {
      await apiFetch(`/api/vendors/${id}/addresses/${addrId}`, { method: 'DELETE' });
      toast.success('Address removed');
      fetchVendor();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed');
    }
  }

  async function handleDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('document_type', 'general');
    try {
      await apiFetch(`/api/vendors/${id}/documents`, { formData: fd });
      toast.success('Document uploaded');
      fetchVendor();
    } catch (err: any) {
      toast.error(err.message ?? 'Upload failed');
    }
    e.target.value = '';
  }

  async function handleDeleteDocument(docId: string) {
    try {
      await apiFetch(`/api/vendors/${id}/documents/${docId}`, { method: 'DELETE' });
      toast.success('Document removed');
      fetchVendor();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed');
    }
  }

  async function handleAddRate() {
    setSaving(true);
    try {
      await apiFetch(`/api/vendors/${id}/rate-contracts`, {
        method: 'POST',
        body: {
          material_id: rateForm.materialId,
          manufacturer: rateForm.manufacturer || null,
          unit_price: Number(rateForm.unitPrice),
          currency: rateForm.currency,
          valid_from: rateForm.validFrom,
          valid_to: rateForm.validTo,
        },
      });
      toast.success('Rate contract added');
      setShowAddRate(false);
      setRateForm({ materialId: '', manufacturer: '', unitPrice: '', currency: 'INR', validFrom: '', validTo: '' });
      fetchVendor();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed');
    } finally {
      setSaving(false);
    }
  }

  function isExpiringSoon(date: string | null): boolean {
    if (!date) return false;
    const d = new Date(date);
    const now = new Date();
    const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff <= 30 && diff > 0;
  }

  function isExpired(date: string | null): boolean {
    if (!date) return false;
    return new Date(date) < new Date();
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={vendor.vendorCode}
        description={vendor.vendorName}
        actions={
          <div className="flex gap-2 items-center">
            <Badge variant={STATUS_COLORS[vendor.status] ?? 'outline'}>{vendor.status}</Badge>
            <Button variant="outline" size="sm" onClick={() => router.push('/admin/vendors')}>
              <ArrowLeft className="h-4 w-4 mr-1" />Back
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="basic">
        <TabsList>
          <TabsTrigger value="basic">Basic Info</TabsTrigger>
          <TabsTrigger value="contacts">Contacts ({vendor.contacts?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="addresses">Addresses ({vendor.addresses?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="documents">Documents ({vendor.documents?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="rates">Rate Contracts ({vendor.rateContracts?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="po-history" onClick={() => fetchPOHistory()}>PO History</TabsTrigger>
          <TabsTrigger value="performance" onClick={() => fetchPerformance()}>Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="basic">
          <Card>
            <CardHeader><CardTitle className="text-base">Vendor Information</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Vendor Name *</Label><Input value={editForm.vendorName} onChange={(e) => setEditForm((f) => ({ ...f, vendorName: e.target.value }))} /></div>
                <div><Label>Legal Name</Label><Input value={editForm.legalName} onChange={(e) => setEditForm((f) => ({ ...f, legalName: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Type</Label>
                  <Select value={editForm.vendorType} onValueChange={(v) => setEditForm((f) => ({ ...f, vendorType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="domestic">Domestic</SelectItem>
                      <SelectItem value="import">Import</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>GSTIN</Label><Input value={editForm.gstin} onChange={(e) => setEditForm((f) => ({ ...f, gstin: e.target.value }))} /></div>
                <div><Label>PAN</Label><Input value={editForm.pan} onChange={(e) => setEditForm((f) => ({ ...f, pan: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Email</Label><Input type="email" value={editForm.primaryEmail} onChange={(e) => setEditForm((f) => ({ ...f, primaryEmail: e.target.value }))} /></div>
                <div><Label>Phone</Label><Input value={editForm.primaryPhone} onChange={(e) => setEditForm((f) => ({ ...f, primaryPhone: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Bank Name</Label><Input value={editForm.bankName} onChange={(e) => setEditForm((f) => ({ ...f, bankName: e.target.value }))} /></div>
                <div><Label>Account Number</Label><Input value={editForm.bankAccountNumber} onChange={(e) => setEditForm((f) => ({ ...f, bankAccountNumber: e.target.value }))} /></div>
                <div><Label>IFSC</Label><Input value={editForm.bankIfsc} onChange={(e) => setEditForm((f) => ({ ...f, bankIfsc: e.target.value }))} /></div>
              </div>
              <div className="w-48">
                <Label>Payment Terms (days)</Label>
                <Input type="number" value={editForm.paymentTermsDays} onChange={(e) => setEditForm((f) => ({ ...f, paymentTermsDays: e.target.value }))} />
              </div>
              <div>
                <Button onClick={handleSaveBasicInfo} disabled={saving || !editForm.vendorName}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contacts">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Contacts</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setShowAddContact(true)}>
                <Plus className="h-4 w-4 mr-1" />Add Contact
              </Button>
            </CardHeader>
            <CardContent>
              {(!vendor.contacts || vendor.contacts.length === 0) ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No contacts yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-3">Name</th>
                        <th className="py-2 pr-3">Role</th>
                        <th className="py-2 pr-3">Email</th>
                        <th className="py-2 pr-3">Phone</th>
                        <th className="py-2 pr-3">Primary</th>
                        <th className="py-2 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {vendor.contacts.map((c) => (
                        <tr key={c.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-medium">{c.contactName}</td>
                          <td className="py-2 pr-3"><Badge variant="outline">{c.role}</Badge></td>
                          <td className="py-2 pr-3">{c.email ?? '-'}</td>
                          <td className="py-2 pr-3">{c.phone ?? '-'}</td>
                          <td className="py-2 pr-3">{c.isPrimary ? <Badge>Primary</Badge> : '-'}</td>
                          <td className="py-2">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteContact(c.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="addresses">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Addresses</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setShowAddAddress(true)}>
                <Plus className="h-4 w-4 mr-1" />Add Address
              </Button>
            </CardHeader>
            <CardContent>
              {(!vendor.addresses || vendor.addresses.length === 0) ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No addresses yet</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {vendor.addresses.map((a) => (
                    <Card key={a.id}>
                      <CardContent className="pt-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <Badge variant="outline" className="mb-2">{a.addressType}</Badge>
                            <p className="text-sm">{a.line1}</p>
                            {a.line2 && <p className="text-sm">{a.line2}</p>}
                            <p className="text-sm">{a.city}, {a.state} {a.pincode}</p>
                            <p className="text-sm text-muted-foreground">{a.country}</p>
                          </div>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteAddress(a.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Documents</CardTitle>
              <Button size="sm" variant="outline" asChild>
                <label className="cursor-pointer">
                  <Upload className="h-4 w-4 mr-1" />Upload
                  <input type="file" className="hidden" onChange={handleDocUpload} />
                </label>
              </Button>
            </CardHeader>
            <CardContent>
              {(!vendor.documents || vendor.documents.length === 0) ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No documents yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-3">Type</th>
                        <th className="py-2 pr-3">File</th>
                        <th className="py-2 pr-3">Expiry</th>
                        <th className="py-2 pr-3">Uploaded</th>
                        <th className="py-2 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {vendor.documents.map((d) => (
                        <tr key={d.id} className="border-b last:border-0">
                          <td className="py-2 pr-3"><Badge variant="outline">{d.documentType}</Badge></td>
                          <td className="py-2 pr-3">{d.fileName}</td>
                          <td className="py-2 pr-3">
                            {d.expiryDate ? (
                              <span className="flex items-center gap-1">
                                {isExpired(d.expiryDate) && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                                {isExpiringSoon(d.expiryDate) && !isExpired(d.expiryDate) && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                                <span className={isExpired(d.expiryDate) ? 'text-destructive' : isExpiringSoon(d.expiryDate) ? 'text-amber-600' : ''}>
                                  {new Date(d.expiryDate).toLocaleDateString('en-IN')}
                                </span>
                              </span>
                            ) : '-'}
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground">{new Date(d.uploadedAt).toLocaleDateString('en-IN')}</td>
                          <td className="py-2">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteDocument(d.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rates">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Rate Contracts</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setShowAddRate(true)}>
                <Plus className="h-4 w-4 mr-1" />Add Rate
              </Button>
            </CardHeader>
            <CardContent>
              {(!vendor.rateContracts || vendor.rateContracts.length === 0) ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No rate contracts yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-3">Material</th>
                        <th className="py-2 pr-3">Manufacturer</th>
                        <th className="py-2 pr-3 text-right">Unit Price</th>
                        <th className="py-2 pr-3">Currency</th>
                        <th className="py-2 pr-3">Valid From</th>
                        <th className="py-2 pr-3">Valid To</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendor.rateContracts.map((rc) => (
                        <tr key={rc.id} className="border-b last:border-0">
                          <td className="py-2 pr-3">
                            <Badge variant="outline" className="mr-1">{rc.material.materialCode}</Badge>
                            {rc.material.materialName}
                          </td>
                          <td className="py-2 pr-3">{rc.manufacturer ?? '-'}</td>
                          <td className="py-2 pr-3 text-right font-mono">{Number(rc.unitPrice).toLocaleString('en-IN')}</td>
                          <td className="py-2 pr-3">{rc.currency}</td>
                          <td className="py-2 pr-3">{new Date(rc.validFrom).toLocaleDateString('en-IN')}</td>
                          <td className="py-2 pr-3">{new Date(rc.validTo).toLocaleDateString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="po-history">
          <Card>
            <CardHeader><CardTitle className="text-base">Purchase Order History</CardTitle></CardHeader>
            <CardContent>
              {poHistory.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No purchase orders found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-3">PO #</th>
                        <th className="py-2 pr-3">Date</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3 text-right">Value</th>
                        <th className="py-2 pr-3">Currency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {poHistory.map((po) => (
                        <tr key={po.id} className="border-b last:border-0 cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/admin/purchase-orders/${po.id}`)}>
                          <td className="py-2 pr-3 font-medium">{po.poNumber}</td>
                          <td className="py-2 pr-3">{new Date(po.date).toLocaleDateString('en-IN')}</td>
                          <td className="py-2 pr-3"><Badge variant="outline">{po.status}</Badge></td>
                          <td className="py-2 pr-3 text-right font-mono">{Number(po.totalValue).toLocaleString('en-IN')}</td>
                          <td className="py-2 pr-3">{po.currency}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance">
          <Card>
            <CardHeader><CardTitle className="text-base">Performance Metrics</CardTitle></CardHeader>
            <CardContent>
              {!performance ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Loading performance data...</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-5">
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-xs text-muted-foreground">Avg Lead Time</p>
                      <p className="text-2xl font-semibold">{performance.avgLeadTimeDays != null ? `${performance.avgLeadTimeDays}d` : '-'}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-xs text-muted-foreground">On-Time %</p>
                      <p className="text-2xl font-semibold">{performance.onTimePercent != null ? `${performance.onTimePercent}%` : '-'}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-xs text-muted-foreground">Reject %</p>
                      <p className="text-2xl font-semibold">{performance.rejectPercent != null ? `${performance.rejectPercent}%` : '-'}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-xs text-muted-foreground">Total POs</p>
                      <p className="text-2xl font-semibold">{performance.totalPOs}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <p className="text-xs text-muted-foreground">Total GRNs</p>
                      <p className="text-2xl font-semibold">{performance.totalGRNs}</p>
                    </CardContent>
                  </Card>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showAddContact} onOpenChange={setShowAddContact}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Name *</Label><Input value={contactForm.contactName} onChange={(e) => setContactForm((f) => ({ ...f, contactName: e.target.value }))} /></div>
            <div>
              <Label>Role</Label>
              <Select value={contactForm.role} onValueChange={(v) => setContactForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTACT_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Email</Label><Input type="email" value={contactForm.email} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} /></div>
              <div><Label>Phone</Label><Input value={contactForm.phone} onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))} /></div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="is-primary" checked={contactForm.isPrimary} onChange={(e) => setContactForm((f) => ({ ...f, isPrimary: e.target.checked }))} />
              <Label htmlFor="is-primary">Primary contact</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddContact(false)}>Cancel</Button>
            <Button onClick={handleAddContact} disabled={saving || !contactForm.contactName}>{saving ? 'Adding...' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddAddress} onOpenChange={setShowAddAddress}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Address</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Type</Label>
              <Select value={addressForm.addressType} onValueChange={(v) => setAddressForm((f) => ({ ...f, addressType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ADDRESS_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Line 1 *</Label><Input value={addressForm.line1} onChange={(e) => setAddressForm((f) => ({ ...f, line1: e.target.value }))} /></div>
            <div><Label>Line 2</Label><Input value={addressForm.line2} onChange={(e) => setAddressForm((f) => ({ ...f, line2: e.target.value }))} /></div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label>City *</Label><Input value={addressForm.city} onChange={(e) => setAddressForm((f) => ({ ...f, city: e.target.value }))} /></div>
              <div><Label>State *</Label><Input value={addressForm.state} onChange={(e) => setAddressForm((f) => ({ ...f, state: e.target.value }))} /></div>
              <div><Label>Pincode *</Label><Input value={addressForm.pincode} onChange={(e) => setAddressForm((f) => ({ ...f, pincode: e.target.value }))} /></div>
            </div>
            <div><Label>Country</Label><Input value={addressForm.country} onChange={(e) => setAddressForm((f) => ({ ...f, country: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddAddress(false)}>Cancel</Button>
            <Button onClick={handleAddAddress} disabled={saving || !addressForm.line1 || !addressForm.city || !addressForm.state || !addressForm.pincode}>{saving ? 'Adding...' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddRate} onOpenChange={setShowAddRate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Rate Contract</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Material ID *</Label><Input value={rateForm.materialId} onChange={(e) => setRateForm((f) => ({ ...f, materialId: e.target.value }))} placeholder="Material UUID" /></div>
            <div><Label>Manufacturer</Label><Input value={rateForm.manufacturer} onChange={(e) => setRateForm((f) => ({ ...f, manufacturer: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Unit Price *</Label><Input type="number" value={rateForm.unitPrice} onChange={(e) => setRateForm((f) => ({ ...f, unitPrice: e.target.value }))} /></div>
              <div>
                <Label>Currency</Label>
                <Select value={rateForm.currency} onValueChange={(v) => setRateForm((f) => ({ ...f, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INR">INR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Valid From *</Label><Input type="date" value={rateForm.validFrom} onChange={(e) => setRateForm((f) => ({ ...f, validFrom: e.target.value }))} /></div>
              <div><Label>Valid To *</Label><Input type="date" value={rateForm.validTo} onChange={(e) => setRateForm((f) => ({ ...f, validTo: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddRate(false)}>Cancel</Button>
            <Button onClick={handleAddRate} disabled={saving || !rateForm.materialId || !rateForm.unitPrice || !rateForm.validFrom || !rateForm.validTo}>{saving ? 'Adding...' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
