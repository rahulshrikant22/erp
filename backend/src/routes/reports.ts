import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseQuery } from '../utils/validate';
import { materialUsageReport, bomSummaryReport, costingSummaryReport } from '../services/reports';

const router = Router();

const BOM_VIEW = requirePermission('BOM', 'bom', 'view');
const COST_VIEW = requirePermission('COSTING', 'costing', 'view');

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

export default router;
