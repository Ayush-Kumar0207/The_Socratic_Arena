import express from 'express';
import multer from 'multer';
import { handleDebateUpload } from '../controllers/documentCtrl.js';
import { createRateLimit } from '../lib/rateLimit.js';
import { freeSttConfig, getFreeSttStatus, transcribeAudioBuffer } from '../services/freeSttClient.js';

const memoryStorage = multer.memoryStorage();
const pdfLimit = Math.min(Number(process.env.MAX_PDF_UPLOAD_BYTES) || 10 * 1024 * 1024, 25 * 1024 * 1024);

const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: pdfLimit, files: 1, fields: 5 },
  fileFilter: (_req, file, callback) => {
    const accepted = file.mimetype === 'application/pdf' && /\.pdf$/i.test(file.originalname || '');
    callback(accepted ? null : Object.assign(new Error('Only PDF documents are accepted'), { statusCode: 415 }), accepted);
  },
});

const sttUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: freeSttConfig.maxAudioBytes, files: 1, fields: 3 },
  fileFilter: (_req, file, callback) => {
    const accepted = /^audio\//i.test(file.mimetype || '') || /\.(webm|wav|mp3|m4a|ogg)$/i.test(file.originalname || '');
    callback(accepted ? null : Object.assign(new Error('Only supported audio files are accepted'), { statusCode: 415 }), accepted);
  },
});

export default function createApiRoutes({ supabase }) {
  const router = express.Router();

  const authenticate = async (req, res, next) => {
    const token = req.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
    if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });
    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) return res.status(401).json({ success: false, message: 'Session expired' });
      req.user = data.user;
      req.accessToken = token;
      return next();
    } catch {
      return res.status(401).json({ success: false, message: 'Unable to verify session' });
    }
  };

  router.get('/stt/status', authenticate, createRateLimit({ name: 'stt-status', max: 30 }), async (_req, res) => {
    const status = await getFreeSttStatus();
    res.status(status.healthy ? 200 : 503).json(status);
  });

  router.post(
    '/debate',
    authenticate,
    createRateLimit({ name: 'pdf-debate-user', max: 3, windowMs: 10 * 60_000 }),
    createRateLimit({ name: 'pdf-debate-ip', max: 8, windowMs: 10 * 60_000, key: req => req.ip }),
    upload.single('document'),
    handleDebateUpload,
  );

  router.post(
    '/stt/transcribe',
    authenticate,
    createRateLimit({ name: 'stt-user', max: 60, windowMs: 10 * 60_000 }),
    createRateLimit({ name: 'stt-ip', max: 120, windowMs: 10 * 60_000, key: req => req.ip }),
    sttUpload.single('audio'),
    async (req, res) => {
      try {
        if (!req.file) return res.status(400).json({ success: false, message: 'Missing audio file' });
        const result = await transcribeAudioBuffer({
          buffer: req.file.buffer,
          mimeType: req.file.mimetype,
          filename: req.file.originalname,
          language: req.body?.language || 'en',
        });
        return res.json({ success: true, ...result });
      } catch (error) {
        return res.status(error.statusCode || 502).json({
          success: false,
          message: error.message || 'Free STT service unavailable',
          detail: error.payload,
        });
      }
    },
  );

  return router;
}
