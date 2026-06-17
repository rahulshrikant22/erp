import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getNextNumber } from './numbering';

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export interface VendorCsvRow {
  vendor_name: string;
  vendor_type?: string;
  gstin?: string;
  primary_email?: string;
  primary_phone?: string;
  legal_name?: string;
  pan?: string;
  website?: string;
  currency_code?: string;
  credit_days?: number;
}

export async function importVendorsFromCsv(
  rows: VendorCsvRow[],
  uploadedBy?: string,
) {
  const batch = await prisma.vendorImportBatch.create({
    data: {
      fileName: 'vendor_import.csv',
      status: 'processing',
      totalRows: rows.length,
      uploadedBy: uploadedBy ?? null,
    },
  });

  const errors: Array<{ rowNumber: number; field?: string; message: string; rawData: any }> = [];
  let successCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;
    const rowErrors: string[] = [];

    if (!row.vendor_name || !row.vendor_name.trim()) {
      rowErrors.push('vendor_name is required');
    }

    const vendorType = row.vendor_type || 'domestic';
    if (!['domestic', 'import'].includes(vendorType)) {
      rowErrors.push('vendor_type must be domestic or import');
    }

    if (row.gstin && vendorType === 'domestic') {
      if (row.gstin.length !== 15 || !GSTIN_REGEX.test(row.gstin)) {
        rowErrors.push('Invalid GSTIN format');
      }
    }

    if (row.primary_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.primary_email)) {
      rowErrors.push('Invalid email format');
    }

    if (rowErrors.length > 0) {
      errors.push({ rowNumber: rowNum, message: rowErrors.join('; '), rawData: row });
      continue;
    }

    try {
      const { number: vendorCode } = await getNextNumber('VEN');

      await prisma.vendor.create({
        data: {
          vendorCode,
          vendorName: row.vendor_name.trim(),
          legalName: row.legal_name?.trim() || null,
          vendorType,
          gstin: row.gstin?.trim() || null,
          pan: row.pan?.trim() || null,
          primaryEmail: row.primary_email?.trim() || null,
          primaryPhone: row.primary_phone?.trim() || null,
          website: row.website?.trim() || null,
          currencyCode: row.currency_code?.trim() || 'INR',
          creditDays: row.credit_days ?? null,
          createdById: uploadedBy ?? null,
        },
      });
      successCount++;
    } catch (err: any) {
      errors.push({ rowNumber: rowNum, message: `Creation failed: ${err.message}`, rawData: row });
    }
  }

  if (errors.length > 0) {
    await prisma.vendorImportError.createMany({
      data: errors.map((e) => ({
        batchId: batch.id,
        rowNumber: e.rowNumber,
        field: e.field ?? null,
        message: e.message,
        rawData: e.rawData as unknown as Prisma.InputJsonValue,
      })),
    });
  }

  const finalStatus = errors.length > 0
    ? (successCount > 0 ? 'completed' : 'failed')
    : 'completed';

  await prisma.vendorImportBatch.update({
    where: { id: batch.id },
    data: { successRows: successCount, failedRows: errors.length, status: finalStatus },
  });

  return {
    batchId: batch.id,
    totalRows: rows.length,
    successCount,
    errorCount: errors.length,
    status: finalStatus,
  };
}

export interface RateContractCsvRow {
  vendor_code: string;
  material_code: string;
  manufacturer_code?: string;
  unit_price: number;
  currency_code?: string;
  uom?: string;
  validity_from: string;
  validity_until?: string;
  is_preferred?: boolean;
  notes?: string;
}

export async function importRateContractsFromCsv(
  rows: RateContractCsvRow[],
  createdById?: string,
) {
  const results: Array<{ row: number; status: string; error?: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const vendor = await prisma.vendor.findFirst({
        where: { vendorCode: row.vendor_code, isDeleted: false },
      });
      if (!vendor) throw new Error(`Vendor ${row.vendor_code} not found`);

      const material = await prisma.material.findFirst({
        where: { materialCode: row.material_code, isDeleted: false },
      });
      if (!material) throw new Error(`Material ${row.material_code} not found`);
      if (!material.isActive) throw new Error(`Material ${row.material_code} is inactive`);

      if (row.manufacturer_code) {
        const mfr = await prisma.materialManufacturer.findUnique({
          where: { manufacturerCode: row.manufacturer_code },
        });
        if (!mfr) throw new Error(`Manufacturer ${row.manufacturer_code} not found`);
        if (material.manufacturerId !== mfr.id) {
          throw new Error(`Manufacturer ${row.manufacturer_code} does not match material's manufacturer`);
        }
      }

      await prisma.rateContract.create({
        data: {
          vendorId: vendor.id,
          materialId: material.id,
          manufacturerId: material.manufacturerId,
          unitPrice: row.unit_price,
          currencyCode: row.currency_code ?? 'INR',
          uom: row.uom ?? material.purchaseUom,
          validityFrom: new Date(row.validity_from),
          validityUntil: row.validity_until ? new Date(row.validity_until) : null,
          isPreferred: row.is_preferred ?? false,
          notes: row.notes ?? null,
          createdById: createdById ?? null,
        },
      });
      results.push({ row: i + 1, status: 'success' });
    } catch (err: any) {
      results.push({ row: i + 1, status: 'error', error: err.message });
    }
  }

  const successCount = results.filter((r) => r.status === 'success').length;
  return { results, totalRows: rows.length, successCount, errorCount: rows.length - successCount };
}

export interface StockOpeningBalanceRow {
  material_code: string;
  location_code: string;
  quantity: number;
  unit_cost: number;
  batch_number?: string;
}

export async function importStockOpeningBalances(
  rows: StockOpeningBalanceRow[],
  _importedBy?: string,
) {
  const results: Array<{ row: number; status: string; error?: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      if (row.quantity <= 0) throw new Error('Quantity must be positive');
      if (row.unit_cost < 0) throw new Error('Unit cost cannot be negative');

      const material = await prisma.material.findFirst({
        where: { materialCode: row.material_code, isDeleted: false },
      });
      if (!material) throw new Error(`Material ${row.material_code} not found`);

      const location = await prisma.storageLocation.findFirst({
        where: { locationCode: row.location_code, isActive: true },
      });
      if (!location) throw new Error(`Location ${row.location_code} not found`);

      const stock = await prisma.stock.upsert({
        where: {
          materialId_locationId_binId: {
            materialId: material.id,
            locationId: location.id,
            binId: '',
          },
        },
        create: {
          materialId: material.id,
          locationId: location.id,
          binId: null,
          currentQuantity: row.quantity,
          lastMovementAt: new Date(),
        },
        update: {
          currentQuantity: { increment: row.quantity },
          lastMovementAt: new Date(),
        },
      });

      await prisma.stockBatch.create({
        data: {
          stockId: stock.id,
          batchNumber: row.batch_number ?? `OB-${row.material_code}-${i + 1}`,
          originalQuantity: row.quantity,
          currentQuantity: row.quantity,
          unitCost: row.unit_cost,
          totalCost: Math.round(row.quantity * row.unit_cost * 100) / 100,
        },
      });

      results.push({ row: i + 1, status: 'success' });
    } catch (err: any) {
      results.push({ row: i + 1, status: 'error', error: err.message });
    }
  }

  const successCount = results.filter((r) => r.status === 'success').length;
  return { results, totalRows: rows.length, successCount, errorCount: rows.length - successCount };
}
