/**
 * Locations — physical storage areas / sites. The Location schema is
 * organization-scoped (no branchId); the spec describes them as "linked
 * locations under branch" but our schema doesn't carry that FK in P0-04.
 * Inventory module (Phase 3) will introduce branch ↔ location linkage if
 * needed; for now we surface the org-level CRUD only.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { getOrganizationContext } from './organization';

export type LocationType = 'warehouse' | 'factory' | 'site' | 'other';
const LOCATION_TYPES: ReadonlySet<LocationType> = new Set([
  'warehouse',
  'factory',
  'site',
  'other',
]);

export interface LocationView {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  locationType: LocationType;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function assertLocationType(t: string): asserts t is LocationType {
  if (!LOCATION_TYPES.has(t as LocationType)) {
    throw new ValidationError(
      `Unknown locationType "${t}". Allowed: ${[...LOCATION_TYPES].join(', ')}`,
      { field: 'locationType' },
    );
  }
}

export interface ListLocFilters {
  locationType?: string;
  isActive?: boolean;
  page: number;
  limit: number;
}

export async function listLocations(filters: ListLocFilters): Promise<{
  total: number;
  page: number;
  limit: number;
  locations: LocationView[];
}> {
  const where: Prisma.LocationWhereInput = {
    ...(filters.locationType ? { locationType: filters.locationType } : {}),
    ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.location.count({ where }),
    prisma.location.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);
  return {
    total,
    page: filters.page,
    limit: filters.limit,
    locations: rows.map((r) => ({ ...r, locationType: r.locationType as LocationType })),
  };
}

export async function getLocation(id: string): Promise<LocationView> {
  const l = await prisma.location.findUnique({ where: { id } });
  if (!l) throw new NotFoundError('Location not found');
  return { ...l, locationType: l.locationType as LocationType };
}

export interface CreateLocationInput {
  code: string;
  name: string;
  locationType: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export async function createLocation(input: CreateLocationInput): Promise<LocationView> {
  assertLocationType(input.locationType);
  const org = await getOrganizationContext();
  const dup = await prisma.location.findFirst({
    where: { organizationId: org.id, code: input.code },
  });
  if (dup) {
    throw new ConflictError('Location code already exists in this organization', {
      field: 'code',
    });
  }
  const created = await prisma.location.create({
    data: {
      organizationId: org.id,
      code: input.code,
      name: input.name,
      locationType: input.locationType,
      addressLine1: input.addressLine1,
      city: input.city,
      state: input.state,
      postalCode: input.postalCode,
      country: input.country ?? 'India',
      isActive: true,
    },
  });
  return { ...created, locationType: created.locationType as LocationType };
}

export interface UpdateLocationInput {
  name?: string;
  locationType?: string;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string;
  isActive?: boolean;
}

export async function updateLocation(
  id: string,
  input: UpdateLocationInput,
): Promise<LocationView> {
  const l = await prisma.location.findUnique({ where: { id } });
  if (!l) throw new NotFoundError('Location not found');
  if (input.locationType !== undefined) assertLocationType(input.locationType);

  const data: Record<string, unknown> = {};
  for (const k of [
    'name', 'locationType', 'addressLine1', 'city', 'state', 'postalCode', 'country', 'isActive',
  ] as const) {
    if (input[k] !== undefined) data[k] = input[k] as unknown;
  }
  const updated = await prisma.location.update({ where: { id }, data });
  return { ...updated, locationType: updated.locationType as LocationType };
}

export async function deleteLocation(id: string): Promise<void> {
  // No FK references in Phase 0 schema; safe to hard-delete.
  await prisma.location.delete({ where: { id } });
}
