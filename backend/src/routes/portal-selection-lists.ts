import { Router } from 'express';
import { z } from 'zod';
import { requireCustomer } from '../middleware/auth';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import { prisma } from '../lib/prisma';
import {
  getSelectionList,
  addItem,
  updateItem,
  deleteItem,
  submitSelectionList,
} from '../services/selection-lists';

const router = Router();

const idParam = z.object({ id: z.string().uuid() });
const itemParam = z.object({ id: z.string().uuid(), itemId: z.string().uuid() });

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

router.get('/', requireCustomer, async (req, res, next) => {
  try {
    const q = parseQuery(req, listQuery);
    const user = (req as any).user;
    const accountId = user?.customerAccountId;
    if (!accountId) return sendSuccess(res, { selectionLists: [], total: 0 });

    const where: any = { isDeleted: false };
    if (q.status) where.status = q.status;

    where.order = { customer: { customerAccountId: accountId } };
    if (q.order_id) where.orderId = q.order_id;

    const page = q.page ?? 1;
    const limit = q.limit ?? 50;

    const [total, selectionLists] = await Promise.all([
      prisma.selectionList.count({ where }),
      prisma.selectionList.findMany({
        where,
        include: {
          order: { select: { id: true, orderNumber: true } },
          _count: { select: { items: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    sendSuccess(res, { total, page, limit, selectionLists });
  } catch (err) { next(err); }
});

router.get('/:id', requireCustomer, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const sl = await getSelectionList(id);
    sendSuccess(res, { selectionList: sl });
  } catch (err) { next(err); }
});

router.post('/:id/items', requireCustomer, async (req, res, next) => {
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

router.put('/:id/items/:itemId', requireCustomer, async (req, res, next) => {
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

router.delete('/:id/items/:itemId', requireCustomer, async (req, res, next) => {
  try {
    const { id, itemId } = parseParams(req, itemParam);
    await deleteItem(id, itemId);
    sendSuccess(res, { deleted: true });
  } catch (err) { next(err); }
});

router.post('/:id/submit', requireCustomer, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const user = (req as any).user;
    const sl = await submitSelectionList(id, {
      type: 'customer',
      userId: user?.id,
    });
    sendSuccess(res, { selectionList: sl });
  } catch (err) { next(err); }
});

export default router;
