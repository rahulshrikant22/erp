/**
 * Numbering series engine — atomic sequence generation.
 *
 * getNextNumber('ORD') → 'ORD/2026/0042'
 *
 * Uses a DB transaction with row-level locking to guarantee uniqueness
 * even under concurrent requests. Financial year resets happen
 * automatically on first use after the year boundary (April 1 in India).
 */
import { prisma } from '../lib/prisma';
import { rawPrisma } from '../lib/prisma-base';
import { NotFoundError, ValidationError } from '../errors';

function getIndianFinancialYear(date: Date = new Date()): { start: Date; label: string; shortLabel: string } {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  const fyStartYear = month >= 3 ? year : year - 1; // April = month 3
  return {
    start: new Date(fyStartYear, 3, 1), // April 1
    label: `${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`,
    shortLabel: `${String(fyStartYear).slice(-2)}${String(fyStartYear + 1).slice(-2)}`,
  };
}

function formatYear(date: Date, yearFormat: string): string {
  const fy = getIndianFinancialYear(date);
  switch (yearFormat) {
    case 'YYYY': return String(date.getFullYear());
    case 'YY': return String(date.getFullYear()).slice(-2);
    case 'FY': return fy.label;
    case 'FYSHORT': return fy.shortLabel;
    case 'none': return '';
    default: return String(date.getFullYear());
  }
}

function formatNumber(
  prefix: string | null,
  yearStr: string,
  separator: string,
  num: number,
  paddingLength: number,
): string {
  const parts: string[] = [];
  if (prefix) parts.push(prefix);
  if (yearStr) parts.push(yearStr);
  parts.push(String(num).padStart(paddingLength, '0'));
  return parts.join(separator);
}

/**
 * Atomically get the next number for a series. Uses raw SQL with
 * FOR UPDATE to prevent race conditions.
 */
export async function getNextNumber(
  seriesCode: string,
  _branchCode?: string,
): Promise<{ number: string; sequence: number }> {
  return rawPrisma.$transaction(async (tx) => {
    // Lock the row
    const rows = await tx.$queryRaw<Array<{
      id: string;
      prefix: string | null;
      year_format: string;
      separator: string;
      padding_length: number;
      current_number: number;
      reset_yearly: boolean;
      last_reset_at: Date | null;
      is_active: boolean;
    }>>`
      SELECT id, prefix, year_format, separator, padding_length,
             current_number, reset_yearly, last_reset_at, is_active
      FROM core.numbering_series
      WHERE series_code = ${seriesCode}
      FOR UPDATE
    `;

    if (rows.length === 0) {
      throw new NotFoundError(`Numbering series "${seriesCode}" not found`);
    }
    const row = rows[0];
    if (!row.is_active) {
      throw new ValidationError(`Numbering series "${seriesCode}" is inactive`);
    }

    const now = new Date();
    let nextNum = row.current_number + 1;

    // Check if we need a yearly reset
    if (row.reset_yearly) {
      const currentFy = getIndianFinancialYear(now);
      const lastResetFy = row.last_reset_at
        ? getIndianFinancialYear(row.last_reset_at)
        : null;

      if (!lastResetFy || currentFy.start.getTime() !== lastResetFy.start.getTime()) {
        nextNum = 1;
        await tx.$executeRaw`
          UPDATE core.numbering_series
          SET current_number = 1, last_reset_at = ${now}, updated_at = ${now}
          WHERE id = ${row.id}
        `;
      } else {
        await tx.$executeRaw`
          UPDATE core.numbering_series
          SET current_number = ${nextNum}, updated_at = ${now}
          WHERE id = ${row.id}
        `;
      }
    } else {
      await tx.$executeRaw`
        UPDATE core.numbering_series
        SET current_number = ${nextNum}, updated_at = ${now}
        WHERE id = ${row.id}
      `;
    }

    const yearStr = formatYear(now, row.year_format);
    const formatted = formatNumber(
      row.prefix,
      yearStr,
      row.separator,
      nextNum,
      row.padding_length,
    );

    return { number: formatted, sequence: nextNum };
  });
}

/**
 * Preview what the next number would look like without incrementing.
 */
export async function previewNextNumber(seriesCode: string): Promise<string> {
  const series = await prisma.numberingSeries.findUnique({
    where: { seriesCode },
  });
  if (!series) throw new NotFoundError(`Series "${seriesCode}" not found`);

  const now = new Date();
  const currentFy = getIndianFinancialYear(now);
  const lastResetFy = series.lastResetAt
    ? getIndianFinancialYear(series.lastResetAt)
    : null;

  let nextNum = series.currentNumber + 1;
  if (series.resetYearly && (!lastResetFy || currentFy.start.getTime() !== lastResetFy.start.getTime())) {
    nextNum = 1;
  }

  const yearStr = formatYear(now, series.yearFormat);
  return formatNumber(series.prefix, yearStr, series.separator, nextNum, series.paddingLength);
}

// -- Admin CRUD -------------------------------------------------------------

export async function listNumberingSeries() {
  return prisma.numberingSeries.findMany({ orderBy: { seriesCode: 'asc' } });
}

export interface CreateSeriesInput {
  seriesCode: string;
  name: string;
  prefix?: string;
  yearFormat?: string;
  separator?: string;
  paddingLength?: number;
  resetYearly?: boolean;
  createdById?: string;
}

export async function createNumberingSeries(input: CreateSeriesInput) {
  return prisma.numberingSeries.create({
    data: {
      seriesCode: input.seriesCode.toUpperCase(),
      name: input.name,
      prefix: input.prefix ?? input.seriesCode.toUpperCase(),
      yearFormat: input.yearFormat ?? 'YYYY',
      separator: input.separator ?? '/',
      paddingLength: input.paddingLength ?? 4,
      resetYearly: input.resetYearly ?? true,
      currentNumber: 0,
      isActive: true,
      createdById: input.createdById ?? null,
    },
  });
}

export async function updateNumberingSeries(
  id: string,
  data: Partial<{
    name: string;
    prefix: string;
    yearFormat: string;
    separator: string;
    paddingLength: number;
    resetYearly: boolean;
    isActive: boolean;
    updatedById: string;
  }>,
) {
  const series = await prisma.numberingSeries.findUnique({ where: { id } });
  if (!series) throw new NotFoundError('Series not found');

  return prisma.numberingSeries.update({ where: { id }, data: data as any });
}

export async function resetNumberingSeries(id: string, updatedById: string) {
  const series = await prisma.numberingSeries.findUnique({ where: { id } });
  if (!series) throw new NotFoundError('Series not found');

  return prisma.numberingSeries.update({
    where: { id },
    data: {
      currentNumber: 0,
      lastResetAt: new Date(),
      updatedById,
    },
  });
}
