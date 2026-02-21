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
    const { topic, totalRounds } = req.body;

    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      res.status(400).json({
        success: false,
        message: 'A non-empty "topic" field is required.',
      });
      return;
    }

    // 3) Extract in-memory PDF buffer from multer.
    // We use memory storage so we can directly parse bytes without saving temporary files.
    const pdfBuffer = req.file.buffer;

    // 4) Parse and chunk document text for retrieval.
    const { chunks } = await parseAndChunkPdf(pdfBuffer);

    // 5) Build vector knowledge base and get a retriever.
    const { retriever } = await createKnowledgeBase(chunks);

    // 6) Build Critic + Defender agents connected to that retriever.
    const { defender, critic } = await createAgents(retriever);

    // 7) Run debate loop. We pass Defender first and Critic second
    // because runDebate signature is runDebate(defenderChain, criticChain, ...).
    const debateTranscript = await runDebate(
      defender,
      critic,
      topic.trim(),
      Number.parseInt(totalRounds, 10) || 3,
    );

    // 8) Return transcript to frontend for display/streaming history storage.
    res.status(200).json({
      success: true,
      message: 'Debate completed successfully.',
      transcript: debateTranscript,
    });
  } catch (error) {
    // Robust server-side logging for debugging and observability.
    console.error('[documentCtrl:handleDebateUpload] Failed to process debate request:', error);

    // Return safe, clear error response to client.
    res.status(500).json({
      success: false,
      message: 'Failed to process debate request. Please try again later.',
      error: error.message,
    });
  }
};