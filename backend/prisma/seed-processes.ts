import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ProcessSeed {
  processCode: string;
  processName: string;
  processCategory: string;
  standardTimeMinutes: number;
  timeUnit: string;
  laborCostPerHour: number;
  machineCostPerHour: number;
  isOutsourced: boolean;
  defaultOutsourceVendorNotes: string | null;
}

const STANDARD_PROCESSES: ProcessSeed[] = [
  {
    processCode: 'BSC',
    processName: 'Beam Saw Cutting',
    processCategory: 'cutting',
    standardTimeMinutes: 5,
    timeUnit: 'per_sheet',
    laborCostPerHour: 150,
    machineCostPerHour: 200,
    isOutsourced: false,
    defaultOutsourceVendorNotes: null,
  },
  {
    processCode: 'PRL',
    processName: 'Pressing & Lamination',
    processCategory: 'lamination',
    standardTimeMinutes: 10,
    timeUnit: 'per_sheet',
    laborCostPerHour: 150,
    machineCostPerHour: 300,
    isOutsourced: false,
    defaultOutsourceVendorNotes: null,
  },
  {
    processCode: 'EBD',
    processName: 'Edge Banding',
    processCategory: 'edge_banding',
    standardTimeMinutes: 2,
    timeUnit: 'per_panel_edge',
    laborCostPerHour: 150,
    machineCostPerHour: 250,
    isOutsourced: false,
    defaultOutsourceVendorNotes: null,
  },
  {
    processCode: 'CNC-RG',
    processName: 'CNC Drilling — Rover Gold',
    processCategory: 'drilling',
    standardTimeMinutes: 8,
    timeUnit: 'per_panel',
    laborCostPerHour: 200,
    machineCostPerHour: 500,
    isOutsourced: false,
    defaultOutsourceVendorNotes: null,
  },
  {
    processCode: 'CNC-6S',
    processName: 'CNC Drilling — 6-Side',
    processCategory: 'drilling',
    standardTimeMinutes: 5,
    timeUnit: 'per_panel',
    laborCostPerHour: 200,
    machineCostPerHour: 600,
    isOutsourced: false,
    defaultOutsourceVendorNotes: null,
  },
  {
    processCode: 'SND',
    processName: 'Sanding & Cleaning',
    processCategory: 'sanding',
    standardTimeMinutes: 3,
    timeUnit: 'per_panel',
    laborCostPerHour: 120,
    machineCostPerHour: 50,
    isOutsourced: false,
    defaultOutsourceVendorNotes: null,
  },
  {
    processCode: 'ASM-STD',
    processName: 'Assembly — Standard',
    processCategory: 'assembly',
    standardTimeMinutes: 30,
    timeUnit: 'per_unit',
    laborCostPerHour: 150,
    machineCostPerHour: 0,
    isOutsourced: false,
    defaultOutsourceVendorNotes: null,
  },
  {
    processCode: 'ASM-CMP',
    processName: 'Assembly — Complex',
    processCategory: 'assembly',
    standardTimeMinutes: 60,
    timeUnit: 'per_unit',
    laborCostPerHour: 180,
    machineCostPerHour: 0,
    isOutsourced: false,
    defaultOutsourceVendorNotes: null,
  },
  {
    processCode: 'PWD-COAT',
    processName: 'Powder Coating',
    processCategory: 'outsource',
    standardTimeMinutes: 0,
    timeUnit: 'per_kg',
    laborCostPerHour: 0,
    machineCostPerHour: 0,
    isOutsourced: true,
    defaultOutsourceVendorNotes: 'External vendor',
  },
  {
    processCode: 'GLS-CUT',
    processName: 'Glass Cutting',
    processCategory: 'outsource',
    standardTimeMinutes: 0,
    timeUnit: 'per_piece',
    laborCostPerHour: 0,
    machineCostPerHour: 0,
    isOutsourced: true,
    defaultOutsourceVendorNotes: 'External vendor',
  },
  {
    processCode: 'MS-LASER',
    processName: 'MS Sheet Laser Cutting',
    processCategory: 'outsource',
    standardTimeMinutes: 0,
    timeUnit: 'per_part',
    laborCostPerHour: 0,
    machineCostPerHour: 0,
    isOutsourced: true,
    defaultOutsourceVendorNotes: 'External vendor',
  },
  {
    processCode: 'MS-PIPE',
    processName: 'MS Pipe Cutting',
    processCategory: 'cutting',
    standardTimeMinutes: 1,
    timeUnit: 'per_piece',
    laborCostPerHour: 120,
    machineCostPerHour: 80,
    isOutsourced: false,
    defaultOutsourceVendorNotes: null,
  },
  {
    processCode: 'PUNCH',
    processName: 'Punching',
    processCategory: 'drilling',
    standardTimeMinutes: 0.5,
    timeUnit: 'per_piece',
    laborCostPerHour: 120,
    machineCostPerHour: 150,
    isOutsourced: false,
    defaultOutsourceVendorNotes: null,
  },
  {
    processCode: 'WELD',
    processName: 'Welding',
    processCategory: 'assembly',
    standardTimeMinutes: 3,
    timeUnit: 'per_joint',
    laborCostPerHour: 180,
    machineCostPerHour: 100,
    isOutsourced: false,
    defaultOutsourceVendorNotes: null,
  },
  {
    processCode: 'NUT-INS',
    processName: 'Nut Insert',
    processCategory: 'assembly',
    standardTimeMinutes: 0.5,
    timeUnit: 'per_piece',
    laborCostPerHour: 120,
    machineCostPerHour: 0,
    isOutsourced: false,
    defaultOutsourceVendorNotes: null,
  },
  {
    processCode: 'ALU-CUT',
    processName: 'Aluminium Panel Cutting',
    processCategory: 'cutting',
    standardTimeMinutes: 2,
    timeUnit: 'per_piece',
    laborCostPerHour: 150,
    machineCostPerHour: 120,
    isOutsourced: false,
    defaultOutsourceVendorNotes: null,
  },
];

export async function seedProcesses(): Promise<void> {
  for (const p of STANDARD_PROCESSES) {
    await prisma.process.upsert({
      where: { processCode: p.processCode },
      update: {
        processName: p.processName,
        processCategory: p.processCategory,
        standardTimeMinutes: p.standardTimeMinutes,
        timeUnit: p.timeUnit,
        laborCostPerHour: p.laborCostPerHour,
        machineCostPerHour: p.machineCostPerHour,
        isOutsourced: p.isOutsourced,
        defaultOutsourceVendorNotes: p.defaultOutsourceVendorNotes,
      },
      create: p,
    });
  }

  const total = await prisma.process.count();
  console.log(`processes         : ${total} (target ${STANDARD_PROCESSES.length})`);
}
