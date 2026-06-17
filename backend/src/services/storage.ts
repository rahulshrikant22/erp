import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError, NotFoundError, ValidationError } from '../errors';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface CreateLocationInput {
  locationCode: string;
  locationName: string;
  locationType: string;
  branchId?: string | null;
  parentLocationId?: string | null;
  description?: string | null;
}

export interface UpdateLocationInput {
  locationName?: string;
  locationType?: string;
  branchId?: string | null;
  parentLocationId?: string | null;
  description?: string | null;
  isActive?: boolean;
}

export interface ListLocationsFilter {
  search?: string;
  locationType?: string;
  isActive?: boolean;
  branchId?: string;
  page?: number;
  limit?: number;
}

export interface CreateRackInput {
  rackCode: string;
  rackName?: string | null;
  capacityKg?: number | null;
  capacityVolume?: number | null;
  notes?: string | null;
}

export interface CreateBinInput {
  binCode: string;
  binLabel?: string | null;
  capacity?: number | null;
  materialCategoryRestriction?: string | null;
}

export interface CreateGeneralAreaInput {
  areaCode: string;
  areaName: string;
  description?: string | null;
  materialCategoryRestriction?: string | null;
}

// ─── Location CRUD ──────────────────────────────────────────────────────────────

export async function createLocation(input: CreateLocationInput) {
  if (input.parentLocationId) {
    const parent = await prisma.storageLocation.findUnique({ where: { id: input.parentLocationId } });
    if (!parent) throw new NotFoundError('Parent location not found');
  }

  return prisma.storageLocation.create({
    data: {
      locationCode: input.locationCode,
      locationName: input.locationName,
      locationType: input.locationType,
      branchId: input.branchId ?? null,
      parentLocationId: input.parentLocationId ?? null,
      description: input.description ?? null,
    },
    include: { parentLocation: { select: { id: true, locationCode: true, locationName: true } } },
  });
}

