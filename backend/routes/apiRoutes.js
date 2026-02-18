/**
 * apiRoutes.js
 * -----------------------------------------------------------------------------
 * This module defines API endpoints for backend features.
 *
 * For Step 5, we add:
 * - POST /debate : accepts a PDF + topic, then triggers the AI debate pipeline.
 * -----------------------------------------------------------------------------
 */

import express from 'express';
import multer from 'multer';
import { handleDebateUpload } from '../controllers/documentCtrl.js';

// Create isolated router so server.js can mount all API routes under /api.
const router = express.Router();

/**
 * Multer in-memory storage configuration.
 *
 * Why memoryStorage here?
 * - We immediately parse PDF bytes in backend/services/ai/rag.js.
 * - No temporary file write is needed for this initial architecture step.
 */
const upload = multer({
  storage: multer.memoryStorage(),
});

/**
 * POST /debate
 *
 * Middleware order:
 * 1) upload.single('document') parses multipart/form-data and exposes req.file.
 * 2) handleDebateUpload controller executes AI pipeline and returns transcript.
 */
router.post('/debate', upload.single('document'), handleDebateUpload);

export default router;
