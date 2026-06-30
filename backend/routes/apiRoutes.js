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
import { freeSttConfig, getFreeSttStatus, transcribeAudioBuffer } from '../services/freeSttClient.js';

// Create isolated router so server.js can mount all API routes under /api.
const router = express.Router();

/**
 * Multer in-memory storage configuration.
 *
 * Why memoryStorage here?
 * - We immediately parse PDF bytes in backend/services/ai/rag.js.
 * - No temporary file write is needed for this initial architecture step.
 */
const memoryStorage = multer.memoryStorage();

const upload = multer({ storage: memoryStorage });
const sttUpload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: freeSttConfig.maxAudioBytes,
  },
});

/**
 * POST /debate
 *
 * Middleware order:
 * 1) upload.single('document') parses multipart/form-data and exposes req.file.
 * 2) handleDebateUpload controller executes AI pipeline and returns transcript.
 */
router.post('/debate', upload.single('document'), handleDebateUpload);
/**
 * GET /stt/status
 *
 * Reports whether the optional free, self-hosted STT service is reachable.
 * The frontend uses this to prefer zero-cost local inference and fall back to
 * browser speech recognition when the service is not running.
 */
router.get('/stt/status', async (req, res) => {
  const status = await getFreeSttStatus();
  res.status(status.healthy ? 200 : 503).json(status);
});

/**
 * POST /stt/transcribe
 *
 * Proxies one short audio chunk to the free faster-whisper service. This keeps
 * the frontend independent of where the STT service is hosted: localhost during
 * development, or beside the backend on a self-owned machine.
 */
router.post('/stt/transcribe', sttUpload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Missing audio file' });
    }

    const result = await transcribeAudioBuffer({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      filename: req.file.originalname,
      language: req.body?.language || 'en',
    });

    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.statusCode || 502;
    res.status(status).json({
      success: false,
      message: err.message || 'Free STT service unavailable',
      detail: err.payload,
    });
  }
});

export default router;