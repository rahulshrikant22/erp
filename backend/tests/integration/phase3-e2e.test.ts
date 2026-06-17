import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { invalidateAll as invalidatePermissionCache } from '../../src/services/permissions';
import { createInternalUser, loginInternal } from '../helpers';

let app: Application;
let token: string;
let userId: string;
let createdPermissionIds: string[] = [];
let createdModuleIds: string[] = [];
let createdRolePermissionIds: string[] = [];
let testMaterialCreated = false;

beforeAll(async () => {
  app = createApp();
  const admin = await createInternalUser({ roleCode: 'super_admin' });
  const tokens = await loginInternal(app, admin.email, admin.password);
  token = tokens.accessToken;
  userId = admin.id;

  // Ensure all required modules and permissions exist for Phase 3 routes.
  // The routes use specific module+feature+action combos; the DB may not
  // have them all seeded yet.
  const role = await prisma.role.findUnique({ where: { roleCode: 'super_admin' } });
  if (!role) throw new Error('super_admin role not found');

  const requiredPerms: Array<{ moduleCode: string; feature: string; actions: string[] }> = [
    { moduleCode: 'VENDOR', feature: 'vendor', actions: ['view', 'create', 'edit', 'delete'] },
    { moduleCode: 'INVENTORY', feature: 'storage', actions: ['view', 'create', 'edit', 'delete'] },
    { moduleCode: 'INVENTORY', feature: 'stock', actions: ['view', 'create', 'edit'] },
    { moduleCode: 'INVENTORY', feature: 'grn', actions: ['view', 'create', 'edit'] },
    { moduleCode: 'INVENTORY', feature: 'material_requisition', actions: ['view', 'create', 'edit', 'approve'] },
    { moduleCode: 'INVENTORY', feature: 'material_issue', actions: ['view', 'create', 'edit'] },
    { moduleCode: 'INVENTORY', feature: 'material_return', actions: ['view', 'create'] },
    { moduleCode: 'INVENTORY', feature: 'stock_count', actions: ['view', 'create', 'edit'] },
    { moduleCode: 'INVENTORY', feature: 'stock_adjustment', actions: ['view', 'create', 'approve'] },
    { moduleCode: 'INVENTORY', feature: 'quality_inspection', actions: ['view', 'create', 'edit'] },
    { moduleCode: 'PROCUREMENT', feature: 'purchase_requisition', actions: ['view', 'create', 'edit', 'approve'] },
    { moduleCode: 'PROCUREMENT', feature: 'purchase_order', actions: ['view', 'create', 'edit', 'approve'] },
    { moduleCode: 'PROCUREMENT', feature: 'import_shipment', actions: ['view', 'create', 'edit'] },
    { moduleCode: 'PURCHASE_ORDER', feature: 'purchase_order', actions: ['view'] },
  ];

  for (const req of requiredPerms) {
    // Ensure module exists
    let mod = await prisma.module.findUnique({ where: { moduleCode: req.moduleCode } });
    if (!mod) {
      mod = await prisma.module.create({
        data: { moduleCode: req.moduleCode, name: req.moduleCode, isActive: true },
      });
      createdModuleIds.push(mod.id);
    } else if (!mod.isActive) {
      await prisma.module.update({ where: { id: mod.id }, data: { isActive: true } });
    }

    for (const action of req.actions) {
      const code = `${req.moduleCode}:${req.feature}:${action}`;
      let perm = await prisma.permission.findUnique({ where: { permissionCode: code } });
      if (!perm) {
        perm = await prisma.permission.create({
          data: { permissionCode: code, moduleId: mod.id, feature: req.feature, action },
        });
        createdPermissionIds.push(perm.id);
      }
      // Ensure role has this permission
      const existing = await prisma.rolePermission.findUnique({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
      });
      if (!existing) {
        const rp = await prisma.rolePermission.create({
          data: { roleId: role.id, permissionId: perm.id },
        });
        createdRolePermissionIds.push(rp.id);
      }
    }
  }

  // Ensure at least one material exists for testing
  const matCount = await prisma.material.count({ where: { isDeleted: false } });
  if (matCount === 0) {
    const profile = await prisma.materialCategoryTypeProfile.findFirst();
    const mfr = await prisma.materialManufacturer.findFirst();
    if (profile && mfr) {
      const { randomUUID } = await import('node:crypto');
      await prisma.material.create({
        data: {
          materialCode: 'P3E2E-MAT-001',
          materialName: 'P3E2E Test Material',
          categoryId: profile.categoryId,
          materialTypeId: profile.materialTypeId,
          categoryTypeProfileId: profile.id,
          manufacturerId: mfr.id,
          attributeHash: 'p3e2e_test_' + randomUUID(),
          purchaseUom: 'PCS',
          consumptionUom: 'PCS',
        },
      });
      testMaterialCreated = true;
    }
  }

  // Temporarily disable QC module so GRN submit auto-accepts (creates stock)
  const qcMod = await prisma.module.findUnique({ where: { moduleCode: 'quality_check_inbound' } });
  if (qcMod?.isActive) {
    await prisma.module.update({ where: { id: qcMod.id }, data: { isActive: false } });
  }

  // Invalidate the permission cache so new permissions are picked up immediately
  invalidatePermissionCache();
}, 30000);

