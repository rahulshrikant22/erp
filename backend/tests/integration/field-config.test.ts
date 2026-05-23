/**
 * P0-13 integration tests — field visibility + custom fields + combined
 * field-config endpoint.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { rawPrisma } from '../../src/lib/prisma-base';
import { createInternalUser, loginInternal } from '../helpers';
import {
  validateCustomFieldValue,
  validateCustomFieldValues,
  type CustomFieldDefinition,
} from '../../src/services/custom-fields';

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

const auth = (): { Authorization: string } => ({ Authorization: `Bearer ${token}` });
const uniqEntity = (): string => `Entity${randomBytes(3).toString('hex').toUpperCase()}`;

// -- field visibility --------------------------------------------------

describe('Field visibility CRUD', () => {
  it('bulk upsert + list reflects + replace removes prior rows', async () => {
    const role = await rawPrisma.role.findFirstOrThrow({ where: { roleCode: 'employee' } });
    const entity = uniqEntity();

    const a = await request(app)
      .post('/api/admin/field-visibility/bulk')
      .set(auth())
      .send({
        roleId: role.id,
        targetEntity: entity,
        entries: [
          { fieldCode: 'salary', visibility: 'hidden' },
          { fieldCode: 'phone', visibility: 'readonly' },
        ],
      });
    expect(a.status).toBe(200);
    expect(a.body.data.rows.length).toBe(2);

    // List filtered.
    const list = await request(app)
      .get(`/api/admin/field-visibility?entity=${entity}&role=${role.id}`)
      .set(auth());
    expect(list.body.data.rows.length).toBe(2);

    // Replace with a single different rule — prior two should be gone.
    const b = await request(app)
      .post('/api/admin/field-visibility/bulk')
      .set(auth())
      .send({
        roleId: role.id,
        targetEntity: entity,
        entries: [{ fieldCode: 'notes', visibility: 'visible', displayOrder: 5 }],
      });
    expect(b.body.data.rows.length).toBe(1);
    expect(b.body.data.rows[0].fieldCode).toBe('notes');
  });

  it('rejects invalid visibility', async () => {
    const role = await rawPrisma.role.findFirstOrThrow({ where: { roleCode: 'employee' } });
    const res = await request(app)
      .post('/api/admin/field-visibility/bulk')
      .set(auth())
      .send({
        roleId: role.id,
        targetEntity: uniqEntity(),
        entries: [{ fieldCode: 'x', visibility: 'fancy' }],
      });
    expect(res.status).toBe(400);
  });

  it('PUT updates a single row, DELETE removes it', async () => {
    const role = await rawPrisma.role.findFirstOrThrow({ where: { roleCode: 'employee' } });
    const entity = uniqEntity();
    const created = await request(app)
      .post('/api/admin/field-visibility/bulk')
      .set(auth())
      .send({
        roleId: role.id,
        targetEntity: entity,
        entries: [{ fieldCode: 'q', visibility: 'visible' }],
      });
    const rowId = created.body.data.rows[0].id;

    const upd = await request(app)
      .put(`/api/admin/field-visibility/${rowId}`)
      .set(auth())
      .send({ visibility: 'readonly' });
    expect(upd.body.data.visibility).toBe('readonly');

    const del = await request(app).delete(`/api/admin/field-visibility/${rowId}`).set(auth());
    expect(del.status).toBe(200);
  });
});

// -- custom fields ----------------------------------------------------

describe('Custom field CRUD + validation', () => {
  it('creates a dropdown field; rejects no-options for dropdown', async () => {
    const entity = uniqEntity();
    const ok = await request(app)
      .post('/api/admin/custom-fields')
      .set(auth())
      .send({
        targetEntity: entity,
        fieldCode: 'gst_type',
        label: 'GST Type',
        fieldType: 'dropdown',
        options: [
          { value: 'regular', label: 'Regular' },
          { value: 'composition', label: 'Composition' },
        ],
        isRequired: true,
      });
    expect(ok.status).toBe(200);
    expect(ok.body.data.fieldType).toBe('dropdown');

    const bad = await request(app)
      .post('/api/admin/custom-fields')
      .set(auth())
      .send({
        targetEntity: entity,
        fieldCode: 'no_opts',
        label: 'X',
        fieldType: 'dropdown',
      });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toMatch(/options/i);
  });

  it('rejects bad fieldCode pattern + duplicate (entity, code)', async () => {
    const entity = uniqEntity();
    await request(app)
      .post('/api/admin/custom-fields')
      .set(auth())
      .send({
        targetEntity: entity,
        fieldCode: 'note',
        label: 'Note',
        fieldType: 'text',
      });
    const dup = await request(app)
      .post('/api/admin/custom-fields')
      .set(auth())
      .send({
        targetEntity: entity,
        fieldCode: 'note',
        label: 'Conflict',
        fieldType: 'text',
      });
    expect(dup.status).toBe(409);

    const badCode = await request(app)
      .post('/api/admin/custom-fields')
      .set(auth())
      .send({
        targetEntity: entity,
        fieldCode: 'BadCASE',
        label: 'X',
        fieldType: 'text',
      });
    expect(badCode.status).toBe(400);
  });

  it('soft-deactivates by default; force hard deletes', async () => {
    const entity = uniqEntity();
    const created = (await request(app)
      .post('/api/admin/custom-fields')
      .set(auth())
      .send({
        targetEntity: entity,
        fieldCode: 'tag',
        label: 'Tag',
        fieldType: 'text',
      })).body.data;

    const soft = await request(app)
      .delete(`/api/admin/custom-fields/${created.id}`)
      .set(auth());
    expect(soft.body.data.mode).toBe('deactivated');

    const stillThere = await request(app)
      .get(`/api/admin/custom-fields/${created.id}`)
      .set(auth());
    expect(stillThere.status).toBe(200);
    expect(stillThere.body.data.isActive).toBe(false);

    const hard = await request(app)
      .delete(`/api/admin/custom-fields/${created.id}?force=true`)
      .set(auth());
    expect(hard.body.data.mode).toBe('deleted');

    const gone = await request(app)
      .get(`/api/admin/custom-fields/${created.id}`)
      .set(auth());
    expect(gone.status).toBe(404);
  });
});

// -- value validation (unit-style) ---------------------------------

describe('Value validation', () => {
  function defOf(overrides: Partial<CustomFieldDefinition>): CustomFieldDefinition {
    const base: CustomFieldDefinition = {
      id: 'x',
      targetEntity: 'X',
      fieldCode: 'f',
      label: 'F',
      fieldType: 'text',
      isRequired: false,
      options: null,
      validationRules: null,
      displayOrder: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return { ...base, ...overrides };
  }

  it('text honors min/max length and regex', () => {
    const def = defOf({
      fieldType: 'text',
      validationRules: { minLength: 3, maxLength: 10, regex: '^[a-z]+$' },
    });
    expect(validateCustomFieldValue({ field: def, value: 'abcd' })).toBe('abcd');
    expect(() => validateCustomFieldValue({ field: def, value: 'ab' })).toThrow();
    expect(() => validateCustomFieldValue({ field: def, value: 'abc123' })).toThrow();
  });

  it('number parses strings, enforces integer/min/max', () => {
    const def = defOf({
      fieldType: 'number',
      validationRules: { integer: true, min: 0, max: 99 },
    });
    expect(validateCustomFieldValue({ field: def, value: '42' })).toBe(42);
    expect(() => validateCustomFieldValue({ field: def, value: 1.5 })).toThrow();
    expect(() => validateCustomFieldValue({ field: def, value: -1 })).toThrow();
    expect(() => validateCustomFieldValue({ field: def, value: 100 })).toThrow();
  });

  it('email lowercases; URL parses; date returns ISO', () => {
    expect(validateCustomFieldValue({
      field: defOf({ fieldType: 'email' }),
      value: 'A@B.com',
    })).toBe('a@b.com');
    expect(validateCustomFieldValue({
      field: defOf({ fieldType: 'url' }),
      value: 'https://example.com/path',
    })).toBe('https://example.com/path');
    const out = validateCustomFieldValue({
      field: defOf({ fieldType: 'date' }),
      value: '2026-05-10',
    });
    expect(typeof out).toBe('string');
    expect(String(out)).toContain('2026-05-10');
  });

  it('dropdown rejects values outside options; multiselect enforces options + bounds', () => {
    const dd = defOf({
      fieldType: 'dropdown',
      options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
    });
    expect(validateCustomFieldValue({ field: dd, value: 'a' })).toBe('a');
    expect(() => validateCustomFieldValue({ field: dd, value: 'c' })).toThrow();

    const ms = defOf({
      fieldType: 'multiselect',
      options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }],
      validationRules: { minSelected: 1, maxSelected: 2 },
    });
    expect(validateCustomFieldValue({ field: ms, value: ['a', 'b'] })).toEqual(['a', 'b']);
    expect(() => validateCustomFieldValue({ field: ms, value: [] })).toThrow();
    expect(() => validateCustomFieldValue({ field: ms, value: ['a', 'b', 'c'] })).toThrow();
    expect(() => validateCustomFieldValue({ field: ms, value: ['x'] })).toThrow();
  });

  it('required rejects missing/empty', () => {
    const def = defOf({ fieldType: 'text', isRequired: true });
    expect(() => validateCustomFieldValue({ field: def, value: '' })).toThrow(/required/);
    expect(() => validateCustomFieldValue({ field: def, value: null })).toThrow();
    expect(() => validateCustomFieldValue({ field: def, value: undefined })).toThrow();
  });

  it('validateCustomFieldValues rejects unknown keys', async () => {
    const entity = uniqEntity();
    await request(app)
      .post('/api/admin/custom-fields')
      .set(auth())
      .send({
        targetEntity: entity,
        fieldCode: 'tag',
        label: 'Tag',
        fieldType: 'text',
      });
    await expect(
      validateCustomFieldValues({ targetEntity: entity, values: { mystery: 'x' } }),
    ).rejects.toThrow(/unknown custom field/i);
  });
});

// -- combined endpoint -------------------------------------------------

describe('GET /api/entities/:entityType/field-config', () => {
  it('returns custom fields + visibility for the calling user', async () => {
    const entity = uniqEntity();

    // Define one custom field.
    await request(app)
      .post('/api/admin/custom-fields')
      .set(auth())
      .send({
        targetEntity: entity,
        fieldCode: 'gstin',
        label: 'GSTIN',
        fieldType: 'text',
        validationRules: { minLength: 15, maxLength: 15 },
      });

    // Set a visibility rule for the super_admin role on this entity.
    const role = await rawPrisma.role.findFirstOrThrow({ where: { roleCode: 'super_admin' } });
    await request(app)
      .post('/api/admin/field-visibility/bulk')
      .set(auth())
      .send({
        roleId: role.id,
        targetEntity: entity,
        entries: [{ fieldCode: 'salary', visibility: 'hidden' }],
      });

    const res = await request(app)
      .get(`/api/entities/${entity}/field-config`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.entityType).toBe(entity);
    expect(res.body.data.customFields.some((f: { fieldCode: string }) => f.fieldCode === 'gstin')).toBe(true);
    expect(res.body.data.visibility.salary).toBe('hidden');
  });

  it('any internal user can hit it', async () => {
    const employee = await createInternalUser({ roleCode: 'employee' });
    const t = (await loginInternal(app, employee.email, employee.password)).accessToken;
    const res = await request(app)
      .get('/api/entities/User/field-config')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
  });
});
