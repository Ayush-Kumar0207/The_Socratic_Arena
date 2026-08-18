import express from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { createHandleDebateUpload } from '../controllers/documentCtrl.js';
import { createDailyAllowance, createRateLimit } from '../lib/rateLimit.js';
import { launchAiLimits, launchAllowanceMessages } from '../lib/launchLimits.js';
import { recordAiAllowance } from '../lib/observability.js';
import { freeSttConfig, getFreeSttStatus, transcribeAudioBuffer } from '../services/freeSttClient.js';
import { assertEvidenceDocumentOwnership } from '../services/ai/supabaseVectorStore.js';
import { createPollyService, validateTtsText } from '../services/tts/pollyService.js';
import { commercialModeEnabled } from '../lib/commercialConfig.js';
import { createCommercialService } from '../lib/commercialService.js';

const memoryStorage = multer.memoryStorage();
const pdfLimit = Math.min(Number(process.env.MAX_PDF_UPLOAD_BYTES) || 10 * 1024 * 1024, 25 * 1024 * 1024);

const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: pdfLimit, files: 1, fields: 6 },
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

export const createAuthenticateMiddleware = (supabase) => async (req, res, next) => {
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

export default function createApiRoutes({ supabase, ttsService = createPollyService() }) {
  const router = express.Router();
  const authenticate = createAuthenticateMiddleware(supabase);
  const commercial = createCommercialService({ supabase });
  const handleDebateUpload = createHandleDebateUpload({ supabase, commercial });
  const userAllowance = ({ name, max, message, skip }) => createDailyAllowance({
    name,
    max,
    message,
    code: 'DAILY_AI_ALLOWANCE_REACHED',
    skip,
    onDecision: recordAiAllowance,
  });
  const globalAllowance = ({ name, max, message, skip }) => createDailyAllowance({
    name,
    max,
    message,
    code: 'AI_CAPACITY_REACHED',
    scope: 'global',
    key: () => 'all-users',
    skip,
    onDecision: recordAiAllowance,
  });

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
    userAllowance({
      name: 'evidence-arena-user',
      max: launchAiLimits.evidencePerUser,
      message: launchAllowanceMessages.evidence,
      skip: () => commercialModeEnabled() || !process.env.GOOGLE_API_KEY,
    }),
    globalAllowance({
      name: 'evidence-arena-global',
      max: launchAiLimits.evidenceGlobal,
      message: launchAllowanceMessages.globalEvidence,
      skip: () => !process.env.GOOGLE_API_KEY,
    }),
    handleDebateUpload,
  );

  router.post(
    '/debate/cancel',
    authenticate,
    createRateLimit({ name: 'pdf-debate-cancel', max: 10, windowMs: 10 * 60_000 }),
    (req, res) => {
      const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
      const socketId = typeof req.body?.socketId === 'string' ? req.body.socketId.trim() : '';
      if (!sessionId || !socketId) {
        return res.status(400).json({ success: false, message: 'sessionId and socketId are required.' });
      }
      const session = req.app.get('evidenceDebateSessions')?.get(sessionId);
      if (!session) return res.status(404).json({ success: false, message: 'The session is no longer active.' });
      if (session.userId !== req.user.id || session.socketId !== socketId) {
        return res.status(403).json({ success: false, message: 'You do not own this Evidence Arena session.' });
      }
      session.cancelled = true;
      return res.json({ success: true, message: 'Stop requested.' });
    },
  );

  router.delete(
    '/evidence/documents/:documentId',
    authenticate,
    createRateLimit({ name: 'evidence-delete', max: 20, windowMs: 10 * 60_000 }),
    async (req, res) => {
      try {
        const owned = await assertEvidenceDocumentOwnership(supabase, req.params.documentId, req.user.id);
        if (!owned) return res.status(404).json({ success: false, message: 'Evidence document not found.' });
        const { error } = await supabase
          .from('evidence_documents')
          .delete()
          .eq('id', req.params.documentId)
          .eq('user_id', req.user.id);
        if (error) throw error;
        return res.json({ success: true, message: 'Evidence document deleted.' });
      } catch (error) {
        console.error('[Evidence Arena] Document cleanup failed:', error.message);
        return res.status(503).json({ success: false, message: 'Evidence storage is unavailable.' });
      }
    },
  );

  router.get(
    '/tts/capabilities',
    authenticate,
    createRateLimit({ name: 'tts-capabilities', max: 30 }),
    (_req, res) => res.json({ success: true, tts: ttsService.capabilities }),
  );

  router.post(
    '/tts/synthesize',
    authenticate,
    createRateLimit({ name: 'tts-user', max: 20, windowMs: 10 * 60_000 }),
    createRateLimit({ name: 'tts-ip', max: 50, windowMs: 10 * 60_000, key: req => req.ip }),
    userAllowance({
      name: 'tts-user-daily',
      max: launchAiLimits.ttsPerUser,
      message: launchAllowanceMessages.tts,
      skip: () => commercialModeEnabled() || !ttsService.capabilities.enabled,
    }),
    globalAllowance({
      name: 'tts-global-daily',
      max: launchAiLimits.ttsGlobal,
      message: launchAllowanceMessages.globalTts,
      skip: () => !ttsService.capabilities.enabled,
    }),
    async (req, res) => {
      try {
        const text = validateTtsText(req.body?.text);
        const metered = await commercial.runMetered({
          userId: req.user.id,
          feature: 'tts_character',
          units: text.length,
          entitlement: 'ai_sparring',
          requestKey: req.get('idempotency-key') || `tts:${crypto.randomUUID()}`,
          action: () => ttsService.synthesize(text),
        });
        const audio = metered.result;
        res.set({
          'Content-Type': 'audio/mpeg',
          'Content-Length': String(audio.length),
          'Cache-Control': 'private, no-store',
        });
        return res.status(200).send(audio);
      } catch (error) {
        const clientSafeMessage = error.statusCode < 500 || error.code === 'TTS_DISABLED'
          ? error.message
          : 'Voice synthesis is temporarily unavailable.';
        return res.status(error.statusCode || 502).json({
          success: false,
          message: clientSafeMessage || 'Voice synthesis is unavailable.',
          code: error.code || 'TTS_ERROR',
        });
      }
    },
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
