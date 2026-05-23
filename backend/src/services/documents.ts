/**
 * Generic document storage. Other modules call uploadDocument() with their
 * own (relatedEntityType, relatedEntityId) anchors so business workflows
 * can attach files without each module reinventing storage.
 *
 * File layout: <repo>/uploads/<YYYY>/<MM>/<uuid>.<ext>
 *   The Document row carries the absolute path; the public URL is
 *   `/uploads/<YYYY>/<MM>/<uuid>.<ext>` served by the static middleware.
 *
 * Soft delete keeps the file on disk by design — audit / regulatory recovery
 * is more important than disk space at this scale. A retention sweep can
 * physically delete files when needed (P0-19+).
 *
 * Versioning: a "new version" creates a fresh Document row whose
 * parentDocumentId points at the most recent active version of the chain.
 * Walking parent → parent reconstructs the full history.
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { rawPrisma } from '../lib/prisma-base';
import { ConflictError, NotFoundError, ValidationError } from '../errors';

// -- whitelist ----------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '../../..');
const UPLOADS_DIR = path.join(REPO_ROOT, 'uploads');

/**
 * MIME → file extension. Unknown MIMEs are rejected. The list intentionally
 * skips executable / scripting types; admins can extend later by adding
 * entries here (the doc-types whitelist will become DB-driven in a future
 * phase if needed).
 */
const MIME_EXTENSION: Record<string, string> = {
  // General office / images
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/webp': '.webp',
  'text/plain': '.txt',
  'text/csv': '.csv',
  // CAD
  'application/acad': '.dwg',
  'image/vnd.dwg': '.dwg',
  'application/dxf': '.dxf',
  'image/vnd.dxf': '.dxf',
  // Compressed
  'application/zip': '.zip',
  'application/x-rar-compressed': '.rar',
  'application/vnd.rar': '.rar',
};

/** Default max upload size (50 MB) — also enforced by multer at the route level. */
export const DOCUMENT_MAX_BYTES = 50 * 1024 * 1024;

// -- types --------------------------------------------------------------

export interface DocumentView {
  id: string;
  documentType: string;
  name: string;
  filePath: string;
  url: string;
  fileSize: number | null;
  mimeType: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  uploadedById: string | null;
  uploadedAt: Date;
  version: number;
  parentDocumentId: string | null;
  isDeleted: boolean;
}

interface RawDocumentRow {
  id: string;
  documentType: string;
  name: string;
  filePath: string;
  fileSize: bigint | null;
  mimeType: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  uploadedById: string | null;
  uploadedAt: Date;
  version: number;
  parentDocumentId: string | null;
  isDeleted: boolean;
}

function toView(row: RawDocumentRow): DocumentView {
  // Convert absolute filePath back to a public URL under /uploads.
  const rel = path.relative(UPLOADS_DIR, row.filePath).split(path.sep).join('/');
  const url = `/uploads/${rel}`;
  return {
    id: row.id,
    documentType: row.documentType,
    name: row.name,
    filePath: row.filePath,
    url,
    fileSize: row.fileSize == null ? null : Number(row.fileSize),
    mimeType: row.mimeType,
    relatedEntityType: row.relatedEntityType,
    relatedEntityId: row.relatedEntityId,
    uploadedById: row.uploadedById,
    uploadedAt: row.uploadedAt,
    version: row.version,
    parentDocumentId: row.parentDocumentId,
    isDeleted: row.isDeleted,
  };
}

// -- upload --------------------------------------------------------------

export interface UploadDocumentInput {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  documentType: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  uploadedById?: string;
}

function extensionFor(mime: string): string {
  const ext = MIME_EXTENSION[mime];
  if (!ext) {
    throw new ValidationError(`File type not allowed: ${mime}`, { field: 'file' });
  }
  return ext;
}

