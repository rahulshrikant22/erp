/**
 * Custom fields framework.
 *
 * Each row in core.custom_fields defines an admin-added field for a target
 * entity (e.g. CustomerAccount). Field types map to validation rules;
 * values are stored as JSON in a TBD `customFields` column on the parent
 * entity (Phase 1+ entities will add this column when they need it; for now
 * the framework provides definitions + a value validator).
 *
 * Field types and the keys they accept in `validation_rules`:
 *
 *   text       — { minLength, maxLength, regex, regexMessage }
 *   textarea   — { minLength, maxLength }
 *   number     — { min, max, integer }
 *   date       — { afterIso, beforeIso } (ISO 8601 strings)
 *   url        — no extra rules (URL validity always enforced)
 *   email      — no extra rules (email validity always enforced)
 *   checkbox   — no rules; value must be boolean
 *   dropdown   — { options: string[] } (required); value must be one of options
 *   multiselect— { options: string[], minSelected, maxSelected }; value: string[]
 *
 * Authoritative options for dropdown / multiselect live in `options_json`
 * (an array of objects: [{value: "x", label: "Label X"}, ...]). The
 * validator reads from there; `validation_rules` carries non-option
 * constraints.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError, NotFoundError, ValidationError } from '../errors';

export type CustomFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'url'
  | 'email'
  | 'checkbox'
  | 'dropdown'
  | 'multiselect';

const FIELD_TYPES: ReadonlySet<CustomFieldType> = new Set([
  'text', 'textarea', 'number', 'date', 'url', 'email',
  'checkbox', 'dropdown', 'multiselect',
]);

export interface CustomFieldOption {
  value: string;
  label: string;
}

export interface CustomFieldDefinition {
  id: string;
  targetEntity: string;
  fieldCode: string;
  label: string;
  fieldType: CustomFieldType;
  isRequired: boolean;
  options: CustomFieldOption[] | null;
  validationRules: Record<string, unknown> | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toView(row: {
  id: string;
  targetEntity: string;
  fieldCode: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  optionsJson: unknown;
  validationRules: unknown;
  displayOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): CustomFieldDefinition {
  return {
    id: row.id,
    targetEntity: row.targetEntity,
    fieldCode: row.fieldCode,
    label: row.label,
    fieldType: row.fieldType as CustomFieldType,
    isRequired: row.isRequired,
    options: Array.isArray(row.optionsJson)
      ? (row.optionsJson as CustomFieldOption[])
      : null,
    validationRules: (row.validationRules as Record<string, unknown> | null) ?? null,
    displayOrder: row.displayOrder,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// -- queries -----------------------------------------------------------

export async function listCustomFields(filters: {
  targetEntity?: string;
  isActive?: boolean;
}): Promise<CustomFieldDefinition[]> {
  const where: Prisma.CustomFieldWhereInput = {
    ...(filters.targetEntity ? { targetEntity: filters.targetEntity } : {}),
    ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
  };
  const rows = await prisma.customField.findMany({
    where,
    orderBy: [{ targetEntity: 'asc' }, { displayOrder: 'asc' }, { fieldCode: 'asc' }],
  });
  return rows.map(toView);
}

export async function getCustomField(id: string): Promise<CustomFieldDefinition> {
  const row = await prisma.customField.findUnique({ where: { id } });
  if (!row) throw new NotFoundError('Custom field not found');
  return toView(row);
}

// -- create / update / delete -----------------------------------------

export interface CreateCustomFieldInput {
  targetEntity: string;
  fieldCode: string;
  label: string;
  fieldType: string;
  isRequired?: boolean;
  options?: CustomFieldOption[];
  validationRules?: Record<string, unknown>;
  displayOrder?: number;
}

function assertFieldType(t: string): asserts t is CustomFieldType {
  if (!FIELD_TYPES.has(t as CustomFieldType)) {
    throw new ValidationError(
      `Unknown fieldType "${t}". Allowed: ${[...FIELD_TYPES].join(', ')}`,
      { field: 'fieldType' },
    );
  }
}

function validateDefinition(input: {
  fieldType: CustomFieldType;
  options?: CustomFieldOption[];
}): void {
  if (input.fieldType === 'dropdown' || input.fieldType === 'multiselect') {
    if (!input.options || input.options.length === 0) {
      throw new ValidationError(
        `${input.fieldType} requires a non-empty options array`,
        { field: 'options' },
      );
    }
    const seen = new Set<string>();
    for (const o of input.options) {
      if (!o.value || !o.label) {
        throw new ValidationError(
          'Each option must have non-empty `value` and `label`',
          { field: 'options' },
        );
      }
      if (seen.has(o.value)) {
        throw new ValidationError(`Duplicate option value: ${o.value}`, {
          field: 'options',
        });
      }
      seen.add(o.value);
    }
  }
}

const FIELD_CODE_PATTERN = /^[a-z][a-z0-9_]{0,49}$/;

export async function createCustomField(
  input: CreateCustomFieldInput,
): Promise<CustomFieldDefinition> {
  assertFieldType(input.fieldType);
  if (!FIELD_CODE_PATTERN.test(input.fieldCode)) {
    throw new ValidationError(
      'fieldCode must be lowercase letters/digits/underscores, starting with a letter',
      { field: 'fieldCode' },
    );
  }
  validateDefinition({ fieldType: input.fieldType, options: input.options });

  const dup = await prisma.customField.findFirst({
    where: { targetEntity: input.targetEntity, fieldCode: input.fieldCode },
  });
  if (dup) {
    throw new ConflictError('A custom field with this code already exists for the entity', {
      targetEntity: input.targetEntity,
      fieldCode: input.fieldCode,
    });
  }

  const Pjson = (await import('@prisma/client')).Prisma;
  const created = await prisma.customField.create({
    data: {
      targetEntity: input.targetEntity,
      fieldCode: input.fieldCode,
      label: input.label,
      fieldType: input.fieldType,
      isRequired: input.isRequired ?? false,
      optionsJson:
        input.options !== undefined
          ? (input.options as unknown as Prisma.InputJsonValue)
          : Pjson.JsonNull,
      validationRules:
        input.validationRules !== undefined
          ? (input.validationRules as Prisma.InputJsonValue)
          : Pjson.JsonNull,
      displayOrder: input.displayOrder ?? 0,
      isActive: true,
    },
  });
  return toView(created);
}

export interface UpdateCustomFieldInput {
  label?: string;
  isRequired?: boolean;
  options?: CustomFieldOption[];
  validationRules?: Record<string, unknown>;
  displayOrder?: number;
  isActive?: boolean;
}

export async function updateCustomField(
  id: string,
  input: UpdateCustomFieldInput,
): Promise<CustomFieldDefinition> {
  const row = await prisma.customField.findUnique({ where: { id } });
  if (!row) throw new NotFoundError('Custom field not found');

  if (input.options !== undefined) {
    validateDefinition({ fieldType: row.fieldType as CustomFieldType, options: input.options });
  }

  const Pjson = (await import('@prisma/client')).Prisma;
  const data: Record<string, unknown> = {};
  if (input.label !== undefined) data.label = input.label;
  if (input.isRequired !== undefined) data.isRequired = input.isRequired;
  if (input.options !== undefined) data.optionsJson = input.options as unknown;
  if (input.validationRules !== undefined) {
    data.validationRules =
      input.validationRules === null ? Pjson.JsonNull : input.validationRules;
  }
  if (input.displayOrder !== undefined) data.displayOrder = input.displayOrder;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  await prisma.customField.update({ where: { id }, data });
  return getCustomField(id);
}

/**
 * Delete strategy:
 *   - Phase-0 entities don't yet store custom-field VALUES (the parent
 *     entity needs a `customFields` JSONB column, added when each entity
 *     adopts the framework). So in P0-13 there's no data to scan.
 *   - We still soft-deactivate when `force=false` so a future move to
 *     hard-delete can introspect actual usage. With `force=true` a hard
 *     delete is allowed for clean-up.
 */
