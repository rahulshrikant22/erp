/**
 * P2-05 integration tests — Material Images Management.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { createInternalUser, loginInternal } from '../helpers';

let app: Application;
let adminTokens: { accessToken: string };
let materialId: string;
let optionalCatMaterialId: string;

function make1x1Png(): Buffer {
  // minimal 1×1 red PNG created via sharp
  return sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } } })
    .png()
    .toBuffer() as unknown as Buffer;
}

let pngBuffer: Buffer;

beforeAll(async () => {
  app = createApp();

  const admin = await createInternalUser({ roleCode: 'admin' });
  adminTokens = await loginInternal(app, admin.email, admin.password);

  // Generate a real PNG buffer for tests
  pngBuffer = await sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } },
  }).png().toBuffer();

  // Create a test material in a "required" image category (BOARDS)
  const boardsCat = await prisma.materialCategory.findUnique({ where: { categoryCode: 'BOARDS' } });
  const rawType = await prisma.materialType.findUnique({ where: { typeCode: 'RAW' } });
  const profile = await prisma.materialCategoryTypeProfile.findFirst({
    where: { categoryId: boardsCat!.id, materialTypeId: rawType!.id },
  });
  const mfr = await prisma.materialManufacturer.findUnique({ where: { manufacturerCode: 'ACTION_TESA' } });

  const m = await prisma.material.create({
    data: {
      materialCode: `TEST_IMG_${Date.now()}`,
      materialName: 'Test Image Material',
      categoryId: boardsCat!.id,
      materialTypeId: rawType!.id,
      categoryTypeProfileId: profile!.id,
      manufacturerId: mfr!.id,
      attributeHash: `test_img_hash_${Date.now()}`,
      purchaseUom: 'SHT',
      consumptionUom: 'SQF',
      uomConversionFactor: 32,
      hasPendingImage: true,
      isActive: true,
    },
  });
  materialId = m.id;

  // Create a material in an "optional" image category (HARDWARE)
  const hwCat = await prisma.materialCategory.findUnique({ where: { categoryCode: 'HARDWARE' } });
  const hwProfile = await prisma.materialCategoryTypeProfile.findFirst({
    where: { categoryId: hwCat!.id, materialTypeId: rawType!.id },
  });

  const m2 = await prisma.material.create({
    data: {
      materialCode: `TEST_IMG2_${Date.now()}`,
      materialName: 'Test Hardware Material',
      categoryId: hwCat!.id,
      materialTypeId: rawType!.id,
      categoryTypeProfileId: hwProfile!.id,
      manufacturerId: mfr!.id,
      attributeHash: `test_img2_hash_${Date.now()}`,
      purchaseUom: 'NOS',
      consumptionUom: 'NOS',
      uomConversionFactor: 1,
      hasPendingImage: false,
      isActive: true,
    },
  });
  optionalCatMaterialId = m2.id;
});

afterAll(async () => {
  await prisma.materialImage.deleteMany({
    where: { materialId: { in: [materialId, optionalCatMaterialId] } },
  });
  await prisma.material.deleteMany({
    where: { materialCode: { startsWith: 'TEST_IMG' } },
  });
  await prisma.$disconnect();
});

describe('Image upload', () => {
  let firstImageId: string;

  it('POST uploads a single image', async () => {
    const res = await request(app)
      .post(`/api/material/materials/${materialId}/images`)
      .query({ image_type: 'swatch', is_primary: 'true' })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .attach('files', pngBuffer, 'test-swatch.png');

    expect(res.status).toBe(201);
    expect(res.body.data.images).toHaveLength(1);
    expect(res.body.data.images[0].imageType).toBe('swatch');
    expect(res.body.data.images[0].isPrimary).toBe(true);
    expect(res.body.data.images[0].url).toContain('/uploads/');
    firstImageId = res.body.data.images[0].id;
  });

  it('upload clears hasPendingImage on the material', async () => {
    const mat = await prisma.material.findUnique({ where: { id: materialId } });
    expect(mat!.hasPendingImage).toBe(false);
    expect(mat!.primaryImagePath).toBeTruthy();
  });

  it('POST uploads multiple images', async () => {
    const res = await request(app)
      .post(`/api/material/materials/${materialId}/images`)
      .query({ image_type: 'full' })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .attach('files', pngBuffer, 'full-1.png')
      .attach('files', pngBuffer, 'full-2.png');

    expect(res.status).toBe(201);
    expect(res.body.data.images).toHaveLength(2);
  });

  it('rejects invalid image type', async () => {
    const res = await request(app)
      .post(`/api/material/materials/${materialId}/images`)
      .query({ image_type: 'garbage' })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .attach('files', pngBuffer, 'bad-type.png');

    expect(res.status).toBe(400);
  });

  it('GET lists images for a material', async () => {
    const res = await request(app)
      .get(`/api/material/materials/${materialId}/images`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.images.length).toBeGreaterThanOrEqual(3);
  });

  it('GET filters images by type', async () => {
    const res = await request(app)
      .get(`/api/material/materials/${materialId}/images`)
      .query({ type: 'swatch' })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.images.every((i: { imageType: string }) => i.imageType === 'swatch')).toBe(true);
  });
});

describe('Set primary', () => {
  let secondImageId: string;

  it('POST set-primary changes the primary image', async () => {
    // Get an image that is NOT primary
    const images = await prisma.materialImage.findMany({
      where: { materialId, isPrimary: false },
      take: 1,
    });
    expect(images.length).toBeGreaterThan(0);
    secondImageId = images[0].id;

    const res = await request(app)
      .post(`/api/material/material-images/${secondImageId}/set-primary`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isPrimary).toBe(true);

    // Old primary should be unset
    const allPrimary = await prisma.materialImage.count({
      where: { materialId, isPrimary: true },
    });
    expect(allPrimary).toBe(1);
  });
});

describe('Update image', () => {
  it('PUT updates image metadata', async () => {
    const img = await prisma.materialImage.findFirst({ where: { materialId } });

    const res = await request(app)
      .put(`/api/material/material-images/${img!.id}`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .send({ display_order: 5 });

    expect(res.status).toBe(200);
    expect(res.body.data.image.displayOrder).toBe(5);
  });
});

describe('Delete image', () => {
  it('DELETE removes an image and auto-promotes primary', async () => {
    const primary = await prisma.materialImage.findFirst({
      where: { materialId, isPrimary: true },
    });

    const res = await request(app)
      .delete(`/api/material/material-images/${primary!.id}`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);

    // Another image should have been promoted
    const newPrimary = await prisma.materialImage.findFirst({
      where: { materialId, isPrimary: true },
    });
    expect(newPrimary).toBeTruthy();
  });

  it('DELETE blocks removing last image when category requires it', async () => {
    // Delete all but one for the required-image material
    const remaining = await prisma.materialImage.findMany({ where: { materialId } });
    // Delete extras leaving exactly 1
    for (let i = 1; i < remaining.length; i++) {
      await prisma.materialImage.delete({ where: { id: remaining[i].id } });
    }

    const lastId = remaining[0].id;
    const res = await request(app)
      .delete(`/api/material/material-images/${lastId}`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(400);
  });

  it('DELETE allows removing last image when category is optional', async () => {
    // Upload an image to optional-category material then delete it
    const uploadRes = await request(app)
      .post(`/api/material/materials/${optionalCatMaterialId}/images`)
      .query({ image_type: 'full' })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .attach('files', pngBuffer, 'opt.png');

    const imgId = uploadRes.body.data.images[0].id;

    const res = await request(app)
      .delete(`/api/material/material-images/${imgId}`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(200);
  });
});

describe('Pending image queue', () => {
  it('POST clear-pending-image-flag works', async () => {
    // Set flag back to true for test
    await prisma.material.update({
      where: { id: materialId },
      data: { hasPendingImage: true },
    });

    const res = await request(app)
      .post(`/api/material/materials/${materialId}/clear-pending-image-flag`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.hasPendingImage).toBe(false);
  });

  it('POST clear-pending-image-flag errors when not pending', async () => {
    const res = await request(app)
      .post(`/api/material/materials/${materialId}/clear-pending-image-flag`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(400);
  });
});

describe('Category image rules', () => {
  let ruleId: string;

  it('GET returns seeded image rules', async () => {
    const res = await request(app)
      .get('/api/admin/material/category-image-rules')
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.rules.length).toBe(12);
    ruleId = res.body.data.rules[0].id;
  });

  it('PUT updates a rule to required_deferrable', async () => {
    const res = await request(app)
      .put(`/api/admin/material/category-image-rules/${ruleId}`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .send({ image_requirement: 'required_deferrable' });

    expect(res.status).toBe(200);
    expect(res.body.data.rule.imageRequirement).toBe('required_deferrable');
  });

  it('PUT rejects invalid requirement', async () => {
    const res = await request(app)
      .put(`/api/admin/material/category-image-rules/${ruleId}`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .send({ image_requirement: 'bogus' });

    expect(res.status).toBe(400);
  });

  // Restore to original
  afterAll(async () => {
    await prisma.materialCategoryImageRule.update({
      where: { id: ruleId },
      data: { imageRequirement: 'required' },
    });
  });
});

describe('Thumbnail generation', () => {
  it('swatch upload generates a thumbnail URL', async () => {
    const res = await request(app)
      .post(`/api/material/materials/${materialId}/images`)
      .query({ image_type: 'swatch' })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .attach('files', pngBuffer, 'thumb-test.png');

    expect(res.status).toBe(201);
    expect(res.body.data.images[0].thumbnailUrl).toContain('_thumb');
  });

  it('closeup upload generates a medium URL', async () => {
    const res = await request(app)
      .post(`/api/material/materials/${materialId}/images`)
      .query({ image_type: 'closeup' })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .attach('files', pngBuffer, 'closeup-test.png');

    expect(res.status).toBe(201);
    expect(res.body.data.images[0].mediumUrl).toContain('_med');
  });
});
