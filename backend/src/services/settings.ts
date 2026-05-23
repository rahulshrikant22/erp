/**
 * System settings service — typed key-value store.
 */
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';

export async function getSetting(key: string): Promise<unknown> {
  const row = await prisma.systemSetting.findUnique({ where: { settingKey: key } });
  if (!row) throw new NotFoundError(`Setting "${key}" not found`);
  return deserialize(row.settingValue, row.dataType);
}

export async function getSettingOrDefault<T>(key: string, defaultValue: T): Promise<T> {
  const row = await prisma.systemSetting.findUnique({ where: { settingKey: key } });
  if (!row || row.settingValue === null) return defaultValue;
  return deserialize(row.settingValue, row.dataType) as T;
}

export async function setSetting(
  key: string,
  value: unknown,
  updatedById?: string,
) {
  const row = await prisma.systemSetting.findUnique({ where: { settingKey: key } });
  if (!row) throw new NotFoundError(`Setting "${key}" not found`);
  if (!row.isUserEditable) {
    throw new ValidationError(`Setting "${key}" is not editable`);
  }

  const serialized = serialize(value, row.dataType);

  return prisma.systemSetting.update({
    where: { settingKey: key },
    data: { settingValue: serialized, updatedById },
  });
}

export interface SettingsFilter {
  category?: string;
  search?: string;
}

export async function listSettings(filter: SettingsFilter = {}) {
  const where: any = {};
  if (filter.category) where.category = filter.category;
  if (filter.search) {
    where.OR = [
      { settingKey: { contains: filter.search, mode: 'insensitive' } },
      { description: { contains: filter.search, mode: 'insensitive' } },
    ];
  }

  const settings = await prisma.systemSetting.findMany({
    where,
    orderBy: [{ category: 'asc' }, { settingKey: 'asc' }],
  });

  return settings.map((s) => ({
    ...s,
    parsedValue: s.settingValue !== null ? deserialize(s.settingValue, s.dataType) : null,
  }));
}

export async function listCategories(): Promise<string[]> {
  const result = await prisma.systemSetting.findMany({
    distinct: ['category'],
    where: { category: { not: null } },
    select: { category: true },
    orderBy: { category: 'asc' },
  });
  return result.map((r) => r.category!);
}

export async function createSetting(data: {
  settingKey: string;
  settingValue?: unknown;
  dataType: string;
  category?: string;
  description?: string;
  isUserEditable?: boolean;
  createdById?: string;
}) {
  const serialized = data.settingValue !== undefined
    ? serialize(data.settingValue, data.dataType)
    : null;

  return prisma.systemSetting.create({
    data: {
      settingKey: data.settingKey,
      settingValue: serialized,
      dataType: data.dataType,
      category: data.category ?? null,
      description: data.description ?? null,
      isUserEditable: data.isUserEditable ?? true,
      createdById: data.createdById ?? null,
    },
  });
}

function serialize(value: unknown, dataType: string): string {
  switch (dataType) {
    case 'string': return String(value);
    case 'integer': {
      const n = Number(value);
      if (!Number.isInteger(n)) throw new ValidationError('Value must be an integer');
      return String(n);
    }
    case 'boolean': return String(value === true || value === 'true');
    case 'json': {
      if (typeof value === 'string') {
        JSON.parse(value); // validate
        return value;
      }
      return JSON.stringify(value);
    }
    default: return String(value);
  }
}

function deserialize(raw: string | null, dataType: string): unknown {
  if (raw === null) return null;
  switch (dataType) {
    case 'string': return raw;
    case 'integer': return parseInt(raw, 10);
    case 'boolean': return raw === 'true';
    case 'json': try { return JSON.parse(raw); } catch { return raw; }
    default: return raw;
  }
}