async function writeToDisk(buffer: Buffer, ext: string): Promise<string> {
  const now = new Date();
  const yyyy = now.getUTCFullYear().toString();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dir = path.join(UPLOADS_DIR, yyyy, mm);
  await fs.mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}${ext}`;
  const fullPath = path.join(dir, filename);
  await fs.writeFile(fullPath, buffer);
  return fullPath;
}

export async function uploadDocument(input: UploadDocumentInput): Promise<DocumentView> {
  if (!input.buffer || input.buffer.byteLength === 0) {
    throw new ValidationError('Empty file', { field: 'file' });
  }
  if (input.buffer.byteLength > DOCUMENT_MAX_BYTES) {
    throw new ValidationError(
      `File exceeds max size (${DOCUMENT_MAX_BYTES} bytes)`,
      { field: 'file' },
    );
  }

  const ext = extensionFor(input.mimeType);
  const fullPath = await writeToDisk(input.buffer, ext);

  const created = await prisma.document.create({
    data: {
      documentType: input.documentType,
      name: input.originalName || path.basename(fullPath),
      filePath: fullPath,
      fileSize: BigInt(input.buffer.byteLength),
      mimeType: input.mimeType,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
      uploadedById: input.uploadedById,
      version: 1,
    },
  });
  return toView(created);
}

// -- query --------------------------------------------------------------

export async function getDocument(id: string): Promise<DocumentView> {
  const d = await prisma.document.findUnique({ where: { id } });
  if (!d || d.isDeleted) throw new NotFoundError('Document not found');
  return toView(d);
}

export interface ListDocumentsFilters {
  documentType?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  includeDeleted?: boolean;
  page: number;
  limit: number;
}

export async function listDocuments(filters: ListDocumentsFilters): Promise<{
  total: number;
  page: number;
  limit: number;
  documents: DocumentView[];
}> {
  const where: Prisma.DocumentWhereInput = {
    ...(filters.includeDeleted ? {} : { isDeleted: false }),
    ...(filters.documentType ? { documentType: filters.documentType } : {}),
    ...(filters.relatedEntityType ? { relatedEntityType: filters.relatedEntityType } : {}),
    ...(filters.relatedEntityId ? { relatedEntityId: filters.relatedEntityId } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.document.count({ where }),
    prisma.document.findMany({
      where,
      orderBy: { uploadedAt: 'desc' },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);
  return {
    total,
    page: filters.page,
    limit: filters.limit,
    documents: rows.map(toView),
  };
}

// -- soft delete -------------------------------------------------------

export async function softDeleteDocument(args: {
  id: string;
  actorUserId?: string;
}): Promise<void> {
  const d = await prisma.document.findUnique({ where: { id: args.id } });
  if (!d) throw new NotFoundError('Document not found');
  if (d.isDeleted) return;
  await prisma.document.update({
    where: { id: args.id },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      deletedById: args.actorUserId,
    },
  });
}

// -- versioning -------------------------------------------------------

/**
 * Find the most recent active descendant in the version chain rooted at
 * `documentId`. The chain forms a linked list via parentDocumentId; we walk
 * children to find the leaf. (For practical history depths this is fine; if
 * a future use case needs deep chains we'd index a `head` flag instead.)
 */
async function findChainHead(documentId: string): Promise<string> {
  let current = documentId;
  for (let i = 0; i < 100; i++) {
    const child = await rawPrisma.document.findFirst({
      where: { parentDocumentId: current, isDeleted: false },
      orderBy: { uploadedAt: 'desc' },
      select: { id: true },
    });
    if (!child) return current;
    current = child.id;
  }
  // Pathological depth — bail and return the last id we walked to. Caller
  // will see version numbers and can act.
  return current;
}

export interface UploadVersionInput {
  parentDocumentId: string;
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  uploadedById?: string;
}

export async function uploadVersion(input: UploadVersionInput): Promise<DocumentView> {
  const parentId = await findChainHead(input.parentDocumentId);
  const head = await prisma.document.findUnique({ where: { id: parentId } });
  if (!head) throw new NotFoundError('Document not found');
  if (head.isDeleted) {
    throw new ConflictError('Cannot version a deleted document', { headId: head.id });
  }

  const ext = extensionFor(input.mimeType);
  if (!input.buffer || input.buffer.byteLength === 0) {
    throw new ValidationError('Empty file', { field: 'file' });
  }
  if (input.buffer.byteLength > DOCUMENT_MAX_BYTES) {
    throw new ValidationError(
      `File exceeds max size (${DOCUMENT_MAX_BYTES} bytes)`,
      { field: 'file' },
    );
  }
  const fullPath = await writeToDisk(input.buffer, ext);

  const created = await prisma.document.create({
    data: {
      documentType: head.documentType,
      name: input.originalName || head.name,
      filePath: fullPath,
      fileSize: BigInt(input.buffer.byteLength),
      mimeType: input.mimeType,
      relatedEntityType: head.relatedEntityType,
      relatedEntityId: head.relatedEntityId,
      uploadedById: input.uploadedById,
      version: head.version + 1,
      parentDocumentId: head.id,
    },
  });
  return toView(created);
}

/** Return every version in the chain rooted at `id`, oldest first. */
export async function getDocumentChain(id: string): Promise<DocumentView[]> {
  // Walk up to the root, then walk down children.
  const start = await prisma.document.findUnique({ where: { id } });
  if (!start) throw new NotFoundError('Document not found');

  // Walk to root.
  let rootId = start.id;
  for (let i = 0; i < 100; i++) {
    const cur = await rawPrisma.document.findUnique({
      where: { id: rootId },
      select: { parentDocumentId: true },
    });
    if (!cur?.parentDocumentId) break;
    rootId = cur.parentDocumentId;
  }

  // Now walk down, collecting every node.
  const out: RawDocumentRow[] = [];
  let cursor: string | null = rootId;
  for (let i = 0; cursor && i < 100; i++) {
    const node: RawDocumentRow | null = await rawPrisma.document.findUnique({
      where: { id: cursor },
    });
    if (!node) break;
    out.push(node);
    const nextNode: { id: string } | null = await rawPrisma.document.findFirst({
      where: { parentDocumentId: cursor },
      orderBy: { uploadedAt: 'asc' },
      select: { id: true },
    });
    cursor = nextNode?.id ?? null;
  }
  return out.map(toView);
}