export async function deleteCustomField(args: {
  id: string;
  force?: boolean;
}): Promise<{ mode: 'deactivated' | 'deleted' }> {
  const row = await prisma.customField.findUnique({ where: { id: args.id } });
  if (!row) throw new NotFoundError('Custom field not found');

  if (!args.force) {
    if (!row.isActive) return { mode: 'deactivated' };
    await prisma.customField.update({
      where: { id: args.id },
      data: { isActive: false },
    });
    return { mode: 'deactivated' };
  }

  await prisma.customField.delete({ where: { id: args.id } });
  return { mode: 'deleted' };
}

// -- value validation -------------------------------------------------

interface ValidationContext {
  field: CustomFieldDefinition;
  value: unknown;
}

/**
 * Validate a single value against a custom-field definition. Returns
 * normalised value on success (e.g. trimmed string) and throws
 * ValidationError on failure with a detailed message.
 */
export function validateCustomFieldValue(ctx: ValidationContext): unknown {
  const { field, value } = ctx;

  if (value === undefined || value === null || value === '') {
    if (field.isRequired) {
      throw new ValidationError(`${field.fieldCode}: required`, {
        fieldCode: field.fieldCode,
      });
    }
    return null;
  }

  switch (field.fieldType) {
    case 'text':
    case 'textarea': {
      if (typeof value !== 'string') {
        throw new ValidationError(`${field.fieldCode}: must be a string`, {
          fieldCode: field.fieldCode,
        });
      }
      const rules = field.validationRules ?? {};
      const min = (rules.minLength as number | undefined) ?? 0;
      const max = (rules.maxLength as number | undefined) ?? 5000;
      if (value.length < min || value.length > max) {
        throw new ValidationError(
          `${field.fieldCode}: length must be between ${min} and ${max}`,
          { fieldCode: field.fieldCode },
        );
      }
      const regexSrc = rules.regex as string | undefined;
      if (regexSrc) {
        const re = new RegExp(regexSrc);
        if (!re.test(value)) {
          const msg =
            (rules.regexMessage as string | undefined) ?? `does not match pattern ${regexSrc}`;
          throw new ValidationError(`${field.fieldCode}: ${msg}`, {
            fieldCode: field.fieldCode,
          });
        }
      }
      return value;
    }
    case 'number': {
      const n = typeof value === 'string' ? Number(value) : value;
      if (typeof n !== 'number' || Number.isNaN(n)) {
        throw new ValidationError(`${field.fieldCode}: must be a number`, {
          fieldCode: field.fieldCode,
        });
      }
      const rules = field.validationRules ?? {};
      if (rules.integer === true && !Number.isInteger(n)) {
        throw new ValidationError(`${field.fieldCode}: must be an integer`, {
          fieldCode: field.fieldCode,
        });
      }
      const min = rules.min as number | undefined;
      const max = rules.max as number | undefined;
      if (min !== undefined && n < min) {
        throw new ValidationError(`${field.fieldCode}: must be >= ${min}`, {
          fieldCode: field.fieldCode,
        });
      }
      if (max !== undefined && n > max) {
        throw new ValidationError(`${field.fieldCode}: must be <= ${max}`, {
          fieldCode: field.fieldCode,
        });
      }
      return n;
    }
    case 'date': {
      const s = String(value);
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) {
        throw new ValidationError(`${field.fieldCode}: invalid date`, {
          fieldCode: field.fieldCode,
        });
      }
      const rules = field.validationRules ?? {};
      const after = rules.afterIso as string | undefined;
      const before = rules.beforeIso as string | undefined;
      if (after && d <= new Date(after)) {
        throw new ValidationError(`${field.fieldCode}: must be after ${after}`, {
          fieldCode: field.fieldCode,
        });
      }
      if (before && d >= new Date(before)) {
        throw new ValidationError(`${field.fieldCode}: must be before ${before}`, {
          fieldCode: field.fieldCode,
        });
      }
      return d.toISOString();
    }
    case 'url': {
      try {
        return new URL(String(value)).toString();
      } catch {
        throw new ValidationError(`${field.fieldCode}: must be a valid URL`, {
          fieldCode: field.fieldCode,
        });
      }
    }
    case 'email': {
      const s = String(value);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
        throw new ValidationError(`${field.fieldCode}: must be a valid email`, {
          fieldCode: field.fieldCode,
        });
      }
      return s.toLowerCase();
    }
    case 'checkbox': {
      if (typeof value !== 'boolean') {
        throw new ValidationError(`${field.fieldCode}: must be a boolean`, {
          fieldCode: field.fieldCode,
        });
      }
      return value;
    }
    case 'dropdown': {
      const s = String(value);
      const allowed = (field.options ?? []).map((o) => o.value);
      if (!allowed.includes(s)) {
        throw new ValidationError(
          `${field.fieldCode}: must be one of ${allowed.join(', ')}`,
          { fieldCode: field.fieldCode },
        );
      }
      return s;
    }
    case 'multiselect': {
      if (!Array.isArray(value)) {
        throw new ValidationError(`${field.fieldCode}: must be an array`, {
          fieldCode: field.fieldCode,
        });
      }
      const allowed = new Set((field.options ?? []).map((o) => o.value));
      const out: string[] = [];
      for (const v of value) {
        const s = String(v);
        if (!allowed.has(s)) {
          throw new ValidationError(
            `${field.fieldCode}: contains invalid value "${s}"`,
            { fieldCode: field.fieldCode },
          );
        }
        out.push(s);
      }
      const rules = field.validationRules ?? {};
      const min = (rules.minSelected as number | undefined) ?? 0;
      const max = (rules.maxSelected as number | undefined) ?? out.length;
      if (out.length < min || out.length > max) {
        throw new ValidationError(
          `${field.fieldCode}: must select between ${min} and ${max} values`,
          { fieldCode: field.fieldCode },
        );
      }
      return out;
    }
  }
}

/**
 * Validate a complete `customFields` JSON object for an entity. Iterates the
 * active definitions for the target entity, validates each value, and
 * returns a normalized object suitable for storage.
 *
 * - Required fields without a value → throws.
 * - Unknown keys (no matching definition) → throws (strict by design; admins
 *   never want stale field codes silently lingering on rows).
 */
export async function validateCustomFieldValues(args: {
  targetEntity: string;
  values: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const defs = await listCustomFields({
    targetEntity: args.targetEntity,
    isActive: true,
  });
  const byCode = new Map(defs.map((d) => [d.fieldCode, d]));

  // Reject unknown keys.
  for (const k of Object.keys(args.values)) {
    if (!byCode.has(k)) {
      throw new ValidationError(`Unknown custom field "${k}"`, { fieldCode: k });
    }
  }

  const out: Record<string, unknown> = {};
  for (const def of defs) {
    const incoming = args.values[def.fieldCode];
    out[def.fieldCode] = validateCustomFieldValue({ field: def, value: incoming });
  }
  return out;
}
