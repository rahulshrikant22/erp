import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  createSelectionList,
  listSelectionLists,
  getSelectionList,
  updateSelectionList,
  deleteSelectionList,
  addItem,
  updateItem,
  deleteItem,
  submitSelectionList,
  approveSelectionList,
  rejectSelectionList,
} from '../services/selection-lists';

const router = Router();

const VIEW = requirePermission('SEL_LIST', 'sel_list', 'view');
const CREATE = requirePermission('SEL_LIST', 'sel_list', 'create');
const EDIT = requirePermission('SEL_LIST', 'sel_list', 'edit');
const DELETE = requirePermission('SEL_LIST', 'sel_list', 'delete');
const APPROVE = requirePermission('SEL_LIST', 'sel_list', 'approve');

const idParam = z.object({ id: z.string().uuid() });
const itemParam = z.object({ id: z.string().uuid(), itemId: z.string().uuid() });

const createBody = z.object({
  order_id: z.string().uuid(),
  finish_group_name: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const updateBody = z.object({
  finish_group_name: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const listQuery = z.object({
  order_id: z.string().uuid().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

const addItemBody = z.object({
  order_line_id: z.string().uuid().nullable().optional(),
  bom_material_line_id: z.string().uuid(),
  selected_material_id: z.string().uuid(),
  alternate_chosen: z.boolean().optional(),
  quantity_override: z.number().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const updateItemBody = z.object({
  selected_material_id: z.string().uuid().optional(),
  alternate_chosen: z.boolean().optional(),
  quantity_override: z.number().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// ─── CRUD ───────────────────────────────────────────────────────────────────────

router.post('/', requireInternal, CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, createBody);
    const sl = await createSelectionList({
      orderId: body.order_id,
      finishGroupName: body.finish_group_name,
      notes: body.notes,
    });
    sendSuccess(res, { selectionList: sl }, { status: 201 });
  } catch (err) { next(err); }
});

router.get('/', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, listQuery);
    const result = await listSelectionLists({
      orderId: q.order_id,
      status: q.status,
      page: q.page,
      limit: q.limit,
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.get('/:id', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const sl = await getSelectionList(id);
    sendSuccess(res, { selectionList: sl });
  } catch (err) { next(err); }
});

router.put('/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, updateBody);
    const sl = await updateSelectionList(id, {
      finishGroupName: body.finish_group_name,
      notes: body.notes,
    });
    sendSuccess(res, { selectionList: sl });
  } catch (err) { next(err); }
});

router.delete('/:id', requireInternal, DELETE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    await deleteSelectionList(id);
    sendSuccess(res, { deleted: true });
  } catch (err) { next(err); }
});

// ─── Items ──────────────────────────────────────────────────────────────────────

router.post('/:id/items', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, addItemBody);
    const item = await addItem(id, {
      orderLineId: body.order_line_id,
      bomMaterialLineId: body.bom_material_line_id,
      selectedMaterialId: body.selected_material_id,
      alternateChosen: body.alternate_chosen,
      quantityOverride: body.quantity_override,
      notes: body.notes,
    });
    sendSuccess(res, { item }, { status: 201 });
  } catch (err) { next(err); }
});

router.put('/:id/items/:itemId', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id, itemId } = parseParams(req, itemParam);
    const body = parseBody(req, updateItemBody);
    const item = await updateItem(id, itemId, {
      selectedMaterialId: body.selected_material_id,
      alternateChosen: body.alternate_chosen,
      quantityOverride: body.quantity_override,
      notes: body.notes,
    });
    sendSuccess(res, { item });
  } catch (err) { next(err); }
});

router.delete('/:id/items/:itemId', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id, itemId } = parseParams(req, itemParam);
    await deleteItem(id, itemId);
    sendSuccess(res, { deleted: true });
  } catch (err) { next(err); }
});

// ─── Workflow transitions ───────────────────────────────────────────────────────

router.post('/:id/submit', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const sl = await submitSelectionList(id, {
      type: 'engineering',
      userId: (req as any).user?.id,
    });
    sendSuccess(res, { selectionList: sl });
  } catch (err) { next(err); }
});

router.post('/:id/approve', requireInternal, APPROVE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const sl = await approveSelectionList(id, (req as any).user?.id);
    sendSuccess(res, { selectionList: sl });
  } catch (err) { next(err); }
});

router.post('/:id/reject', requireInternal, APPROVE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const sl = await rejectSelectionList(id);
    sendSuccess(res, { selectionList: sl });
  } catch (err) { next(err); }
});

export default router;
