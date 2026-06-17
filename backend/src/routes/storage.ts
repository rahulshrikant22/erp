import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  createLocation, listLocations, getLocation, updateLocation, deleteLocation,
  freezeLocation, unfreezeLocation, getLocationTree,
  createRack, listRacks, updateRack, deleteRack,
  createBin, listBins, updateBin, deleteBin, bulkCreateBins,
  createGeneralArea, listGeneralAreas, updateGeneralArea, deleteGeneralArea,
} from '../services/storage';

const router = Router();

const VIEW = requirePermission('INVENTORY', 'storage', 'view');
const CREATE = requirePermission('INVENTORY', 'storage', 'create');
const EDIT = requirePermission('INVENTORY', 'storage', 'edit');
const DELETE = requirePermission('INVENTORY', 'storage', 'delete');

const idParam = z.object({ id: z.string().uuid() });

// ─── Locations ──────────────────────────────────────────────────────────────────

const locationBody = z.object({
  location_code: z.string().min(1).max(50),
  location_name: z.string().min(1).max(200),
  location_type: z.enum(['factory_store', 'warehouse', 'shop_floor', 'qc_hold', 'quarantine', 'returns_hold']),
  branch_id: z.string().uuid().nullable().optional(),
  parent_location_id: z.string().uuid().nullable().optional(),
  description: z.string().nullable().optional(),
});

const locationListQuery = z.object({
  search: z.string().optional(),
  location_type: z.string().optional(),
  is_active: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  branch_id: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

router.get('/locations/tree', requireInternal, VIEW, async (_req, res, next) => {
  try {
    const tree = await getLocationTree();
    sendSuccess(res, { tree });
  } catch (err) { next(err); }
});

router.post('/locations', requireInternal, CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, locationBody);
    const location = await createLocation({
      locationCode: body.location_code,
      locationName: body.location_name,
      locationType: body.location_type,
      branchId: body.branch_id,
      parentLocationId: body.parent_location_id,
      description: body.description,
    });
    sendSuccess(res, { location }, { status: 201 });
  } catch (err) { next(err); }
});

router.get('/locations', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, locationListQuery);
    const result = await listLocations({
      search: q.search,
      locationType: q.location_type,
      isActive: q.is_active,
      branchId: q.branch_id,
      page: q.page,
      limit: q.limit,
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.get('/locations/:id', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const location = await getLocation(id);
    sendSuccess(res, { location });
  } catch (err) { next(err); }
});

router.put('/locations/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, locationBody.partial().omit({ location_code: true }));
    const location = await updateLocation(id, {
      locationName: body.location_name,
      locationType: body.location_type,
      branchId: body.branch_id,
      parentLocationId: body.parent_location_id,
      description: body.description,
    });
    sendSuccess(res, { location });
  } catch (err) { next(err); }
});

router.delete('/locations/:id', requireInternal, DELETE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    await deleteLocation(id);
    sendSuccess(res, { deleted: true });
  } catch (err) { next(err); }
});

router.post('/locations/:id/freeze', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const location = await freezeLocation(id);
    sendSuccess(res, { location });
  } catch (err) { next(err); }
});

router.post('/locations/:id/unfreeze', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const location = await unfreezeLocation(id);
    sendSuccess(res, { location });
  } catch (err) { next(err); }
});

// ─── Racks ──────────────────────────────────────────────────────────────────────

const rackBody = z.object({
  rack_code: z.string().min(1).max(50),
  rack_name: z.string().nullable().optional(),
  capacity_kg: z.number().nonnegative().nullable().optional(),
  capacity_volume: z.number().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
});

router.post('/locations/:id/racks', requireInternal, CREATE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, rackBody);
    const rack = await createRack(id, {
      rackCode: body.rack_code,
      rackName: body.rack_name,
      capacityKg: body.capacity_kg,
      capacityVolume: body.capacity_volume,
      notes: body.notes,
    });
    sendSuccess(res, { rack }, { status: 201 });
  } catch (err) { next(err); }
});

router.get('/locations/:id/racks', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const racks = await listRacks(id);
    sendSuccess(res, { racks });
  } catch (err) { next(err); }
});

