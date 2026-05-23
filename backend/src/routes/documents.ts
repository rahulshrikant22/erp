/**
 * Generic document endpoints. All gated by the DOC_MGMT module's permissions.
 *
 *   POST   /api/documents                 multipart  (DOC_MGMT:doc_mgmt:create)
 *   GET    /api/documents?related...      list       (DOC_MGMT:doc_mgmt:view)
 *   GET    /api/documents/:id                        (DOC_MGMT:doc_mgmt:view)
 *   GET    /api/documents/:id/chain                  (DOC_MGMT:doc_mgmt:view)
 *   POST   /api/documents/:id/version     multipart  (DOC_MGMT:doc_mgmt:edit)
 *   DELETE /api/documents/:id                        (DOC_MGMT:doc_mgmt:delete)
 */
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseParams, parseQuery } from '../utils/validate';
import { ValidationError } from '../errors';
import {
  DOCUMENT_MAX_BYTES,
  getDocument,
  getDocumentChain,
  listDocuments,
  softDeleteDocument,
  uploadDocument,
  uploadVersion,
} from '../services/documents';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOCUMENT_MAX_BYTES },
});

const VIEW   = requirePermission('DOC_MGMT', 'doc_mgmt', 'view');
const CREATE = requirePermission('DOC_MGMT', 'doc_mgmt', 'create');
const EDIT   = requirePermission('DOC_MGMT', 'doc_mgmt', 'edit');
const DELETE = requirePermission('DOC_MGMT', 'doc_mgmt', 'delete');

const idParam = z.object({ id: z.string().uuid() });
const listQ = z.object({
  documentType: z.string().optional(),
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.string().optional(),
  includeDeleted: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
const uploadBody = z.object({
  documentType: z.string().min(1).max(50),
  relatedEntityType: z.string().min(1).max(100).optional(),
  relatedEntityId: z.string().min(1).max(100).optional(),
});

router.post(
  '/',
  requireInternal,
  CREATE,
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new ValidationError(
          'No file uploaded — expected multipart/form-data with field "file"',
        );
      }
      // Multer attaches multipart text fields to req.body as plain strings.
      // Validate them directly with the schema rather than going through
      // parseBody (which expects req.body to already be the parsed body).
      const parsed = uploadBody.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Form fields validation failed', parsed.error.issues);
      }
      const doc = await uploadDocument({
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname,
        documentType: parsed.data.documentType,
        relatedEntityType: parsed.data.relatedEntityType,
        relatedEntityId: parsed.data.relatedEntityId,
        uploadedById: req.user!.id,
      });
      sendSuccess(res, { ...doc, uploadedAt: doc.uploadedAt.toISOString() });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, listQ);
    const result = await listDocuments({
      documentType: q.documentType,
      relatedEntityType: q.relatedEntityType,
      relatedEntityId: q.relatedEntityId,
      includeDeleted: q.includeDeleted === 'true',
      page: q.page,
      limit: q.limit,
    });
    sendSuccess(res, {
      ...result,
      documents: result.documents.map((d) => ({
        ...d,
        uploadedAt: d.uploadedAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireInternal, VIEW, async (req, res, next) => {
  try {
    const d = await getDocument(parseParams(req, idParam).id);
    sendSuccess(res, { ...d, uploadedAt: d.uploadedAt.toISOString() });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/chain', requireInternal, VIEW, async (req, res, next) => {
  try {
    const chain = await getDocumentChain(parseParams(req, idParam).id);
    sendSuccess(res, {
      chain: chain.map((d) => ({ ...d, uploadedAt: d.uploadedAt.toISOString() })),
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/version',
  requireInternal,
  EDIT,
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new ValidationError(
          'No file uploaded — expected multipart/form-data with field "file"',
        );
      }
      const doc = await uploadVersion({
        parentDocumentId: parseParams(req, idParam).id,
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname,
        uploadedById: req.user!.id,
      });
      sendSuccess(res, { ...doc, uploadedAt: doc.uploadedAt.toISOString() });
    } catch (err) {
      next(err);
    }
  },
);

router.delete('/:id', requireInternal, DELETE, async (req, res, next) => {
  try {
    await softDeleteDocument({
      id: parseParams(req, idParam).id,
      actorUserId: req.user!.id,
    });
    sendSuccess(res, { ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
