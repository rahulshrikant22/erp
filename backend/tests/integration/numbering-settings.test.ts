/**
 * P0-22 integration tests — Numbering series engine & system settings.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { rawPrisma } from '../../src/lib/prisma-base';
import { createInternalUser, loginInternal } from '../helpers';
import { getNextNumber } from '../../src/services/numbering';

let app: Application;
let token: string;

beforeAll(async () => {
  app = createApp();
  const admin = await createInternalUser({ roleCode: 'super_admin' });
  token = (await loginInternal(app, admin.email, admin.password)).accessToken;
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

const auth = () => ({ Authorization: `Bearer ${token}` });

// -- Numbering series engine ------------------------------------------------

describe('Numbering series engine', () => {
  const seriesCode = `TEST_${Date.now()}`;

  it('creates a numbering series via admin API', async () => {
    const res = await request(app)
      .post('/api/admin/numbering-series')
      .set(auth())
      .send({
        seriesCode,
        name: 'Test Series',
        prefix: 'TST',
        yearFormat: 'YYYY',
        separator: '-',
        paddingLength: 5,
        resetYearly: false,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.seriesCode).toBe(seriesCode.toUpperCase());
    expect(res.body.data.currentNumber).toBe(0);
  });

  it('getNextNumber returns sequential numbers', async () => {
    const r1 = await getNextNumber(seriesCode.toUpperCase());
    expect(r1.sequence).toBe(1);
    expect(r1.number).toContain('TST');
    expect(r1.number).toContain('00001');

    const r2 = await getNextNumber(seriesCode.toUpperCase());
    expect(r2.sequence).toBe(2);
  });

  it('concurrent calls produce unique numbers', async () => {
    const results = await Promise.all([
      getNextNumber(seriesCode.toUpperCase()),
      getNextNumber(seriesCode.toUpperCase()),
      getNextNumber(seriesCode.toUpperCase()),
    ]);
    const sequences = results.map((r) => r.sequence);
    const uniqueSeqs = new Set(sequences);
    expect(uniqueSeqs.size).toBe(3);
  });

  it('preview shows next number without incrementing', async () => {
    const beforeRes = await request(app)
      .get(`/api/admin/numbering-series/${seriesCode.toUpperCase()}/preview`)
      .set(auth());
    expect(beforeRes.status).toBe(200);
    const preview = beforeRes.body.data.preview;
    expect(preview).toContain('TST');

    // Get actual next number
    const actual = await getNextNumber(seriesCode.toUpperCase());
    expect(actual.number).toBe(preview);
  });

  it('lists all numbering series', async () => {
    const res = await request(app)
      .get('/api/admin/numbering-series')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.series.length).toBeGreaterThan(0);
  });

  it('updates a numbering series', async () => {
    const listRes = await request(app).get('/api/admin/numbering-series').set(auth());
    const series = listRes.body.data.series.find((s: any) => s.seriesCode === seriesCode.toUpperCase());

    const res = await request(app)
      .put(`/api/admin/numbering-series/${series.id}`)
      .set(auth())
      .send({ name: 'Updated Test Series' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated Test Series');
  });

  it('resets a numbering series', async () => {
    const listRes = await request(app).get('/api/admin/numbering-series').set(auth());
    const series = listRes.body.data.series.find((s: any) => s.seriesCode === seriesCode.toUpperCase());

    const res = await request(app)
      .post(`/api/admin/numbering-series/${series.id}/reset`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.currentNumber).toBe(0);

    // Next number after reset should be 1
    const next = await getNextNumber(seriesCode.toUpperCase());
    expect(next.sequence).toBe(1);
  });
});

// -- Financial year format --------------------------------------------------

describe('Numbering with financial year format', () => {
  const fyCode = `FY_${Date.now()}`;

  it('supports FY format', async () => {
    await request(app)
      .post('/api/admin/numbering-series')
      .set(auth())
      .send({
        seriesCode: fyCode,
        name: 'FY Series',
        prefix: 'INV',
        yearFormat: 'FY',
        separator: '/',
        paddingLength: 4,
      });

    const result = await getNextNumber(fyCode.toUpperCase());
    // Should contain something like INV/2025-26/0001 or INV/2026-27/0001
    expect(result.number).toMatch(/^INV\/\d{4}-\d{2}\/\d{4}$/);
  });
});

// -- System settings --------------------------------------------------------

describe('System settings CRUD', () => {
  const key = `test.setting.${Date.now()}`;

  it('creates a system setting', async () => {
    const res = await request(app)
      .post('/api/admin/settings')
      .set(auth())
      .send({
        settingKey: key,
        settingValue: 'hello',
        dataType: 'string',
        category: 'General',
        description: 'A test setting',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.settingKey).toBe(key);
  });

  it('gets a setting by key', async () => {
    const res = await request(app)
      .get(`/api/admin/settings/${key}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.value).toBe('hello');
  });

  it('updates a setting', async () => {
    const res = await request(app)
      .put(`/api/admin/settings/${key}`)
      .set(auth())
      .send({ value: 'world' });
    expect(res.status).toBe(200);
    expect(res.body.data.settingValue).toBe('world');
  });

  it('lists settings with category filter', async () => {
    const res = await request(app)
      .get('/api/admin/settings?category=General')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.settings.length).toBeGreaterThan(0);
    for (const s of res.body.data.settings) {
      expect(s.category).toBe('General');
    }
  });

  it('lists settings with search', async () => {
    const res = await request(app)
      .get(`/api/admin/settings?search=${key.slice(0, 12)}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.settings.length).toBeGreaterThan(0);
  });

  it('lists categories', async () => {
    const res = await request(app)
      .get('/api/admin/settings/categories')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.categories).toContain('General');
  });

  it('returns 404 for unknown setting', async () => {
    const res = await request(app)
      .get('/api/admin/settings/nonexistent.key')
      .set(auth());
    expect(res.status).toBe(404);
  });
});

describe('System settings type handling', () => {
  it('handles integer settings', async () => {
    const key = `int.setting.${Date.now()}`;
    await request(app)
      .post('/api/admin/settings')
      .set(auth())
      .send({ settingKey: key, settingValue: 42, dataType: 'integer', category: 'General' });

    const res = await request(app).get(`/api/admin/settings/${key}`).set(auth());
    expect(res.body.data.value).toBe(42);
  });

  it('handles boolean settings', async () => {
    const key = `bool.setting.${Date.now()}`;
    await request(app)
      .post('/api/admin/settings')
      .set(auth())
      .send({ settingKey: key, settingValue: true, dataType: 'boolean', category: 'Security' });

    const res = await request(app).get(`/api/admin/settings/${key}`).set(auth());
    expect(res.body.data.value).toBe(true);
  });

  it('handles JSON settings', async () => {
    const key = `json.setting.${Date.now()}`;
    const jsonValue = { features: ['a', 'b'], enabled: true };
    await request(app)
      .post('/api/admin/settings')
      .set(auth())
      .send({ settingKey: key, settingValue: jsonValue, dataType: 'json', category: 'General' });

    const res = await request(app).get(`/api/admin/settings/${key}`).set(auth());
    expect(res.body.data.value).toEqual(jsonValue);
  });
});