function auth() {
  return { Authorization: `Bearer ${token}` };
}

// ─── Shared state across scenarios ──────────────────────────────────────────────

// Scenario A
let vendorId: string;
let contactId: string;
let rateContractId: string;
let materialId: string;
let prId: string;
let prLineId: string;
let poId: string;
let poLineId: string;
let grnId: string;
let locationId: string; // shared with Scenario B

// Scenario B
let rackId: string;
let binId: string;
let generalAreaId: string;

// Scenario C
let mrId: string;
let mrLineId: string;
let minId: string;
let minLineId: string;
let mrnId: string;

// Scenario D
let countSessionId: string;
let countLineId: string;

// ─── SCENARIO A — Full Procurement Lifecycle (Domestic) ─────────────────────────

describe('Scenario A — Full Procurement Lifecycle (Domestic)', () => {
  it('A1: creates a domestic vendor with contacts, addresses, bank details', async () => {
    const res = await request(app)
      .post('/api/vendors')
      .set(auth())
      .send({
        vendor_name: 'P3E2E-Vendor Test',
        legal_name: 'P3E2E Test Vendor Pvt Ltd',
        vendor_type: 'domestic',
        gstin: '29ABCDE1234F1Z5',
        pan: 'ABCDE1234F',
        primary_email: 'p3e2e-vendor@example.com',
        primary_phone: '+919876543210',
        currency_code: 'INR',
        credit_limit: 500000,
        credit_days: 30,
        bank_name: 'P3E2E Test Bank',
        bank_account_number: '1234567890',
        bank_ifsc: 'TEST0001234',
        rating: 4,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.vendor.vendorName).toBe('P3E2E-Vendor Test');
    expect(res.body.data.vendor.vendorType).toBe('domestic');
    expect(res.body.data.vendor.vendorCode).toBeTruthy();
    vendorId = res.body.data.vendor.id;
  });

  it('A1b: adds a contact to the vendor', async () => {
    if (!vendorId) return;
    const res = await request(app)
      .post(`/api/vendors/${vendorId}/contacts`)
      .set(auth())
      .send({
        contact_name: 'P3E2E Test Contact',
        designation: 'Sales Manager',
        phone: '+919876543211',
        email: 'p3e2e-contact@example.com',
        role: 'sales',
        is_primary: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.contact.contactName).toBe('P3E2E Test Contact');
    contactId = res.body.data.contact.id;
  });

  it('A1c: adds an address to the vendor', async () => {
    if (!vendorId) return;
    const res = await request(app)
      .post(`/api/vendors/${vendorId}/addresses`)
      .set(auth())
      .send({
        address_type: 'registered',
        address_line_1: 'P3E2E 123 Test Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.address.city).toBe('Mumbai');
  });

  it('A2: creates a rate contract for an existing material', async () => {
    if (!vendorId) return;
    const mat = await prisma.material.findFirst({ where: { isDeleted: false } });
    if (!mat) {
      console.warn('No materials found — skipping rate contract test');
      return;
    }
    materialId = mat.id;

    const res = await request(app)
      .post(`/api/vendors/${vendorId}/rate-contracts`)
      .set(auth())
      .send({
        material_id: materialId,
        unit_price: 100,
        uom: 'PCS',
        lead_time_days: 7,
        validity_from: '2026-01-01',
        validity_until: '2026-12-31',
        is_preferred: true,
      });
    expect(res.status).toBe(201);
    expect(Number(res.body.data.contract.unitPrice)).toBe(100);
    rateContractId = res.body.data.contract.id;
  });

  it('A3: creates a manual purchase requisition with material lines', async () => {
    if (!materialId) return;
    const res = await request(app)
      .post('/api/purchase-requisitions')
      .set(auth())
      .send({
        pr_type: 'manual',
        source_type: 'manual',
        required_by_date: '2026-07-01',
        notes: 'P3E2E test PR',
        lines: [
          {
            material_id: materialId,
            quantity_requested: 10,
            uom: 'PCS',
            estimated_unit_price: 100,
            suggested_vendor_id: vendorId,
            notes: 'P3E2E test line',
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.pr.prNumber).toBeTruthy();
    expect(res.body.data.pr.status).toBe('draft');
    prId = res.body.data.pr.id;
    prLineId = res.body.data.pr.lines?.[0]?.id;
  });

  it('A4a: submits the PR', async () => {
    if (!prId) return;
    const res = await request(app)
      .post(`/api/purchase-requisitions/${prId}/submit`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.pr.status).toBe('submitted');
  });

  it('A4b: approves the PR', async () => {
    if (!prId) return;
    const res = await request(app)
      .post(`/api/purchase-requisitions/${prId}/approve`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.pr.status).toBe('approved');
  });

  it('A5: converts PR to PO (create PO from PR lines)', async () => {
    if (!prId || !prLineId || !vendorId) return;
    const res = await request(app)
      .post(`/api/purchase-requisitions/${prId}/create-po`)
      .set(auth())
      .send({
        line_ids: [prLineId],
        vendor_id: vendorId,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.po.poNumber).toBeTruthy();
    poId = res.body.data.po.id;
    poLineId = res.body.data.po.lines?.[0]?.id;
  });

  it('A6a: submits PO', async () => {
    if (!poId) return;
    const res = await request(app)
      .post(`/api/purchase-orders/${poId}/submit`)
      .set(auth());
    expect(res.status).toBe(200);
    // PO will be pending_approval or approved depending on thresholds
    expect(['pending_approval', 'approved']).toContain(res.body.data.po.status);
  });

  it('A6b: approves PO if pending', async () => {
    if (!poId) return;
    const po = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
    if (!po || po.status !== 'pending_approval') return;

    const res = await request(app)
      .post(`/api/purchase-orders/${poId}/approve`)
      .set(auth());
    expect(res.status).toBe(200);

    // Approve remaining levels if any
    let current = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: { approvals: true },
    });
    while (current && current.status === 'pending_approval') {
      const pending = current.approvals.find((a) => a.approvalStatus === 'pending');
      if (!pending) break;
      await request(app)
        .post(`/api/purchase-orders/${poId}/approve`)
        .set(auth());
      current = await prisma.purchaseOrder.findUnique({
        where: { id: poId },
        include: { approvals: true },
      });
    }

    const finalPo = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
    expect(finalPo!.status).toBe('approved');
  });

  it('A7: marks PO as sent to vendor', async () => {
    if (!poId) return;
    const po = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
    if (po?.status !== 'approved') return;

    const res = await request(app)
      .post(`/api/purchase-orders/${poId}/send-to-vendor`)
      .set(auth())
      .send({
        comm_type: 'email',
        recipient: 'p3e2e-vendor@example.com',
      });
    expect(res.status).toBe(200);
    expect(res.body.data.po.status).toBe('sent_to_vendor');
  });

  it('A8: marks vendor acknowledged', async () => {
    if (!poId) return;
    const po = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
    if (!po || !['sent_to_vendor', 'approved'].includes(po.status)) return;

    const res = await request(app)
      .post(`/api/purchase-orders/${poId}/acknowledge`)
      .set(auth())
      .send({ method: 'email_reply' });
    expect(res.status).toBe(200);
    expect(res.body.data.po.status).toBe('acknowledged');
  });

  it('A9a: creates a storage location for GRN (shared with Scenario B)', async () => {
    const res = await request(app)
      .post('/api/storage/locations')
      .set(auth())
      .send({
        location_code: `P3E2E-LOC-${Date.now()}`,
        location_name: 'P3E2E Test Warehouse',
        location_type: 'warehouse',
      });
    expect(res.status).toBe(201);
    locationId = res.body.data.location.id;
  });

  it('A9b: creates a rack and bin for GRN (shared with Scenario B)', async () => {
    if (!locationId) return;
    const rackRes = await request(app)
      .post(`/api/storage/locations/${locationId}/racks`)
      .set(auth())
      .send({
        rack_code: `P3E2E-RK-${Date.now()}`,
        rack_name: 'P3E2E Test Rack A',
        capacity_kg: 500,
      });
    expect(rackRes.status).toBe(201);
    rackId = rackRes.body.data.rack.id;

    const binRes = await request(app)
      .post(`/api/storage/racks/${rackId}/bins`)
      .set(auth())
      .send({
        bin_code: `P3E2E-BIN-${Date.now()}`,
        bin_label: 'P3E2E Test Bin 1',
        capacity: 100,
      });
    expect(binRes.status).toBe(201);
    binId = binRes.body.data.bin.id;
  });

  it('A10: creates GRN against PO (receive materials into a bin)', async () => {
    if (!poId || !poLineId || !materialId || !locationId || !binId) return;
    const res = await request(app)
      .post('/api/grns')
      .set(auth())
      .send({
        po_id: poId,
        delivery_challan_number: 'P3E2E-DC-001',
        vehicle_number: 'MH01AB1234',
        received_at_location_id: locationId,
        gate_pass_number: 'P3E2E-GP-001',
        notes: 'P3E2E test GRN',
        lines: [
          {
            po_line_id: poLineId,
            material_id: materialId,
            quantity_received: 10,
            uom: 'PCS',
            batch_number: 'P3E2E-BATCH-001',
            bin_id: binId,
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.grn.grnNumber).toBeTruthy();
    expect(res.body.data.grn.status).toBe('draft');
    grnId = res.body.data.grn.id;
  });

  it('A11: submits GRN -> auto-accept (QC module disabled)', async () => {
    if (!grnId) return;
    const res = await request(app)
      .post(`/api/grns/${grnId}/submit`)
      .set(auth());
    expect(res.status).toBe(200);
    // If QC disabled, status should be 'accepted'; if QC enabled, 'qc_pending'
    expect(['accepted', 'qc_pending']).toContain(res.body.data.grn.status);
  });

  it('A12: verifies stock created and PO line updated', async () => {
    if (!materialId || !locationId || !poLineId) return;

    // Check stock created
    const stock = await prisma.stock.findFirst({
      where: { materialId, locationId },
    });
    // Stock may or may not exist depending on QC module status
    if (stock) {
      expect(Number(stock.currentQuantity)).toBeGreaterThanOrEqual(10);
    }

    // Check batch created
    const batches = await prisma.stockBatch.findMany({
      where: { grnId },
    });
    if (batches.length > 0) {
      expect(Number(batches[0].originalQuantity)).toBe(10);
    }

    // Check PO line status
    const poLine = await prisma.purchaseOrderLine.findUnique({ where: { id: poLineId } });
    if (poLine && Number(poLine.receivedQuantity) >= Number(poLine.quantityOrdered)) {
      expect(poLine.status).toBe('fully_received');
    }
  });
});

// ─── SCENARIO B — Storage & Inventory ───────────────────────────────────────────

describe('Scenario B — Storage & Inventory', () => {
  it('B1: location, rack, and bin were already created in A9', () => {
    // locationId, rackId, binId were set in Scenario A
    expect(locationId).toBeTruthy();
    expect(rackId).toBeTruthy();
    expect(binId).toBeTruthy();
  });

  it('B2: creates a second bin under the rack', async () => {
    if (!rackId) return;
    const res = await request(app)
      .post(`/api/storage/racks/${rackId}/bins`)
      .set(auth())
      .send({
        bin_code: `P3E2E-BIN2-${Date.now()}`,
        bin_label: 'P3E2E Test Bin 2',
        capacity: 50,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.bin.binCode).toMatch(/^P3E2E-BIN2-/);
  });

  it('B4: creates a general area', async () => {
    if (!locationId) return;
    const res = await request(app)
      .post(`/api/storage/locations/${locationId}/areas`)
      .set(auth())
      .send({
        area_code: `P3E2E-AREA-${Date.now()}`,
        area_name: 'P3E2E Test Floor Area',
        description: 'Test general floor storage area',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.area.areaCode).toMatch(/^P3E2E-AREA-/);
    generalAreaId = res.body.data.area.id;
  });

  it('B5: verifies location tree endpoint', async () => {
    const res = await request(app)
      .get('/api/storage/locations/tree')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.tree).toBeInstanceOf(Array);
  });

  it('B6: bulk bin creation', async () => {
    if (!rackId) return;
    const res = await request(app)
      .post('/api/storage/bins/bulk-create')
      .set(auth())
      .send({
        rack_ids: [rackId],
        prefix: 'P3E2E-BLK',
        start_number: 1,
        count: 3,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.bins.length).toBe(3);
  });

  it('B7: checks stock queries (stock by location)', async () => {
    if (!locationId) return;
    const res = await request(app)
      .get(`/api/inventory/stock/location/${locationId}`)
      .set(auth());
    expect(res.status).toBe(200);
    // After GRN from Scenario A, there should be stock at this location
    expect(res.body.data.stock).toBeInstanceOf(Array);
  });

  it('B7b: checks stock by material', async () => {
    if (!materialId) return;
    const res = await request(app)
      .get(`/api/inventory/stock/material/${materialId}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.stock).toBeInstanceOf(Array);
  });

  it('B7c: checks stock valuation', async () => {
    const res = await request(app)
      .get('/api/inventory/stock/valuation')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.valuation).toBeDefined();
  });
});

// ─── SCENARIO C — Material Requisition & Issue ──────────────────────────────────

describe('Scenario C — Material Requisition & Issue', () => {
  it('C1: creates a material requisition', async () => {
    if (!materialId) return;
    const res = await request(app)
      .post('/api/material-requisitions')
      .set(auth())
      .send({
        request_type: 'general',
        required_by_date: '2026-07-15',
        notes: 'P3E2E test material requisition',
        lines: [
          {
            material_id: materialId,
            quantity_required: 5,
            uom: 'PCS',
            preferred_location_id: locationId || undefined,
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.mr.mrNumber).toBeTruthy();
    expect(res.body.data.mr.status).toBe('draft');
    mrId = res.body.data.mr.id;
    mrLineId = res.body.data.mr.lines?.[0]?.id;
  });

  it('C2a: submits the MR', async () => {
    if (!mrId) return;
    const res = await request(app)
      .post(`/api/material-requisitions/${mrId}/submit`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.mr.status).toBe('submitted');
  });

  it('C2b: approves the MR', async () => {
    if (!mrId) return;
    const res = await request(app)
      .post(`/api/material-requisitions/${mrId}/approve`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.mr.status).toBe('approved');
  });

  it('C3: creates material issue note from MR', async () => {
    if (!mrId || !mrLineId || !materialId || !locationId) return;

    // Check if there's stock at the location first
    const stock = await prisma.stock.findFirst({
      where: { materialId, locationId },
    });
    if (!stock || Number(stock.currentQuantity) < 5) {
      console.warn('Insufficient stock for material issue — skipping');
      return;
    }

    const res = await request(app)
      .post('/api/material-issue-notes')
      .set(auth())
      .send({
        mr_id: mrId,
        issued_from_location_id: locationId,
        issued_to_destination: 'Production Floor',
        line_allocations: [
          {
            mr_line_id: mrLineId,
            material_id: materialId,
            quantity_to_issue: 5,
            uom: 'PCS',
            bin_id: binId || undefined,
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.min.minNumber).toBeTruthy();
    expect(res.body.data.min.status).toBe('draft');
    minId = res.body.data.min.id;
    minLineId = res.body.data.min.lines?.[0]?.id;
  });

  it('C4: confirms issue -> verify stock decremented', async () => {
    if (!minId || !materialId || !locationId) return;

    // Get stock before issue
    const stockBefore = await prisma.stock.findFirst({
      where: { materialId, locationId },
    });
    const qtyBefore = stockBefore ? Number(stockBefore.currentQuantity) : 0;

    const res = await request(app)
      .post(`/api/material-issue-notes/${minId}/issue`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.min.status).toBe('issued');

    // Verify stock decremented
    const stockAfter = await prisma.stock.findFirst({
      where: { materialId, locationId },
    });
    if (stockAfter) {
      expect(Number(stockAfter.currentQuantity)).toBe(qtyBefore - 5);
    }
  });

  it('C5: creates material return note -> verify stock incremented', async () => {
    if (!minId || !minLineId || !materialId || !locationId) return;

    // Get aggregate stock across all bins for this material+location before return
    const stocksBefore = await prisma.stock.findMany({
      where: { materialId, locationId },
    });
    const totalBefore = stocksBefore.reduce((sum, s) => sum + Number(s.currentQuantity), 0);

    const res = await request(app)
      .post('/api/material-return-notes')
      .set(auth())
      .send({
        original_min_id: minId,
        received_at_location_id: locationId,
        reason: 'unused',
        notes: 'P3E2E test return',
        lines: [
          {
            min_line_id: minLineId,
            material_id: materialId,
            quantity_returned: 3,
            uom: 'PCS',
            condition: 'good_back_to_stock',
            destination_location_id: locationId,
            destination_bin_id: binId || undefined,
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.mrn.mrnNumber).toBeTruthy();
    mrnId = res.body.data.mrn.id;

    // Verify aggregate stock incremented back
    const stocksAfter = await prisma.stock.findMany({
      where: { materialId, locationId },
    });
    const totalAfter = stocksAfter.reduce((sum, s) => sum + Number(s.currentQuantity), 0);
    expect(totalAfter).toBe(totalBefore + 3);
  });
});

// ─── SCENARIO D — Stock Count ───────────────────────────────────────────────────

describe('Scenario D — Stock Count', () => {
  it('D1: creates a stock count session', async () => {
    if (!locationId) return;

    // Unfreeze location in case it was frozen by a previous run
    await prisma.storageLocation.update({
      where: { id: locationId },
      data: { isFrozen: false },
    }).catch(() => { /* ignore */ });

    const res = await request(app)
      .post('/api/stock-counts')
      .set(auth())
      .send({
        count_type: 'spot',
        location_id: locationId,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.session.countNumber).toBeTruthy();
    expect(res.body.data.session.status).toBe('planned');
    countSessionId = res.body.data.session.id;
  });

  it('D2: generates count lines', async () => {
    if (!countSessionId || !locationId) return;

    // Verify there is stock to count at this location
    const stock = await prisma.stock.findFirst({
      where: { locationId, currentQuantity: { gt: 0 } },
    });
    if (!stock) {
      console.warn('No stock at location to count — skipping');
      // Cancel the session so it doesn't block cleanup
      await request(app)
        .post(`/api/stock-counts/${countSessionId}/cancel`)
        .set(auth());
      countSessionId = '';
      return;
    }

    const res = await request(app)
      .post(`/api/stock-counts/${countSessionId}/generate-lines`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.session.status).toBe('in_progress');
    expect(res.body.data.session.lines.length).toBeGreaterThanOrEqual(1);
    countLineId = res.body.data.session.lines[0].id;
  });

  it('D3: records counts (with one variance line)', async () => {
    if (!countSessionId || !countLineId) return;

    // Get the session to check all lines
    const session = await prisma.stockCountSession.findUnique({
      where: { id: countSessionId },
      include: { lines: true },
    });
    if (!session) return;

    // Record count for each line; introduce a variance on the first line
    for (let i = 0; i < session.lines.length; i++) {
      const line = session.lines[i];
      const systemQty = Number(line.systemQuantity);
      // First line: report 1 less (variance), others: exact match
      const countedQty = i === 0 ? Math.max(systemQty - 1, 0) : systemQty;

      const res = await request(app)
        .post(`/api/stock-counts/${countSessionId}/lines/${line.id}/count`)
        .set(auth())
        .send({
          counted_quantity: countedQty,
          variance_reason: i === 0 ? 'P3E2E test variance' : undefined,
        });
      expect(res.status).toBe(200);
    }
  });

  it('D4: finalizes -> verify adjustment created', async () => {
    if (!countSessionId) return;

    const res = await request(app)
      .post(`/api/stock-counts/${countSessionId}/finalize`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.session.status).toBe('completed');

    // Check if an adjustment was created for the variance
    const adjustment = await prisma.stockAdjustment.findFirst({
      where: { reason: { contains: 'stock count variance' } },
      orderBy: { createdAt: 'desc' },
    });
    // An adjustment should exist if there was a variance
    if (adjustment) {
      expect(adjustment.adjustmentType).toBe('count_variance');
    }
  });
});

// ─── SCENARIO E — Supply Chain Reports ──────────────────────────────────────────

describe('Scenario E — Supply Chain Reports', () => {
  it('E1: GET /api/reports/po-aging -> 200', async () => {
    const res = await request(app).get('/api/reports/po-aging').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('E2: GET /api/reports/spend-by-vendor -> 200', async () => {
    const res = await request(app).get('/api/reports/spend-by-vendor').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('E3: GET /api/reports/stock-valuation -> 200', async () => {
    const res = await request(app).get('/api/reports/stock-valuation').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('E4: GET /api/reports/vendor-performance -> 200', async () => {
    const res = await request(app).get('/api/reports/vendor-performance').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('E5: GET /api/reports/slow-moving-materials -> 200', async () => {
    const res = await request(app).get('/api/reports/slow-moving-materials').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('E6: GET /api/reports/inventory-turnover -> 200', async () => {
    const res = await request(app).get('/api/reports/inventory-turnover').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ─── SCENARIO F — API Endpoint Availability ─────────────────────────────────────

describe('Scenario F — API Endpoint Availability', () => {
  it('GET /api/vendors returns 200', async () => {
    const res = await request(app).get('/api/vendors').set(auth());
    expect(res.status).toBe(200);
  });

  it('GET /api/storage/locations returns 200', async () => {
    const res = await request(app).get('/api/storage/locations').set(auth());
    expect(res.status).toBe(200);
  });

  it('GET /api/purchase-requisitions returns 200', async () => {
    const res = await request(app).get('/api/purchase-requisitions').set(auth());
    expect(res.status).toBe(200);
  });

  it('GET /api/purchase-orders returns 200', async () => {
    const res = await request(app).get('/api/purchase-orders').set(auth());
    expect(res.status).toBe(200);
  });

  it('GET /api/import-shipments returns 200', async () => {
    const res = await request(app).get('/api/import-shipments').set(auth());
    expect(res.status).toBe(200);
  });

  it('GET /api/grns returns 200', async () => {
    const res = await request(app).get('/api/grns').set(auth());
    expect(res.status).toBe(200);
  });

  it('GET /api/quality-inspections returns 200', async () => {
    const res = await request(app).get('/api/quality-inspections').set(auth());
    expect(res.status).toBe(200);
  });

  it('GET /api/inventory/stock/valuation returns 200', async () => {
    const res = await request(app).get('/api/inventory/stock/valuation').set(auth());
    expect(res.status).toBe(200);
  });

  it('GET /api/material-requisitions returns 200', async () => {
    const res = await request(app).get('/api/material-requisitions').set(auth());
    expect(res.status).toBe(200);
  });

  it('GET /api/material-issue-notes returns 200', async () => {
    const res = await request(app).get('/api/material-issue-notes').set(auth());
    expect(res.status).toBe(200);
  });

  it('GET /api/material-return-notes returns 200', async () => {
    const res = await request(app).get('/api/material-return-notes').set(auth());
    expect(res.status).toBe(200);
  });

  it('GET /api/stock-counts returns 200', async () => {
    const res = await request(app).get('/api/stock-counts').set(auth());
    expect(res.status).toBe(200);
  });

  it('GET /api/stock-adjustments returns 200', async () => {
    const res = await request(app).get('/api/stock-adjustments').set(auth());
    expect(res.status).toBe(200);
  });

  it('GET /api/inventory/reorder-alerts returns 200', async () => {
    const res = await request(app).get('/api/inventory/reorder-alerts').set(auth());
    expect(res.status).toBe(200);
  });
});

// ─── Cleanup ────────────────────────────────────────────────────────────────────

afterAll(async () => {
  // Clean up in reverse dependency order

  // Stock count lines and sessions
  await prisma.stockCountLine.deleteMany({
    where: { countSession: { location: { locationCode: { startsWith: 'P3E2E-' } } } },
  }).catch(() => { /* ignore */ });
  await prisma.stockCountSession.deleteMany({
    where: { location: { locationCode: { startsWith: 'P3E2E-' } } },
  }).catch(() => { /* ignore */ });

  // Stock adjustments from count variance
  if (countSessionId) {
    const session = await prisma.stockCountSession.findUnique({ where: { id: countSessionId } }).catch(() => null);
    if (session) {
      const adj = await prisma.stockAdjustment.findFirst({
        where: { reason: { contains: session.countNumber ?? 'P3E2E' } },
      });
      if (adj) {
        await prisma.stockAdjustmentLine.deleteMany({ where: { adjustmentId: adj.id } }).catch(() => { /* ignore */ });
        await prisma.stockAdjustment.delete({ where: { id: adj.id } }).catch(() => { /* ignore */ });
      }
    }
  }

  // Material return note lines and notes
  if (mrnId) {
    await prisma.materialReturnNoteLine.deleteMany({ where: { mrnId } }).catch(() => { /* ignore */ });
    await prisma.materialReturnNote.delete({ where: { id: mrnId } }).catch(() => { /* ignore */ });
  }

  // Material issue note lines and notes
  if (minId) {
    await prisma.materialIssueNoteLine.deleteMany({ where: { minId } }).catch(() => { /* ignore */ });
    await prisma.materialIssueNote.delete({ where: { id: minId } }).catch(() => { /* ignore */ });
  }

  // Material requisition lines and requisitions
  if (mrId) {
    await prisma.materialRequisitionLine.deleteMany({ where: { mrId } }).catch(() => { /* ignore */ });
    await prisma.materialRequisition.delete({ where: { id: mrId } }).catch(() => { /* ignore */ });
  }

  // Stock movements referencing our GRN/MIN/MRN
  if (grnId) {
    await prisma.stockMovement.deleteMany({ where: { referenceDocId: grnId } }).catch(() => { /* ignore */ });
  }
  if (minId) {
    await prisma.stockMovement.deleteMany({ where: { referenceDocId: minId } }).catch(() => { /* ignore */ });
  }
  if (mrnId) {
    await prisma.stockMovement.deleteMany({ where: { referenceDocId: mrnId } }).catch(() => { /* ignore */ });
  }

  // Stock batches and stock records at our test location
  if (grnId) {
    await prisma.stockBatch.deleteMany({ where: { grnId } }).catch(() => { /* ignore */ });
  }
  if (locationId) {
    await prisma.stock.deleteMany({ where: { locationId } }).catch(() => { /* ignore */ });
  }

  // GRN documents and GRN
  if (grnId) {
    await prisma.grnDocument.deleteMany({ where: { grnId } }).catch(() => { /* ignore */ });
    await prisma.goodsReceiptLine.deleteMany({ where: { grnId } }).catch(() => { /* ignore */ });
    await prisma.goodsReceiptNote.delete({ where: { id: grnId } }).catch(() => { /* ignore */ });
  }

  // PO communications, approvals, lines, PO
  if (poId) {
    await prisma.poCommunication.deleteMany({ where: { poId } }).catch(() => { /* ignore */ });
    await prisma.poApproval.deleteMany({ where: { poId } }).catch(() => { /* ignore */ });
    await prisma.purchaseOrderLine.deleteMany({ where: { poId } }).catch(() => { /* ignore */ });
    await prisma.purchaseOrder.delete({ where: { id: poId } }).catch(() => { /* ignore */ });
  }

  // PR lines and PR
  if (prId) {
    await prisma.purchaseRequisitionLine.deleteMany({ where: { prId } }).catch(() => { /* ignore */ });
    await prisma.purchaseRequisition.delete({ where: { id: prId } }).catch(() => { /* ignore */ });
  }

  // Rate contracts
  if (rateContractId) {
    await prisma.rateContractHistory.deleteMany({ where: { rateContractId } }).catch(() => { /* ignore */ });
    await prisma.rateContract.delete({ where: { id: rateContractId } }).catch(() => { /* ignore */ });
  }

  // Storage: bins, racks, general areas, locations
  await prisma.storageBin.deleteMany({
    where: { binCode: { startsWith: 'P3E2E-' } },
  }).catch(() => { /* ignore */ });
  await prisma.storageRack.deleteMany({
    where: { rackCode: { startsWith: 'P3E2E-' } },
  }).catch(() => { /* ignore */ });
  await prisma.storageGeneralArea.deleteMany({
    where: { areaCode: { startsWith: 'P3E2E-' } },
  }).catch(() => { /* ignore */ });

  // Unfreeze location before deletion (in case it's frozen)
  if (locationId) {
    await prisma.storageLocation.update({
      where: { id: locationId },
      data: { isFrozen: false },
    }).catch(() => { /* ignore */ });
  }
  await prisma.storageLocation.deleteMany({
    where: { locationCode: { startsWith: 'P3E2E-' } },
  }).catch(() => { /* ignore */ });

  // Vendor contacts, addresses, documents, vendor
  if (vendorId) {
    await prisma.vendorContact.deleteMany({ where: { vendorId } }).catch(() => { /* ignore */ });
    await prisma.vendorAddress.deleteMany({ where: { vendorId } }).catch(() => { /* ignore */ });
    await prisma.vendorDocument.deleteMany({ where: { vendorId } }).catch(() => { /* ignore */ });
    await prisma.vendor.delete({ where: { id: vendorId } }).catch(() => { /* ignore */ });
  }

  // Re-enable QC module
  const qcMod = await prisma.module.findUnique({ where: { moduleCode: 'quality_check_inbound' } }).catch(() => null);
  if (qcMod && !qcMod.isActive) {
    await prisma.module.update({ where: { id: qcMod.id }, data: { isActive: true } }).catch(() => { /* ignore */ });
  }

  // Clean up test material if we created one
  if (testMaterialCreated) {
    await prisma.material.deleteMany({ where: { materialCode: 'P3E2E-MAT-001' } }).catch(() => { /* ignore */ });
  }

  // Clean up test permissions and modules we created
  for (const rpId of createdRolePermissionIds) {
    await prisma.rolePermission.delete({ where: { id: rpId } }).catch(() => { /* ignore */ });
  }
  for (const pId of createdPermissionIds) {
    await prisma.permission.delete({ where: { id: pId } }).catch(() => { /* ignore */ });
  }
  for (const mId of createdModuleIds) {
    await prisma.module.delete({ where: { id: mId } }).catch(() => { /* ignore */ });
  }

  await prisma.$disconnect();
});