router.put('/racks/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, rackBody.partial().extend({ is_active: z.boolean().optional() }));
    const rack = await updateRack(id, {
      rackCode: body.rack_code,
      rackName: body.rack_name,
      capacityKg: body.capacity_kg,
      capacityVolume: body.capacity_volume,
      notes: body.notes,
      isActive: body.is_active,
    });
    sendSuccess(res, { rack });
  } catch (err) { next(err); }
});

router.delete('/racks/:id', requireInternal, DELETE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    await deleteRack(id);
    sendSuccess(res, { deleted: true });
  } catch (err) { next(err); }
});

// ─── Bins ───────────────────────────────────────────────────────────────────────

const binBody = z.object({
  bin_code: z.string().min(1).max(50),
  bin_label: z.string().nullable().optional(),
  capacity: z.number().nonnegative().nullable().optional(),
  material_category_restriction: z.string().nullable().optional(),
});

router.post('/racks/:id/bins', requireInternal, CREATE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, binBody);
    const bin = await createBin(id, {
      binCode: body.bin_code,
      binLabel: body.bin_label,
      capacity: body.capacity,
      materialCategoryRestriction: body.material_category_restriction,
    });
    sendSuccess(res, { bin }, { status: 201 });
  } catch (err) { next(err); }
});

router.get('/racks/:id/bins', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const bins = await listBins(id);
    sendSuccess(res, { bins });
  } catch (err) { next(err); }
});

router.put('/bins/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, binBody.partial().extend({ is_active: z.boolean().optional() }));
    const bin = await updateBin(id, {
      binCode: body.bin_code,
      binLabel: body.bin_label,
      capacity: body.capacity,
      materialCategoryRestriction: body.material_category_restriction,
      isActive: body.is_active,
    });
    sendSuccess(res, { bin });
  } catch (err) { next(err); }
});

router.delete('/bins/:id', requireInternal, DELETE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    await deleteBin(id);
    sendSuccess(res, { deleted: true });
  } catch (err) { next(err); }
});

router.post('/bins/bulk-create', requireInternal, CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, z.object({
      rack_ids: z.array(z.string().uuid()).min(1),
      prefix: z.string().min(1),
      start_number: z.number().int().positive(),
      count: z.number().int().positive().max(100),
      capacity: z.number().nonnegative().nullable().optional(),
      material_category_restriction: z.string().nullable().optional(),
    }));
    const bins = await bulkCreateBins(body.rack_ids, {
      prefix: body.prefix,
      startNumber: body.start_number,
      count: body.count,
      capacity: body.capacity,
      materialCategoryRestriction: body.material_category_restriction,
    });
    sendSuccess(res, { bins, count: bins.length }, { status: 201 });
  } catch (err) { next(err); }
});

// ─── General Areas ──────────────────────────────────────────────────────────────

const areaBody = z.object({
  area_code: z.string().min(1).max(50),
  area_name: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  material_category_restriction: z.string().nullable().optional(),
});

router.post('/locations/:id/areas', requireInternal, CREATE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, areaBody);
    const area = await createGeneralArea(id, {
      areaCode: body.area_code,
      areaName: body.area_name,
      description: body.description,
      materialCategoryRestriction: body.material_category_restriction,
    });
    sendSuccess(res, { area }, { status: 201 });
  } catch (err) { next(err); }
});

router.get('/locations/:id/areas', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const areas = await listGeneralAreas(id);
    sendSuccess(res, { areas });
  } catch (err) { next(err); }
});

router.put('/areas/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, areaBody.partial().extend({ is_active: z.boolean().optional() }));
    const area = await updateGeneralArea(id, {
      areaCode: body.area_code,
      areaName: body.area_name,
      description: body.description,
      materialCategoryRestriction: body.material_category_restriction,
      isActive: body.is_active,
    });
    sendSuccess(res, { area });
  } catch (err) { next(err); }
});

router.delete('/areas/:id', requireInternal, DELETE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    await deleteGeneralArea(id);
    sendSuccess(res, { deleted: true });
  } catch (err) { next(err); }
});

export default router;