export async function listLocations(filter: ListLocationsFilter) {
  const where: Prisma.StorageLocationWhereInput = {};

  if (filter.locationType) where.locationType = filter.locationType;
  if (filter.isActive !== undefined) where.isActive = filter.isActive;
  if (filter.branchId) where.branchId = filter.branchId;
  if (filter.search) {
    where.OR = [
      { locationCode: { contains: filter.search, mode: 'insensitive' } },
      { locationName: { contains: filter.search, mode: 'insensitive' } },
    ];
  }

  const page = filter.page ?? 1;
  const limit = filter.limit ?? 50;

  const [total, locations] = await Promise.all([
    prisma.storageLocation.count({ where }),
    prisma.storageLocation.findMany({
      where,
      include: {
        parentLocation: { select: { id: true, locationCode: true, locationName: true } },
        _count: { select: { racks: true, generalAreas: true, stock: true, childLocations: true } },
      },
      orderBy: { locationCode: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { total, page, limit, locations };
}

export async function getLocation(id: string) {
  const location = await prisma.storageLocation.findUnique({
    where: { id },
    include: {
      parentLocation: { select: { id: true, locationCode: true, locationName: true } },
      childLocations: { select: { id: true, locationCode: true, locationName: true, locationType: true, isActive: true } },
      racks: { include: { bins: true } },
      generalAreas: true,
      _count: { select: { stock: true } },
    },
  });
  if (!location) throw new NotFoundError('Storage location not found');
  return location;
}

export async function updateLocation(id: string, input: UpdateLocationInput) {
  const location = await prisma.storageLocation.findUnique({ where: { id } });
  if (!location) throw new NotFoundError('Storage location not found');

  if (input.parentLocationId) {
    if (input.parentLocationId === id) throw new ValidationError('Location cannot be its own parent');
    const parent = await prisma.storageLocation.findUnique({ where: { id: input.parentLocationId } });
    if (!parent) throw new NotFoundError('Parent location not found');
  }

  return prisma.storageLocation.update({
    where: { id },
    data: {
      ...(input.locationName !== undefined && { locationName: input.locationName }),
      ...(input.locationType !== undefined && { locationType: input.locationType }),
      ...(input.branchId !== undefined && { branchId: input.branchId }),
      ...(input.parentLocationId !== undefined && { parentLocationId: input.parentLocationId }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
    include: { parentLocation: { select: { id: true, locationCode: true, locationName: true } } },
  });
}

export async function deleteLocation(id: string) {
  const location = await prisma.storageLocation.findUnique({ where: { id } });
  if (!location) throw new NotFoundError('Storage location not found');

  const stockCount = await prisma.stock.count({
    where: { locationId: id, currentQuantity: { gt: 0 } },
  });
  if (stockCount > 0) {
    throw new ConflictError('Cannot delete location with existing stock');
  }

  await prisma.storageLocation.delete({ where: { id } });
}

export async function freezeLocation(id: string) {
  const location = await prisma.storageLocation.findUnique({ where: { id } });
  if (!location) throw new NotFoundError('Storage location not found');

  return prisma.storageLocation.update({
    where: { id },
    data: { isFrozen: true },
  });
}

export async function unfreezeLocation(id: string) {
  const location = await prisma.storageLocation.findUnique({ where: { id } });
  if (!location) throw new NotFoundError('Storage location not found');

  return prisma.storageLocation.update({
    where: { id },
    data: { isFrozen: false },
  });
}

// ─── Location Tree ──────────────────────────────────────────────────────────────

export async function getLocationTree() {
  const all = await prisma.storageLocation.findMany({
    include: {
      _count: { select: { racks: true, generalAreas: true, stock: true } },
    },
    orderBy: { locationCode: 'asc' },
  });

  const map = new Map<string, any>();
  const roots: any[] = [];

  for (const loc of all) {
    map.set(loc.id, { ...loc, children: [] });
  }

  for (const loc of all) {
    const node = map.get(loc.id)!;
    if (loc.parentLocationId && map.has(loc.parentLocationId)) {
      map.get(loc.parentLocationId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

// ─── Rack CRUD ──────────────────────────────────────────────────────────────────

export async function createRack(locationId: string, input: CreateRackInput) {
  const location = await prisma.storageLocation.findUnique({ where: { id: locationId } });
  if (!location) throw new NotFoundError('Storage location not found');

  return prisma.storageRack.create({
    data: {
      locationId,
      rackCode: input.rackCode,
      rackName: input.rackName ?? null,
      capacityKg: input.capacityKg ?? null,
      capacityVolume: input.capacityVolume ?? null,
      notes: input.notes ?? null,
    },
    include: { bins: true },
  });
}

export async function listRacks(locationId: string) {
  return prisma.storageRack.findMany({
    where: { locationId },
    include: { bins: true, _count: { select: { bins: true } } },
    orderBy: { rackCode: 'asc' },
  });
}

export async function updateRack(id: string, input: Partial<CreateRackInput> & { isActive?: boolean }) {
  const rack = await prisma.storageRack.findUnique({ where: { id } });
  if (!rack) throw new NotFoundError('Rack not found');

  return prisma.storageRack.update({
    where: { id },
    data: {
      ...(input.rackCode !== undefined && { rackCode: input.rackCode }),
      ...(input.rackName !== undefined && { rackName: input.rackName }),
      ...(input.capacityKg !== undefined && { capacityKg: input.capacityKg }),
      ...(input.capacityVolume !== undefined && { capacityVolume: input.capacityVolume }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });
}

export async function deleteRack(id: string) {
  const rack = await prisma.storageRack.findUnique({ where: { id } });
  if (!rack) throw new NotFoundError('Rack not found');

  const binWithStock = await prisma.storageBin.findFirst({
    where: { rackId: id, stock: { some: { currentQuantity: { gt: 0 } } } },
  });
  if (binWithStock) {
    throw new ConflictError('Cannot delete rack with bins containing stock');
  }

  await prisma.storageRack.delete({ where: { id } });
}

// ─── Bin CRUD ───────────────────────────────────────────────────────────────────

export async function createBin(rackId: string, input: CreateBinInput) {
  const rack = await prisma.storageRack.findUnique({ where: { id: rackId } });
  if (!rack) throw new NotFoundError('Rack not found');

  return prisma.storageBin.create({
    data: {
      rackId,
      binCode: input.binCode,
      binLabel: input.binLabel ?? null,
      capacity: input.capacity ?? null,
      materialCategoryRestriction: input.materialCategoryRestriction ?? null,
    },
  });
}

export async function listBins(rackId: string) {
  return prisma.storageBin.findMany({
    where: { rackId },
    include: { _count: { select: { stock: true } } },
    orderBy: { binCode: 'asc' },
  });
}

export async function updateBin(id: string, input: Partial<CreateBinInput> & { isActive?: boolean }) {
  const bin = await prisma.storageBin.findUnique({ where: { id } });
  if (!bin) throw new NotFoundError('Bin not found');

  return prisma.storageBin.update({
    where: { id },
    data: {
      ...(input.binCode !== undefined && { binCode: input.binCode }),
      ...(input.binLabel !== undefined && { binLabel: input.binLabel }),
      ...(input.capacity !== undefined && { capacity: input.capacity }),
      ...(input.materialCategoryRestriction !== undefined && { materialCategoryRestriction: input.materialCategoryRestriction }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });
}

export async function deleteBin(id: string) {
  const bin = await prisma.storageBin.findUnique({ where: { id } });
  if (!bin) throw new NotFoundError('Bin not found');

  const stockCount = await prisma.stock.count({
    where: { binId: id, currentQuantity: { gt: 0 } },
  });
  if (stockCount > 0) {
    throw new ConflictError('Cannot delete bin with existing stock');
  }

  await prisma.storageBin.delete({ where: { id } });
}

export async function bulkCreateBins(
  rackIds: string[],
  binPattern: { prefix: string; startNumber: number; count: number; capacity?: number | null; materialCategoryRestriction?: string | null },
) {
  const created: any[] = [];
  for (const rackId of rackIds) {
    const rack = await prisma.storageRack.findUnique({ where: { id: rackId } });
    if (!rack) continue;
    for (let i = 0; i < binPattern.count; i++) {
      const num = binPattern.startNumber + i;
      const binCode = `${binPattern.prefix}${String(num).padStart(3, '0')}`;
      const bin = await prisma.storageBin.create({
        data: {
          rackId,
          binCode,
          binLabel: binCode,
          capacity: binPattern.capacity ?? null,
          materialCategoryRestriction: binPattern.materialCategoryRestriction ?? null,
        },
      });
      created.push(bin);
    }
  }
  return created;
}

// ─── General Area CRUD ──────────────────────────────────────────────────────────

export async function createGeneralArea(locationId: string, input: CreateGeneralAreaInput) {
  const location = await prisma.storageLocation.findUnique({ where: { id: locationId } });
  if (!location) throw new NotFoundError('Storage location not found');

  return prisma.storageGeneralArea.create({
    data: {
      locationId,
      areaCode: input.areaCode,
      areaName: input.areaName,
      description: input.description ?? null,
      materialCategoryRestriction: input.materialCategoryRestriction ?? null,
    },
  });
}

export async function listGeneralAreas(locationId: string) {
  return prisma.storageGeneralArea.findMany({
    where: { locationId },
    include: { _count: { select: { stock: true } } },
    orderBy: { areaCode: 'asc' },
  });
}

export async function updateGeneralArea(id: string, input: Partial<CreateGeneralAreaInput> & { isActive?: boolean }) {
  const area = await prisma.storageGeneralArea.findUnique({ where: { id } });
  if (!area) throw new NotFoundError('General area not found');

  return prisma.storageGeneralArea.update({
    where: { id },
    data: {
      ...(input.areaCode !== undefined && { areaCode: input.areaCode }),
      ...(input.areaName !== undefined && { areaName: input.areaName }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.materialCategoryRestriction !== undefined && { materialCategoryRestriction: input.materialCategoryRestriction }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });
}

export async function deleteGeneralArea(id: string) {
  const area = await prisma.storageGeneralArea.findUnique({ where: { id } });
  if (!area) throw new NotFoundError('General area not found');

  const stockCount = await prisma.stock.count({
    where: { generalAreaId: id, currentQuantity: { gt: 0 } },
  });
  if (stockCount > 0) {
    throw new ConflictError('Cannot delete general area with existing stock');
  }

  await prisma.storageGeneralArea.delete({ where: { id } });
}
