import { randomUUID } from 'node:crypto';
import { parseAndChunkPdf } from '../services/ai/rag.js';
import { createKnowledgeBase, createAgents } from '../services/ai/agents.js';
import { runDebate } from '../services/ai/debate.js';
import { evaluateGrounding } from '../services/ai/evidenceEvaluator.js';

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const hasPdfSignature = (buffer) => (
  Buffer.isBuffer(buffer) && buffer.subarray(0, 1024).indexOf(Buffer.from('%PDF-')) >= 0
);

const safeFilename = (value) => `${value || 'uploaded-document.pdf'}`.replace(/[\u0000-\u001f]/g, '').slice(0, 255);

export const createHandleDebateUpload = ({ supabase, commercial = null }) => async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Attach one PDF in the "document" field.' });
    }
    if (!hasPdfSignature(req.file.buffer)) {
      return res.status(415).json({ success: false, message: 'The uploaded file is not a valid PDF.' });
    }

    const topic = typeof req.body?.topic === 'string' ? req.body.topic.trim() : '';
    if (!topic || topic.length > 500) {
      return res.status(400).json({ success: false, message: 'Topic must contain between 1 and 500 characters.' });
    }

    const rounds = Number.parseInt(req.body?.totalRounds, 10);
    if (![1, 2, 3].includes(rounds)) {
      return res.status(400).json({ success: false, message: 'totalRounds must be 1, 2, or 3.' });
    }

    const socketId = typeof req.body?.socketId === 'string' ? req.body.socketId.trim() : '';
    if (!socketId) {
      return res.status(400).json({ success: false, message: 'A connected socketId is required.' });
    }

    const requestedSessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
    const sessionId = requestedSessionId || randomUUID();
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      return res.status(400).json({ success: false, message: 'sessionId must be a valid UUID.' });
    }

    const io = req.app.get('io');
    const targetSockets = await io.in(socketId).fetchSockets();
    const ownedSocket = targetSockets.some(
      (socket) => socket.id === socketId
        && (socket.data?.userId || socket.verifiedUserId) === req.user?.id,
    );
    if (!ownedSocket) {
      return res.status(403).json({ success: false, message: 'The stream must target your authenticated socket.' });
    }

    const sessions = req.app.get('evidenceDebateSessions');
    if (!(sessions instanceof Map)) {
      return res.status(503).json({ success: false, message: 'Evidence Arena is still initializing.' });
    }
    const hasActiveSocketSession = [...sessions.values()].some(
      (active) => active.socketId === socketId && active.userId === req.user.id,
    );
    if (hasActiveSocketSession || sessions.has(sessionId)) {
      return res.status(409).json({ success: false, message: 'An Evidence Arena session is already active.' });
    }

    let usageReservation = null;
    if (commercial) {
      try {
        usageReservation = await commercial.reserve({
          userId: req.user.id,
          feature: 'evidence_session',
          units: 1,
          entitlement: 'ai_sparring',
          requestKey: req.get('idempotency-key') || `evidence:${sessionId}`,
        });
        usageReservation.feature = 'evidence_session';
      } catch (error) {
        return res.status(error.statusCode || 503).json({ success: false, code: error.code, message: error.message });
      }
    }

    const session = { id: sessionId, userId: req.user.id, socketId, cancelled: false, startedAt: Date.now() };
    sessions.set(sessionId, session);
    res.status(202).json({ success: true, message: 'Cross-examination started.', sessionId });

    const emitStatus = (status, extra = {}) => io.to(socketId).emit('debate_status', {
      sessionId,
      status,
      ...extra,
    });
    const shouldCancel = () => session.cancelled;

    (async () => {
      let knowledgeBase = null;
      let completed = false;
      try {
        emitStatus('parsing', { rounds });
        const { chunks } = await parseAndChunkPdf(req.file.buffer);

        emitStatus('indexing', { chunkCount: chunks.length });
        let vaultCollectionId = null;
        let retainedUntil = null;
        if (req.body?.vaultCollectionId && commercial) {
          await commercial.requireEntitlement(req.user.id, 'evidence_vault');
          const { data: vault, error: vaultError } = await supabase
            .from('evidence_vault_collections')
            .select('id,retention_days')
            .eq('id', req.body.vaultCollectionId)
            .eq('user_id', req.user.id)
            .maybeSingle();
          if (vaultError || !vault) throw new Error('The selected Evidence Vault collection is unavailable.');
          vaultCollectionId = vault.id;
          retainedUntil = new Date(Date.now() + Number(vault.retention_days || 365) * 86400000).toISOString();
        }
        knowledgeBase = await createKnowledgeBase(chunks, {
          supabase,
          userId: req.user.id,
          filename: safeFilename(req.file.originalname),
          topic,
          vaultCollectionId,
          retainedUntil,
        });
        const { defender, critic } = await createAgents(knowledgeBase.retriever);

        emitStatus('retrieving', {
          vectorBackend: knowledgeBase.vectorBackend,
          documentId: knowledgeBase.documentId,
        });
        let hasStreamedTurn = false;
        const transcript = await runDebate(
          defender,
          critic,
          topic,
          rounds,
          (turn) => {
            if (!hasStreamedTurn) emitStatus('debating');
            hasStreamedTurn = true;
            io.to(socketId).emit('debate_turn', { sessionId, ...turn });
          },
          { shouldCancel },
        );

        if (shouldCancel()) throw new Error('CANCELLED_DEBATE: Session stopped before evaluation.');
        emitStatus('evaluating');
        const evaluation = await evaluateGrounding({ topic, transcript });
        emitStatus('completed');
        io.to(socketId).emit('debate_complete', {
          success: true,
          sessionId,
          message: 'Cross-examination completed.',
          evaluation,
          documentId: knowledgeBase.documentId,
          vectorBackend: knowledgeBase.vectorBackend,
        });
        completed = true;
      } catch (error) {
        const message = `${error?.message || ''}`;
        const isRateLimited = message.includes('RATE_LIMIT');
        const isCancelled = message.includes('CANCELLED_DEBATE');
        console.error('[Evidence Arena] Background processing failed:', error);
        if (knowledgeBase?.documentId) {
          const { error: cleanupError } = await supabase
            .from('evidence_documents')
            .delete()
            .eq('id', knowledgeBase.documentId)
            .eq('user_id', req.user.id);
          if (cleanupError) console.warn('[Evidence Arena] Failed-session cleanup was unavailable:', cleanupError.message);
        }
        if (isCancelled) {
          io.to(socketId).emit('debate_complete', {
            success: true,
            cancelled: true,
            sessionId,
            message: 'Cross-examination stopped.',
          });
        } else {
          io.to(socketId).emit('debate_error', {
            success: false,
            sessionId,
            message: isRateLimited
              ? 'AI is temporarily at capacity. Your document was not retained. Please try Evidence Arena again later.'
              : 'Evidence Arena could not complete this document. Please try again.',
          });
        }
      } finally {
        if (commercial && usageReservation) {
          try {
            if (completed) await commercial.settle({ userId: req.user.id, reservation: usageReservation, actualUnits: 1 });
            else await commercial.release({ userId: req.user.id, reservation: usageReservation });
          } catch (usageError) {
            console.warn('[Evidence Arena] Usage settlement failed:', usageError.message);
          }
        }
        sessions.delete(sessionId);
      }
    })();

    return undefined;
  } catch (error) {
    console.error('[Evidence Arena] Request setup failed:', error);
    if (res.headersSent) return undefined;
    return res.status(500).json({ success: false, message: 'Unable to start Evidence Arena.' });
  }
};
