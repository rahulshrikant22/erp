/**
 * Material Images service — P2-05.
 *
 * Upload, manage, and transform images for materials.
 * Integrates with core documents for storage and MaterialImage for metadata.
 * Thumbnail / medium-size generation via sharp.
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { parse } from 'csv-parse/sync';
import AdmZip from 'adm-zip';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_DIMENSION = 10_000;
const IMAGE_TYPES = new Set(['swatch', 'full', 'closeup', 'application', 'technical']);

const REPO_ROOT = path.resolve(__dirname, '../../..');
const UPLOADS_DIR = path.join(REPO_ROOT, 'uploads');

const THUMB_SIZE = 256;
const MEDIUM_SIZE = 800;

// ─── helpers ───────────────────────────────────────────────────────────────────

function mimeToExt(mime: string): string {
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  throw new ValidationError(`Unsupported image type: ${mime}`);
}

async function writeToDisk(buffer: Buffer, ext: string): Promise<string> {
  const now = new Date();
  const dir = path.join(
    UPLOADS_DIR,
    now.getUTCFullYear().toString(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
  );
  await fs.mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}${ext}`;
  const fullPath = path.join(dir, filename);
  await fs.writeFile(fullPath, buffer);
  return fullPath;
}

function toPublicUrl(fullPath: string): string {
  const idx = fullPath.indexOf('/uploads/');
  return idx >= 0 ? fullPath.slice(idx) : fullPath;
}

async function validateImageBuffer(buffer: Buffer, fileName: string): Promise<sharp.Metadata> {
  if (buffer.byteLength > MAX_FILE_SIZE) {
    throw new ValidationError(`File exceeds 10 MB limit: ${fileName}`);
  }

  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw new ValidationError(`Cannot read image metadata: ${fileName}`);
  }

  if (!meta.format || !['jpeg', 'png', 'webp'].includes(meta.format)) {
    throw new ValidationError(`Unsupported image format: ${meta.format ?? 'unknown'} (${fileName})`);
  }
  if ((meta.width ?? 0) > MAX_DIMENSION || (meta.height ?? 0) > MAX_DIMENSION) {
    throw new ValidationError(`Image too large: ${meta.width}×${meta.height} exceeds ${MAX_DIMENSION}×${MAX_DIMENSION} (${fileName})`);
  }

  return meta;
}

async function generateThumbnail(buffer: Buffer, ext: string): Promise<string> {
  const thumb = await sharp(buffer).resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' }).toBuffer();
  return writeToDisk(thumb, `_thumb${ext}`);
}

async function generateMedium(buffer: Buffer, ext: string): Promise<string> {
  const med = await sharp(buffer).resize(MEDIUM_SIZE, MEDIUM_SIZE, { fit: 'inside' }).toBuffer();
  return writeToDisk(med, `_med${ext}`);
}

// ─── upload ────────────────────────────────────────────────────────────────────

export interface UploadImageInput {
  materialId: string;
  files: Array<{ buffer: Buffer; originalname: string; mimetype: string }>;
  imageType: string;
  isPrimary?: boolean;
  uploadedBy?: string;
}

export async function uploadMaterialImages(input: UploadImageInput) {
  if (!IMAGE_TYPES.has(input.imageType)) {
    throw new ValidationError(`Invalid image_type: ${input.imageType}. Allowed: ${[...IMAGE_TYPES].join(', ')}`);
  }

  const material = await prisma.material.findUnique({ where: { id: input.materialId } });
  if (!material || material.isDeleted) throw new NotFoundError('Material not found');

  const created = [];

  for (let i = 0; i < input.files.length; i++) {
    const file = input.files[i];

    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new ValidationError(`File type not allowed: ${file.mimetype} (${file.originalname})`);
    }

    await validateImageBuffer(file.buffer, file.originalname);

    const ext = mimeToExt(file.mimetype);
    const imagePath = await writeToDisk(file.buffer, ext);

    // Generate thumbnail for swatch images
    let thumbPath: string | undefined;
    if (input.imageType === 'swatch') {
      thumbPath = await generateThumbnail(file.buffer, ext);
    }

    // Generate medium for closeup / application images
    let mediumPath: string | undefined;
    if (input.imageType === 'closeup' || input.imageType === 'application') {
      mediumPath = await generateMedium(file.buffer, ext);
    }

    const isPrimary = input.isPrimary && i === 0;

    // If setting as primary, unset existing primary
    if (isPrimary) {
      await prisma.materialImage.updateMany({
        where: { materialId: input.materialId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const maxOrder = await prisma.materialImage.aggregate({
      where: { materialId: input.materialId },
      _max: { displayOrder: true },
    });
    const nextOrder = (maxOrder._max.displayOrder ?? -1) + 1;

    const img = await prisma.materialImage.create({
      data: {
        materialId: input.materialId,
        imagePath,
        imageType: input.imageType,
        isPrimary: isPrimary ?? false,
        displayOrder: nextOrder,
        uploadedBy: input.uploadedBy,
      },
    });

    // Update material's primary image path
    if (isPrimary) {
      await prisma.material.update({
        where: { id: input.materialId },
        data: { primaryImagePath: imagePath, hasPendingImage: false },
      });
    }

    // Clear pending image flag on first upload if material had pending
    if (material.hasPendingImage && created.length === 0) {
      await prisma.material.update({
        where: { id: input.materialId },
        data: { hasPendingImage: false },
      });
    }

    created.push({
      ...img,
      url: toPublicUrl(imagePath),
      thumbnailUrl: thumbPath ? toPublicUrl(thumbPath) : undefined,
      mediumUrl: mediumPath ? toPublicUrl(mediumPath) : undefined,
    });
  }

  return created;
}

// ─── update ────────────────────────────────────────────────────────────────────

export interface UpdateImageInput {
  imageType?: string;
  isPrimary?: boolean;
  displayOrder?: number;
}

export async function updateMaterialImage(id: string, input: UpdateImageInput) {
  const img = await prisma.materialImage.findUnique({ where: { id } });
  if (!img) throw new NotFoundError('Material image not found');

  if (input.imageType !== undefined && !IMAGE_TYPES.has(input.imageType)) {
    throw new ValidationError(`Invalid image_type: ${input.imageType}`);
  }

  if (input.isPrimary) {
    await prisma.materialImage.updateMany({
      where: { materialId: img.materialId, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  const updated = await prisma.materialImage.update({
    where: { id },
    data: {
      ...(input.imageType !== undefined ? { imageType: input.imageType } : {}),
      ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
      ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
    },
  });

  if (input.isPrimary) {
    await prisma.material.update({
      where: { id: img.materialId },
      data: { primaryImagePath: img.imagePath },
    });
  }

  return { ...updated, url: toPublicUrl(updated.imagePath) };
}

// ─── delete ────────────────────────────────────────────────────────────────────

export async function deleteMaterialImage(id: string) {
  const img = await prisma.materialImage.findUnique({ where: { id } });
  if (!img) throw new NotFoundError('Material image not found');

  // Check if it's the only image and category requires one
  const imageCount = await prisma.materialImage.count({ where: { materialId: img.materialId } });

  if (imageCount === 1) {
    const material = await prisma.material.findUnique({ where: { id: img.materialId } });
    if (material) {
      const rule = await prisma.materialCategoryImageRule.findFirst({
        where: { categoryId: material.categoryId },
      });
      if (rule?.imageRequirement === 'required') {
        throw new ValidationError('Cannot delete the only image — category requires at least one image');
      }
    }
  }

  await prisma.materialImage.delete({ where: { id } });

  // If was primary, promote next
  if (img.isPrimary) {
    const next = await prisma.materialImage.findFirst({
      where: { materialId: img.materialId },
      orderBy: { displayOrder: 'asc' },
    });
    if (next) {
      await prisma.materialImage.update({ where: { id: next.id }, data: { isPrimary: true } });
      await prisma.material.update({
        where: { id: img.materialId },
        data: { primaryImagePath: next.imagePath },
      });
    } else {
      await prisma.material.update({
        where: { id: img.materialId },
        data: { primaryImagePath: null },
      });
    }
  }

  return { deleted: true };
}

// ─── set primary ───────────────────────────────────────────────────────────────

export async function setPrimaryImage(id: string) {
  const img = await prisma.materialImage.findUnique({ where: { id } });
  if (!img) throw new NotFoundError('Material image not found');

  await prisma.materialImage.updateMany({
    where: { materialId: img.materialId, isPrimary: true },
    data: { isPrimary: false },
  });

  await prisma.materialImage.update({
    where: { id },
    data: { isPrimary: true },
  });

  await prisma.material.update({
    where: { id: img.materialId },
    data: { primaryImagePath: img.imagePath },
  });

  return { id: img.id, isPrimary: true };
}

// ─── list / gallery ────────────────────────────────────────────────────────────

export async function listMaterialImages(materialId: string, imageType?: string) {
  const material = await prisma.material.findUnique({ where: { id: materialId } });
  if (!material || material.isDeleted) throw new NotFoundError('Material not found');

  const where: { materialId: string; imageType?: string } = { materialId };
  if (imageType) where.imageType = imageType;

  const images = await prisma.materialImage.findMany({
    where,
    orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }],
  });

  return images.map((img) => ({
    ...img,
    url: toPublicUrl(img.imagePath),
  }));
}

// ─── category image rules ──────────────────────────────────────────────────────

export async function listCategoryImageRules() {
  return prisma.materialCategoryImageRule.findMany({
    include: { category: { select: { categoryCode: true, name: true } } },
    orderBy: { category: { categoryCode: 'asc' } },
  });
}

export async function updateCategoryImageRule(id: string, imageRequirement: string) {
  const valid = ['required', 'optional', 'required_deferrable'];
  if (!valid.includes(imageRequirement)) {
    throw new ValidationError(`Invalid imageRequirement: ${imageRequirement}. Allowed: ${valid.join(', ')}`);
  }

  const rule = await prisma.materialCategoryImageRule.findUnique({ where: { id } });
  if (!rule) throw new NotFoundError('Category image rule not found');

  return prisma.materialCategoryImageRule.update({
    where: { id },
    data: { imageRequirement },
    include: { category: { select: { categoryCode: true, name: true } } },
  });
}

// ─── pending-image queue ───────────────────────────────────────────────────────

export async function clearPendingImageFlag(materialId: string) {
  const material = await prisma.material.findUnique({ where: { id: materialId } });
  if (!material || material.isDeleted) throw new NotFoundError('Material not found');

  if (!material.hasPendingImage) {
    throw new ValidationError('Material does not have a pending image flag');
  }

  return prisma.material.update({
    where: { id: materialId },
    data: { hasPendingImage: false },
    select: { id: true, materialCode: true, hasPendingImage: true },
  });
}

// ─── bulk image upload (zip + CSV mapping) ─────────────────────────────────────

interface BulkImageResult {
  totalFiles: number;
  successCount: number;
  errorCount: number;
  errors: Array<{ file: string; message: string }>;
}

export async function bulkUploadImages(
  zipBuffer: Buffer,
  csvBuffer: Buffer,
  imageType: string,
  uploadedBy?: string,
): Promise<BulkImageResult> {
  if (!IMAGE_TYPES.has(imageType)) {
    throw new ValidationError(`Invalid image_type: ${imageType}`);
  }

  // Parse CSV mapping: material_code,filename
  let mappings: Array<{ material_code: string; filename: string }>;
  try {
    mappings = parse(csvBuffer, { columns: true, skip_empty_lines: true, trim: true });
  } catch {
    throw new ValidationError('Invalid mapping CSV format');
  }

  // Extract zip
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  const fileMap = new Map<string, Buffer>();
  for (const entry of entries) {
    if (!entry.isDirectory) {
      fileMap.set(entry.entryName.split('/').pop()!, entry.getData());
    }
  }

  const errors: BulkImageResult['errors'] = [];
  let successCount = 0;

  for (const row of mappings) {
    const code = row.material_code?.trim();
    const filename = row.filename?.trim();

    if (!code || !filename) {
      errors.push({ file: filename || '(empty)', message: 'Missing material_code or filename' });
      continue;
    }

    const buffer = fileMap.get(filename);
    if (!buffer) {
      errors.push({ file: filename, message: 'File not found in zip' });
      continue;
    }

    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      errors.push({ file: filename, message: `Unsupported file extension: ${ext}` });
      continue;
    }

    const material = await prisma.material.findFirst({
      where: { materialCode: code, isDeleted: false },
    });
    if (!material) {
      errors.push({ file: filename, message: `Material not found: ${code}` });
      continue;
    }

    try {
      await validateImageBuffer(buffer, filename);
    } catch (e) {
      errors.push({ file: filename, message: (e as Error).message });
      continue;
    }

    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
      : ext === '.png' ? 'image/png'
      : 'image/webp';

    await uploadMaterialImages({
      materialId: material.id,
      files: [{ buffer, originalname: filename, mimetype: mime }],
      imageType,
      isPrimary: false,
      uploadedBy,
    });

    successCount++;
  }

  return {
    totalFiles: mappings.length,
    successCount,
    errorCount: errors.length,
    errors,
  };
}
