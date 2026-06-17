import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseQuery } from '../utils/validate';
import {
  materialUsageReport, bomSummaryReport, costingSummaryReport,
  poAgingReport, spendByVendorReport, spendByMaterialReport,
  vendorPerformanceReport, stockValuationReport, slowMovingMaterialsReport,
  inventoryTurnoverReport, importSummaryReport,
} from '../services/reports';

const router = Router();

const BOM_VIEW = requirePermission('BOM', 'bom', 'view');
const COST_VIEW = requirePermission('COSTING', 'costing', 'view');
const PO_VIEW = requirePermission('PURCHASE_ORDER', 'purchase_order', 'view');
const VENDOR_VIEW = requirePermission('VENDOR', 'vendor', 'view');
const INV_VIEW = requirePermission('INVENTORY', 'stock', 'view');

const materialUsageQuery = z.object({
  material_id: z.string().uuid().optional(),
  bom_id: z.string().uuid().optional(),
});

const costingSummaryQuery = z.object({
  bom_version_id: z.string().uuid().optional(),
});

router.get('/material-usage', requireInternal, BOM_VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, materialUsageQuery);
    const data = await materialUsageReport({
      materialId: q.material_id,
      bomId: q.bom_id,
    });
    sendSuccess(res, { report: data });
  } catch (err) { next(err); }
});

router.get('/bom-summary', requireInternal, BOM_VIEW, async (_req, res, next) => {
  try {
    const data = await bomSummaryReport();
    sendSuccess(res, { report: data });
  } catch (err) { next(err); }
});

router.get('/costing-summary', requireInternal, COST_VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, costingSummaryQuery);
    const data = await costingSummaryReport({ bomVersionId: q.bom_version_id });
    sendSuccess(res, { report: data });
  } catch (err) { next(err); }
});

// ─── Supply Chain Reports ──────────────────────────────────────────────────────

const dateRangeQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

router.get('/po-aging', requireInternal, PO_VIEW, async (_req, res, next) => {
  try {
    const data = await poAgingReport();
    sendSuccess(res, { report: data });
  } catch (err) { next(err); }
});

router.get('/spend-by-vendor', requireInternal, VENDOR_VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, dateRangeQuery);
    const data = await spendByVendorReport({ from: q.from, to: q.to });
    sendSuccess(res, { report: data });
  } catch (err) { next(err); }
});

router.get('/spend-by-material', requireInternal, PO_VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, dateRangeQuery);
    const data = await spendByMaterialReport({ from: q.from, to: q.to });
    sendSuccess(res, { report: data });
  } catch (err) { next(err); }
});

router.get('/vendor-performance', requireInternal, VENDOR_VIEW, async (_req, res, next) => {
  try {
    const data = await vendorPerformanceReport();
    sendSuccess(res, { report: data });
  } catch (err) { next(err); }
});

router.get('/stock-valuation', requireInternal, INV_VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, z.object({ location_id: z.string().uuid().optional() }));
    const data = await stockValuationReport(q.location_id);
    sendSuccess(res, { report: data });
  } catch (err) { next(err); }
});

router.get('/slow-moving-materials', requireInternal, INV_VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, z.object({ days: z.coerce.number().int().positive().default(90) }));
    const data = await slowMovingMaterialsReport(q.days);
    sendSuccess(res, { report: data });
  } catch (err) { next(err); }
});

router.get('/inventory-turnover', requireInternal, INV_VIEW, async (_req, res, next) => {
  try {
    const data = await inventoryTurnoverReport();
    sendSuccess(res, { report: data });
  } catch (err) { next(err); }
});

router.get('/import-summary', requireInternal, PO_VIEW, async (_req, res, next) => {
  try {
    const data = await importSummaryReport();
    sendSuccess(res, { report: data });
  } catch (err) { next(err); }
});

export default router;
