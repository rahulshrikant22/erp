import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { createInternalUser, loginInternal } from '../helpers';

let app: Application;
let token: string;

const TAG = 'E2E_P210_TEST';

beforeAll(async () => {
  app = createApp();
  const admin = await createInternalUser({ roleCode: 'super_admin' });
  const tokens = await loginInternal(app, admin.email, admin.password);
  token = tokens.accessToken;
});

afterAll(async () => {
  await prisma.processCapability.deleteMany({
    where: { process: { processCode: { startsWith: 'TST-' } } },
  });
  await prisma.process.deleteMany({
    where: { processCode: { startsWith: 'TST-' } },
  });
  await prisma.$disconnect();
});

function auth() {
  return { Authorization: `Bearer ${token}` };
}

// ─── Process CRUD ───────────────────────────────────────────────────────────────

describe('Process CRUD', () => {
  let processId: string;

  it('creates a process', async () => {
    const res = await request(app)
      .post('/api/processes')
      .set(auth())
      .send({
        process_code: 'TST-CUT',
        process_name: 'Test Cutting Process',
        process_category: 'cutting',
        standard_time_minutes: 5,
        time_unit: 'per_sheet',
        labor_cost_per_hour: 150,
        machine_cost_per_hour: 200,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.process.processCode).toBe('TST-CUT');
    expect(res.body.data.process.processCategory).toBe('cutting');
    processId = res.body.data.process.id;
  });

  it('rejects duplicate process code', async () => {
    const res = await request(app)
      .post('/api/processes')
      .set(auth())
      .send({
        process_code: 'TST-CUT',
        process_name: 'Duplicate',
        process_category: 'cutting',
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects invalid category', async () => {
    const res = await request(app)
      .post('/api/processes')
      .set(auth())
      .send({
        process_code: 'TST-BAD',
        process_name: 'Bad Category',
        process_category: 'teleportation',
      });
    expect(res.status).toBe(400);
  });

  it('lists processes with filters', async () => {
    const res = await request(app)
      .get('/api/processes?category=cutting&search=TST')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.processes.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);
  });

  it('gets a process by id with capabilities', async () => {
    const res = await request(app)
      .get(`/api/processes/${processId}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.process.id).toBe(processId);
    expect(res.body.data.process.capabilities).toBeInstanceOf(Array);
  });

  it('updates a process', async () => {
    const res = await request(app)
      .put(`/api/processes/${processId}`)
      .set(auth())
      .send({
        process_name: 'Test Cutting Process (Updated)',
        labor_cost_per_hour: 180,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.process.processName).toBe('Test Cutting Process (Updated)');
  });

  it('soft-deletes a process (sets inactive)', async () => {
    const res = await request(app)
      .delete(`/api/processes/${processId}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);

    const check = await request(app)
      .get(`/api/processes/${processId}`)
      .set(auth());
    expect(check.body.data.process.isActive).toBe(false);
  });
});

// ─── Outsourced Process ─────────────────────────────────────────────────────────

describe('Outsourced process', () => {
  let outsourcedId: string;

  it('creates an outsourced process', async () => {
    const res = await request(app)
      .post('/api/processes')
      .set(auth())
      .send({
        process_code: 'TST-OUT',
        process_name: 'Test Outsourced',
        process_category: 'outsource',
        is_outsourced: true,
        default_outsource_vendor_notes: 'External vendor for testing',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.process.isOutsourced).toBe(true);
    expect(res.body.data.process.defaultOutsourceVendorNotes).toBe('External vendor for testing');
    outsourcedId = res.body.data.process.id;
  });

  it('cost calculation for outsourced shows estimate note', async () => {
    const res = await request(app)
      .get(`/api/processes/${outsourcedId}/calculate-cost?quantity=10`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.cost.isOutsourced).toBe(true);
    expect(res.body.data.cost.note).toMatch(/estimate/i);
  });
});

// ─── Capabilities ───────────────────────────────────────────────────────────────

describe('Process capabilities', () => {
  let procId: string;
  let capId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/processes')
      .set(auth())
      .send({
        process_code: 'TST-CAP',
        process_name: 'Process With Capabilities',
        process_category: 'drilling',
        standard_time_minutes: 5,
        time_unit: 'per_panel',
        labor_cost_per_hour: 200,
        machine_cost_per_hour: 500,
      });
    procId = res.body.data.process.id;
  });

  it('adds a capability', async () => {
    const res = await request(app)
      .post(`/api/processes/${procId}/capabilities`)
      .set(auth())
      .send({ capability_key: 'max_thickness_mm', capability_value: '50' });
    expect(res.status).toBe(201);
    expect(res.body.data.capability.capabilityKey).toBe('max_thickness_mm');
    capId = res.body.data.capability.id;
  });

  it('updates a capability', async () => {
    const res = await request(app)
      .put(`/api/processes/${procId}/capabilities/${capId}`)
      .set(auth())
      .send({ capability_key: 'max_thickness_mm', capability_value: '60' });
    expect(res.status).toBe(200);
    expect(res.body.data.capability.capabilityValue).toBe('60');
  });

  it('get process includes capabilities', async () => {
    const res = await request(app)
      .get(`/api/processes/${procId}`)
      .set(auth());
    expect(res.body.data.process.capabilities.length).toBe(1);
    expect(res.body.data.process.capabilities[0].capabilityKey).toBe('max_thickness_mm');
  });

  it('deletes a capability', async () => {
    const res = await request(app)
      .delete(`/api/processes/${procId}/capabilities/${capId}`)
      .set(auth());
    expect(res.status).toBe(200);

    const check = await request(app)
      .get(`/api/processes/${procId}`)
      .set(auth());
    expect(check.body.data.process.capabilities.length).toBe(0);
  });
});

// ─── Cost Calculation ───────────────────────────────────────────────────────────

describe('Cost calculation', () => {
  it('calculates cost with default time', async () => {
    const proc = await prisma.process.findUnique({ where: { processCode: 'BSC' } });
    expect(proc).toBeTruthy();

    const res = await request(app)
      .get(`/api/processes/${proc!.id}/calculate-cost?quantity=10`)
      .set(auth());
    expect(res.status).toBe(200);
    const cost = res.body.data.cost;
    expect(cost.quantity).toBe(10);
    expect(cost.timePerUnitMinutes).toBe(5);
    expect(cost.totalMinutes).toBe(50);
    expect(cost.laborCost).toBeGreaterThan(0);
    expect(cost.machineCost).toBeGreaterThan(0);
    expect(cost.totalCost).toBeCloseTo(cost.laborCost + cost.machineCost, 2);
  });

  it('calculates cost with custom time override', async () => {
    const proc = await prisma.process.findUnique({ where: { processCode: 'BSC' } });

    const res = await request(app)
      .get(`/api/processes/${proc!.id}/calculate-cost?quantity=5&time_minutes=10`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.cost.timePerUnitMinutes).toBe(10);
    expect(res.body.data.cost.totalMinutes).toBe(50);
  });
});

// ─── Delete Guard ───────────────────────────────────────────────────────────────

describe('Delete guard — process used in BOM', () => {
  it('blocks deletion when process is linked to a BOM process line', async () => {
    const proc = await request(app)
      .post('/api/processes')
      .set(auth())
      .send({
        process_code: 'TST-BOM-GUARD',
        process_name: 'BOM Guard Test',
        process_category: 'cutting',
        standard_time_minutes: 5,
        time_unit: 'per_panel',
      });
    const processId = proc.body.data.process.id;

    const product = await prisma.product.findFirst();
    if (!product) return;

    const bom = await prisma.bom.create({
      data: {
        bomCode: `BOM-TST-GUARD-${Date.now()}`,
        productId: product.id,
        bomName: 'Guard Test BOM',
        status: 'draft',
      },
    });

    const version = await prisma.bomVersion.create({
      data: {
        bomId: bom.id,
        versionNumber: 1,
        versionStatus: 'draft',
      },
    });

    await prisma.bomProcessLine.create({
      data: {
        bomVersionId: version.id,
        lineSequence: 1,
        processId,
        quantity: 1,
      },
    });

    const res = await request(app)
      .delete(`/api/processes/${processId}`)
      .set(auth());
    expect(res.status).toBe(409);
    expect(res.body.error.details.code).toBe('IN_USE');

    // Cleanup
    await prisma.bomProcessLine.deleteMany({ where: { bomVersionId: version.id } });
    await prisma.bomVersion.delete({ where: { id: version.id } });
    await prisma.bom.delete({ where: { id: bom.id } });
  });
});

// ─── CSV Import ─────────────────────────────────────────────────────────────────

describe('CSV import', () => {
  it('imports processes from CSV', async () => {
    const csv = [
      'process_code,process_name,process_category,standard_time_minutes,time_unit,labor_cost_per_hour,machine_cost_per_hour,is_outsourced',
      'TST-IMP1,Test Import 1,cutting,3,per_panel,100,50,false',
      'TST-IMP2,Test Import 2,assembly,15,per_unit,120,0,false',
    ].join('\n');

    const res = await request(app)
      .post('/api/processes/import')
      .set(auth())
      .attach('file', Buffer.from(csv), 'processes.csv');
    expect(res.status).toBe(201);
    expect(res.body.data.created).toBe(2);
    expect(res.body.data.errors).toHaveLength(0);
  });

  it('skips duplicate codes on re-import', async () => {
    const csv = [
      'process_code,process_name,process_category',
      'TST-IMP1,Test Import 1 Again,cutting',
    ].join('\n');

    const res = await request(app)
      .post('/api/processes/import')
      .set(auth())
      .attach('file', Buffer.from(csv), 'processes.csv');
    expect(res.status).toBe(201);
    expect(res.body.data.skipped).toBe(1);
    expect(res.body.data.created).toBe(0);
  });

  it('reports errors for invalid categories', async () => {
    const csv = [
      'process_code,process_name,process_category',
      'TST-IMP-BAD,Bad Process,teleportation',
    ].join('\n');

    const res = await request(app)
      .post('/api/processes/import')
      .set(auth())
      .attach('file', Buffer.from(csv), 'processes.csv');
    expect(res.status).toBe(201);
    expect(res.body.data.errors.length).toBe(1);
    expect(res.body.data.errors[0].message).toMatch(/Invalid category/);
  });
});

// ─── Seeded processes ───────────────────────────────────────────────────────────

describe('Seeded processes', () => {
  it('has 16 standard processes', async () => {
    const count = await prisma.process.count({
      where: { processCode: { not: { startsWith: 'TST-' } } },
    });
    expect(count).toBe(16);
  });

  it('outsourced processes have is_outsourced=true', async () => {
    const outsourced = await prisma.process.findMany({
      where: { isOutsourced: true, processCode: { not: { startsWith: 'TST-' } } },
    });
    expect(outsourced.length).toBe(3);
    const codes = outsourced.map((p) => p.processCode).sort();
    expect(codes).toEqual(['GLS-CUT', 'MS-LASER', 'PWD-COAT']);
  });
});
