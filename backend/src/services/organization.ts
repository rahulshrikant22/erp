/**
 * Organization (singleton) service.
 *
 * Single-tenant by design — multi-tenant is explicitly out of scope per the
 * spec. The placeholder Organization is created by the seed; admins update
 * its fields via this module's PUT route.
 *
 * `getOrganizationContext()` is the helper other modules call when they
 * need the org's currency / timezone / FY start month. We cache the row in
 * memory for 5 minutes; updateOrganization invalidates synchronously.
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { rawPrisma } from '../lib/prisma-base';
import { ConflictError, NotFoundError, ValidationError } from '../errors';

export interface OrganizationView {
  id: string;
  name: string;
  legalName: string | null;
  gstin: string | null;
  pan: string | null;
  registeredAddress: unknown;
  billingAddress: unknown;
  logoUrl: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  financialYearStartMonth: number;
  defaultCurrency: string;
  timezone: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// -- singleton cache -----------------------------------------------------

interface ContextCache {
  view: OrganizationView;
  expiresAt: number;
}
const CONTEXT_TTL_MS = 5 * 60 * 1000;
let cache: ContextCache | null = null;

function toView(o: {
  id: string;
  name: string;
  legalName: string | null;
  gstin: string | null;
  pan: string | null;
  registeredAddress: unknown;
  billingAddress: unknown;
  logoUrl: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  financialYearStartMonth: number;
  defaultCurrency: string;
  timezone: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): OrganizationView {
  return {
    id: o.id,
    name: o.name,
    legalName: o.legalName,
    gstin: o.gstin,
    pan: o.pan,
    registeredAddress: o.registeredAddress,
    billingAddress: o.billingAddress,
    logoUrl: o.logoUrl,
    primaryEmail: o.primaryEmail,
    primaryPhone: o.primaryPhone,
    financialYearStartMonth: o.financialYearStartMonth,
    defaultCurrency: o.defaultCurrency,
    timezone: o.timezone,
    isActive: o.isActive,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function invalidateContextCache(): void {
  cache = null;
}

async function loadOrgRow(): Promise<OrganizationView> {
  // Singleton: there should be exactly one non-deleted org row. If multiple
  // exist (legacy data), prefer the oldest active one.
  const row = await rawPrisma.organization.findFirst({
    where: { isDeleted: false },
    orderBy: { createdAt: 'asc' },
  });
  if (!row) {
    throw new NotFoundError(
      'Organization not seeded. Run `npm run db:seed` from the repo root.',
    );
  }
  return toView(row);
}

export async function getOrganizationContext(): Promise<OrganizationView> {
  if (cache && cache.expiresAt > Date.now()) return cache.view;
  const view = await loadOrgRow();
  cache = { view, expiresAt: Date.now() + CONTEXT_TTL_MS };
  return view;
}

export async function getOrganization(): Promise<OrganizationView> {
  // Bypass cache for direct queries — admins want fresh state when editing.
  invalidateContextCache();
  return loadOrgRow();
}

// -- update --------------------------------------------------------------

export interface UpdateOrgInput {
  name?: string;
  legalName?: string | null;
  gstin?: string | null;
  pan?: string | null;
  registeredAddress?: Record<string, unknown> | null;
  billingAddress?: Record<string, unknown> | null;
  primaryEmail?: string | null;
  primaryPhone?: string | null;
  financialYearStartMonth?: number;
  defaultCurrency?: string;
  timezone?: string;
}

export async function updateOrganization(input: UpdateOrgInput): Promise<OrganizationView> {
  const current = await loadOrgRow();
  if (
    input.financialYearStartMonth !== undefined &&
    (input.financialYearStartMonth < 1 || input.financialYearStartMonth > 12)
  ) {
    throw new ValidationError('financialYearStartMonth must be between 1 and 12', {
      field: 'financialYearStartMonth',
    });
  }

  type JsonInput = Record<string, unknown> | null | undefined;
  const dataPatch: Record<string, unknown> = {};
  if (input.name !== undefined) dataPatch.name = input.name;
  if (input.legalName !== undefined) dataPatch.legalName = input.legalName;
  if (input.gstin !== undefined) dataPatch.gstin = input.gstin;
  if (input.pan !== undefined) dataPatch.pan = input.pan;
  if (input.registeredAddress !== undefined) {
    dataPatch.registeredAddress = input.registeredAddress as JsonInput;
  }
  if (input.billingAddress !== undefined) {
    dataPatch.billingAddress = input.billingAddress as JsonInput;
  }
  if (input.primaryEmail !== undefined) dataPatch.primaryEmail = input.primaryEmail;
  if (input.primaryPhone !== undefined) dataPatch.primaryPhone = input.primaryPhone;
  if (input.financialYearStartMonth !== undefined)
    dataPatch.financialYearStartMonth = input.financialYearStartMonth;
  if (input.defaultCurrency !== undefined) dataPatch.defaultCurrency = input.defaultCurrency;
  if (input.timezone !== undefined) dataPatch.timezone = input.timezone;

  await prisma.organization.update({
    where: { id: current.id },
    data: dataPatch,
  });
  invalidateContextCache();
  return loadOrgRow();
}

// -- logo upload ---------------------------------------------------------

const ALLOWED_LOGO_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'image/webp',
]);

const REPO_ROOT = path.resolve(__dirname, '../../..');
const UPLOADS_DIR = path.join(REPO_ROOT, 'uploads');
const LOGOS_DIR = path.join(UPLOADS_DIR, 'logos');
export const UPLOADS_PATH = UPLOADS_DIR;

export async function uploadLogo(args: {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  uploadedById?: string;
}): Promise<OrganizationView> {
  if (!ALLOWED_LOGO_MIME.has(args.mimeType)) {
    throw new ValidationError(
      `Logo must be one of: ${[...ALLOWED_LOGO_MIME].join(', ')} (got ${args.mimeType})`,
      { field: 'file' },
    );
  }
  if (args.buffer.byteLength === 0) {
    throw new ValidationError('Empty file', { field: 'file' });
  }

  const ext = extensionFor(args.mimeType);
  const filename = `logo-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
  await fs.mkdir(LOGOS_DIR, { recursive: true });
  const fullPath = path.join(LOGOS_DIR, filename);
  await fs.writeFile(fullPath, args.buffer);

  const publicUrl = `/uploads/logos/${filename}`;

  // Record a Document row so the file isn't orphaned in the audit/asset graph.
  const org = await loadOrgRow();
  const doc = await prisma.document.create({
    data: {
      documentType: 'organization_logo',
      name: args.originalName || filename,
      filePath: fullPath,
      fileSize: BigInt(args.buffer.byteLength),
      mimeType: args.mimeType,
      relatedEntityType: 'Organization',
      relatedEntityId: org.id,
      uploadedById: args.uploadedById,
    },
  });
  void doc;

  return updateOrganization({}).then(() =>
    // Use rawPrisma so the explicit logoUrl change is logged once via the
    // surrounding update call rather than twice. Cleanest path: write logoUrl
    // and re-load.
    prisma.organization
      .update({
        where: { id: org.id },
        data: { logoUrl: publicUrl },
      })
      .then(() => {
        invalidateContextCache();
        return loadOrgRow();
      }),
  );
}

function extensionFor(mime: string): string {
  switch (mime) {
    case 'image/png':
      return '.png';
    case 'image/jpeg':
      return '.jpg';
    case 'image/svg+xml':
      return '.svg';
    case 'image/webp':
      return '.webp';
    default:
      return '';
  }
}

// -- guard against accidental multiple orgs -----------------------------

export async function assertSingletonInvariant(): Promise<void> {
  const count = await rawPrisma.organization.count({ where: { isDeleted: false } });
  if (count > 1) {
    throw new ConflictError(
      `Singleton invariant broken: found ${count} active organizations`,
    );
  }
}
