/**
 * documentCtrl.js
 * -----------------------------------------------------------------------------
 * This controller is the "bridge" between an incoming HTTP request and our
 * AI service pipeline.
 *
 * End-to-end flow in one request:
 * 1) Receive uploaded PDF + debate topic from the client.
 * 2) Parse and chunk the PDF content for RAG preparation.
 * 3) Build a retriever-backed knowledge base from chunks.
 * 4) Create Defender and Critic AI agents using that retriever.
 * 5) Run the turn-based debate loop.
 * 6) Return the full debate transcript to the frontend.
 * -----------------------------------------------------------------------------
 */

// Import RAG preprocessing helper (PDF -> raw text -> chunks).
import { parseAndChunkPdf } from '../services/ai/rag.js';

// Import knowledge base + agent initialization helpers.
import { createKnowledgeBase, createAgents } from '../services/ai/agents.js';

// Import debate orchestration loop.
import { runDebate } from '../services/ai/debate.js';

/**
 * handleDebateUpload
 * ---------------------------------------------------------------------------
 * Handles POST /api/debate requests.
 *
 * Expected multipart/form-data fields:
 * - document: uploaded PDF file (via multer memory storage)
 * - topic: debate topic/question entered by the user
 * - totalRounds (optional): number of debate rounds to run
 *
 * Why this controller exists:
 * - Routes should stay thin and only map endpoints to controllers.
 * - Controllers coordinate business logic across multiple services.
 * - This keeps architecture modular and easier to test/maintain.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export const handleDebateUpload = async (req, res) => {
  try {
    // 1) Validate file upload presence early.
    // `req.file` is provided by multer middleware when upload.single('document') is used.
    if (!req.file) {
      res.status(400).json({
        success: false,
        message: 'No document uploaded. Please attach a PDF file in the "document" field.',
      });
      return;
    }

    // 2) Validate topic because debate needs a guiding question/context.
    const { topic, totalRounds, socketId } = req.body;

    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      res.status(400).json({
        success: false,
        message: 'A non-empty "topic" field is required.',
      });
      return;
    }

    if (!socketId || typeof socketId !== 'string' || !socketId.trim()) {
      res.status(400).json({
        success: false,
        message: 'A valid "socketId" field is required for real-time debate streaming.',
      });
      return;
    }

    // Return immediately so HTTP request does not time out.
    res.status(202).json({
      success: true,
      message: 'Debate started',
    });

    // 3) Extract in-memory PDF buffer from multer.
    // We use memory storage so we can directly parse bytes without saving temporary files.
    const pdfBuffer = req.file.buffer;
    const io = req.app.get('io');
    const cancelledDebates = req.app.get('cancelledDebates');
    const room = socketId.trim();
    const rounds = Number.parseInt(totalRounds, 10) || 3;
    cancelledDebates?.delete(room);

    // Continue heavy debate work in background and stream each turn via socket.
    (async () => {
      try {
        io.to(room).emit('debate_status', { status: 'started', rounds });

        // 4) Parse and chunk document text for retrieval.
        const { chunks } = await parseAndChunkPdf(pdfBuffer);

        // 5) Build vector knowledge base and get a retriever.
        const { retriever } = await createKnowledgeBase(chunks);

        // 6) Build Critic + Defender agents connected to that retriever.
        const { defender, critic } = await createAgents(retriever);

        // 7) Stream each turn as it is generated.
        await runDebate(
          defender,
          critic,
          topic.trim(),
          rounds,
          (message) => {
            io.to(room).emit('debate_turn', message);
          },
          {
            shouldCancel: () => cancelledDebates?.has(room),
          },
        );

        io.to(room).emit('debate_complete', {
          success: true,
          message: 'Debate completed successfully.',
        });
      } catch (backgroundError) {
        const isRateLimited = `${backgroundError?.message || ''}`.includes('RATE_LIMIT');
        const isCancelled = `${backgroundError?.message || ''}`.includes('CANCELLED_DEBATE');
        console.error(
          '[documentCtrl:handleDebateUpload] Background debate processing failed:',
          backgroundError,
        );

        if (isCancelled) {
          io.to(room).emit('debate_complete', {
            success: true,
            cancelled: true,
            message: 'Debate stopped by user.',
          });
        } else {
          io.to(room).emit('debate_error', {
            success: false,
            message: isRateLimited
              ? 'Google API rate limit reached (429). Please wait about 60 seconds, then try again.'
              : 'Failed to process debate request. Please try again later.',
            error: backgroundError.message,
          });
        }
      } finally {
        cancelledDebates?.delete(room);
      }
    })();
  } catch (error) {
    // Robust server-side logging for debugging and observability.
    console.error('[documentCtrl:handleDebateUpload] Failed to process debate request:', error);

    // If headers are already sent, just stop after logging.
    if (res.headersSent) {
      return;
    }

    // Return safe, clear error response to client.
    res.status(500).json({
      success: false,
      message: 'Failed to process debate request. Please try again later.',
      error: error.message,
    });
  }
};
