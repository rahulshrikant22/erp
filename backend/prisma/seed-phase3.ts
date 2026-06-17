import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function seedPhase3() {
  console.log('--- Phase 3 seed ---');
  // ─── Modules ───────────────────────────────────────────────────────────────
  const modules = [
    { code: 'vendor_management', name: 'Vendor Management', description: 'Vendor master, rate contracts, documents', category: 'supply_chain', isCore: true, isBypassable: false },
    { code: 'purchase_orders', name: 'Purchase Orders', description: 'PO creation, approval, vendor communication', category: 'supply_chain', isCore: true, isBypassable: false },
    { code: 'import_tracking', name: 'Import Tracking', description: 'Import shipment, customs, landed cost', category: 'supply_chain', isCore: false, isBypassable: false },
    { code: 'goods_receipt', name: 'Goods Receipt', description: 'GRN with PO matching and tolerance', category: 'supply_chain', isCore: true, isBypassable: false },
    { code: 'quality_check_inbound', name: 'Quality Check (Inbound)', description: 'Incoming QC with parameter templates', category: 'supply_chain', isCore: false, isBypassable: true },
    { code: 'inventory_management', name: 'Inventory Management', description: 'FIFO stock, batches, reservations', category: 'supply_chain', isCore: true, isBypassable: false },
    { code: 'material_issue', name: 'Material Issue', description: 'Requisition, issue, return from production', category: 'supply_chain', isCore: true, isBypassable: false },
    { code: 'stock_count', name: 'Stock Count', description: 'Physical verification and adjustments', category: 'supply_chain', isCore: false, isBypassable: false },
  ];

  for (const m of modules) {
    await prisma.module.upsert({
      where: { moduleCode: m.code },
      update: {},
      create: {
        moduleCode: m.code,
        name: m.name,
        description: m.description,
        category: m.category,
        isCore: m.isCore,
        isBypassable: m.isBypassable,
        isActive: true,
      },
    });
  }
  console.log('  ✔ Phase 3 modules seeded');

  // ─── Numbering series ──────────────────────────────────────────────────────
  const series = [
    { code: 'VEN', name: 'Vendor Code', prefix: 'VEN', yearFormat: 'YYYY', padding: 5, separator: '-' },
    { code: 'PR', name: 'Purchase Requisition', prefix: 'PR', yearFormat: 'YYYY', padding: 5, separator: '-' },
    { code: 'PO-SC', name: 'Purchase Order', prefix: 'PO', yearFormat: 'YYYY', padding: 5, separator: '-' },
    { code: 'GRN-SC', name: 'Goods Receipt Note', prefix: 'GRN', yearFormat: 'YYYY', padding: 5, separator: '-' },
    { code: 'QIN', name: 'Quality Inspection', prefix: 'QIN', yearFormat: 'YYYY', padding: 5, separator: '-' },
    { code: 'MR', name: 'Material Requisition', prefix: 'MR', yearFormat: 'YYYY', padding: 5, separator: '-' },
    { code: 'MIN-SC', name: 'Material Issue Note', prefix: 'MIN', yearFormat: 'YYYY', padding: 5, separator: '-' },
    { code: 'MRN', name: 'Material Return Note', prefix: 'MRN', yearFormat: 'YYYY', padding: 5, separator: '-' },
    { code: 'SC', name: 'Stock Count', prefix: 'SC', yearFormat: 'YYYY', padding: 4, separator: '-' },
    { code: 'ADJ', name: 'Stock Adjustment', prefix: 'ADJ', yearFormat: 'YYYY', padding: 5, separator: '-' },
    { code: 'SHIP', name: 'Import Shipment', prefix: 'SHIP', yearFormat: 'YYYY', padding: 4, separator: '-' },
    { code: 'MOV', name: 'Stock Movement', prefix: 'MOV', yearFormat: 'YYYY', padding: 6, separator: '-' },
    { code: 'RES', name: 'Reservation', prefix: 'RES', yearFormat: 'YYYY', padding: 5, separator: '-' },
  ];

  for (const s of series) {
    await prisma.numberingSeries.upsert({
      where: { seriesCode: s.code },
      update: {},
      create: {
        seriesCode: s.code,
        name: s.name,
        prefix: s.prefix,
        yearFormat: s.yearFormat,
        paddingLength: s.padding,
        separator: s.separator,
        currentNumber: 0,
        isActive: true,
      },
    });
  }
  console.log('  ✔ Phase 3 numbering series seeded');

  // ─── System settings ───────────────────────────────────────────────────────
  const settings = [
    { key: 'PO_AUTO_APPROVAL_THRESHOLD_INR', value: '25000', desc: 'PO auto-approval threshold (INR)', cat: 'procurement', dataType: 'integer' },
    { key: 'PO_MANAGER_APPROVAL_THRESHOLD_INR', value: '200000', desc: 'PO manager approval threshold (INR)', cat: 'procurement', dataType: 'integer' },
    { key: 'PO_DIRECTOR_APPROVAL_THRESHOLD_INR', value: '1000000', desc: 'PO director approval threshold (INR)', cat: 'procurement', dataType: 'integer' },
    { key: 'GRN_QUANTITY_TOLERANCE_PERCENT', value: '5.0', desc: 'GRN quantity tolerance %', cat: 'procurement', dataType: 'string' },
    { key: 'QC_DEFAULT_ENABLED', value: 'true', desc: 'QC default enabled', cat: 'quality', dataType: 'boolean' },
    { key: 'REORDER_ALERT_ENABLED', value: 'true', desc: 'Reorder alert enabled', cat: 'inventory', dataType: 'boolean' },
    { key: 'CYCLE_COUNT_FREQUENCY_DAYS', value: '30', desc: 'Cycle count frequency (days)', cat: 'inventory', dataType: 'integer' },
    { key: 'FULL_COUNT_FREQUENCY_DAYS', value: '90', desc: 'Full count frequency (days)', cat: 'inventory', dataType: 'integer' },
    { key: 'IMPORT_DEFAULT_INCOTERMS', value: 'FOB', desc: 'Default import incoterms', cat: 'procurement', dataType: 'string' },
    { key: 'DEFAULT_DOMESTIC_PAYMENT_TERMS', value: '30-day Credit', desc: 'Default domestic payment terms', cat: 'procurement', dataType: 'string' },
    { key: 'DEFAULT_IMPORT_PAYMENT_TERMS', value: 'TT Advance', desc: 'Default import payment terms', cat: 'procurement', dataType: 'string' },
  ];

  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { settingKey: s.key },
      update: {},
      create: {
        settingKey: s.key,
        settingValue: s.value,
        description: s.desc,
        category: s.cat,
        dataType: s.dataType,
      },
    });
  }
  console.log('  ✔ Phase 3 system settings seeded');

  // ─── Storage locations ─────────────────────────────────────────────────────
  const branch = await prisma.branch.findFirst();
  const locData = [
    { locationCode: 'FACTORY-STORE', locationName: 'Main Factory Store', locationType: 'factory_store' },
    { locationCode: 'MAIN-WAREHOUSE', locationName: 'Main Warehouse', locationType: 'warehouse' },
    { locationCode: 'QC-HOLD', locationName: 'QC Hold Area', locationType: 'qc_hold' },
    { locationCode: 'QUARANTINE', locationName: 'Quarantine Area', locationType: 'quarantine' },
    { locationCode: 'RETURNS-HOLD', locationName: 'Returns Hold Area', locationType: 'returns_hold' },
  ];

  for (const loc of locData) {
    await prisma.storageLocation.upsert({
      where: { locationCode: loc.locationCode },
      update: {},
      create: {
        locationCode: loc.locationCode,
        locationName: loc.locationName,
        locationType: loc.locationType,
        branchId: branch?.id ?? null,
      },
    });
  }
  console.log('  ✔ Phase 3 storage locations seeded');

  // ─── Vendor payment terms templates ────────────────────────────────────────
  const vendorTerms = [
    { templateCode: 'VENDOR-TT-ADV', templateName: 'TT Advance', description: 'Telegraphic transfer advance payment' },
    { templateCode: 'VENDOR-LC-SIGHT', templateName: 'LC at Sight', description: 'Letter of credit payable at sight' },
    { templateCode: 'VENDOR-CASH-RECEIPT', templateName: 'Cash on Receipt', description: 'Payment on receipt of goods' },
    { templateCode: 'VENDOR-30DAY', templateName: '30-day Credit', description: '30 days credit from invoice date' },
    { templateCode: 'VENDOR-60DAY', templateName: '60-day Credit', description: '60 days credit from invoice date' },
  ];

  for (const t of vendorTerms) {
    await prisma.paymentTermsTemplate.upsert({
      where: { templateCode: t.templateCode },
      update: {},
      create: {
        templateCode: t.templateCode,
        templateName: t.templateName,
        description: t.description,
        isActive: true,
      },
    });
  }
  console.log('  ✔ Phase 3 vendor payment terms seeded');

  console.log('--- Phase 3 seed done ---');
}

if (require.main === module) {
  seedPhase3()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
