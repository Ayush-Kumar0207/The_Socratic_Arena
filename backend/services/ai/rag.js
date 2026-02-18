/**
 * rag.js
 * -----------------------------------------------------------------------------
 * This module contains the foundational Retrieval-Augmented Generation (RAG)
 * preprocessing utilities for The Socratic Arena backend.
 *
 * Why this file matters:
 * 1) Raw PDFs are not directly useful to an LLM pipeline.
 * 2) We first extract plain text from the PDF.
 * 3) Then we split that text into smaller, overlapping chunks so later retrieval
 *    is accurate and token-safe.
 * -----------------------------------------------------------------------------
 */

// `pdf-parse` reads a PDF binary buffer and returns extracted text.
import pdfParse from 'pdf-parse';

// Node's promises-based fs API lets us read a PDF from disk when a path is given.
import { readFile } from 'node:fs/promises';

// RecursiveCharacterTextSplitter is a LangChain utility that breaks long text into
// smaller segments while preserving semantic continuity as much as possible.
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

/**
 * parsePdfToText
 * ---------------------------------------------------------------------------
 * Converts PDF content into plain text.
 *
 * Supported input:
 * - A Buffer (already loaded file bytes, common with upload middleware).
 * - A string file path (when file is stored on disk first).
 *
 * Why we support both:
 * - Different upload workflows exist in Express apps (memory storage vs disk storage).
 * - Supporting both gives the controller flexibility without rewriting logic.
 *
 * @param {Buffer|string} input - PDF buffer or absolute/relative file path.
 * @returns {Promise<string>} - Extracted raw text from the PDF.
 * @throws {Error} - Throws a clear error if parsing fails or text is empty.
 */
export const parsePdfToText = async (input) => {
  try {
    // Validate that we actually received something parseable.
    if (!input) {
      throw new Error('No PDF input was provided. Please pass a Buffer or a file path.');
    }

    /**
     * Determine how to obtain the PDF binary data.
     * - If input is already a Buffer, use it directly.
     * - If input is a string, treat it as a file path and read bytes from disk.
     */
    let pdfBuffer;

    if (Buffer.isBuffer(input)) {
      pdfBuffer = input;
    } else if (typeof input === 'string') {
      pdfBuffer = await readFile(input);
    } else {
      throw new Error('Invalid PDF input type. Expected a Buffer or a file path string.');
    }

    // Run the PDF parsing step with pdf-parse.
    const parsedResult = await pdfParse(pdfBuffer);

    // Extract and normalize text output.
    const rawText = parsedResult?.text?.trim();

    // Guard against empty or unreadable documents.
    if (!rawText) {
      throw new Error('PDF was parsed but no readable text was found.');
    }

    return rawText;
  } catch (error) {
    // Re-throw with context so controller logs are more informative.
    throw new Error(`Failed to parse PDF into text: ${error.message}`);
  }
};

/**
 * chunkTextForRag
 * ---------------------------------------------------------------------------
 * Splits large document text into smaller overlapping chunks.
 *
 * Why chunking is required:
 * - LLMs have context window limits, so giant documents cannot be sent at once.
 * - Chunking enables retrieval systems to fetch only the most relevant pieces.
 * - Overlap helps preserve meaning across boundaries (important for arguments,
 *   citations, and nuanced claims that might span adjacent chunk edges).
 *
 * Default strategy:
 * - chunkSize: 1000 characters
 * - chunkOverlap: 200 characters
 *
 * @param {string} rawText - Document text produced by parsePdfToText.
 * @param {object} [options] - Optional splitter tuning values.
 * @param {number} [options.chunkSize=1000] - Target max characters per chunk.
 * @param {number} [options.chunkOverlap=200] - Shared characters between chunks.
 * @returns {Promise<string[]>} - Array of chunked strings.
 * @throws {Error} - Throws clear errors for invalid input or split failures.
 */
export const chunkTextForRag = async (
  rawText,
  { chunkSize = 1000, chunkOverlap = 200 } = {},
) => {
  try {
    // Validate text input before splitting.
    if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
      throw new Error('Cannot chunk empty text. Provide non-empty raw document text.');
    }

    // Protect against invalid splitter settings.
    if (chunkSize <= 0 || chunkOverlap < 0 || chunkOverlap >= chunkSize) {
      throw new Error(
        'Invalid chunk settings. Ensure chunkSize > 0 and 0 <= chunkOverlap < chunkSize.',
      );
    }

    // Configure LangChain recursive splitter.
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
    });

    // Create chunks. LangChain returns an array of strings for this API.
    const chunks = await splitter.splitText(rawText);

    // Ensure we produced something useful.
    if (!Array.isArray(chunks) || chunks.length === 0) {
      throw new Error('Text splitting produced no chunks.');
    }

    return chunks;
  } catch (error) {
    // Re-throw with contextual message.
    throw new Error(`Failed to split text into RAG chunks: ${error.message}`);
  }
};

/**
 * parseAndChunkPdf
 * ---------------------------------------------------------------------------
 * Convenience helper that combines the two steps:
 * 1) Parse PDF to text.
 * 2) Chunk parsed text for RAG.
 *
 * This reduces repeated code in controllers/services that need both outputs.
 *
 * @param {Buffer|string} input - PDF buffer or PDF file path.
 * @param {object} [chunkOptions] - Optional chunking settings.
 * @returns {Promise<{ rawText: string, chunks: string[] }>} - Parsed text + chunks.
 * @throws {Error} - Throws descriptive processing errors.
 */
export const parseAndChunkPdf = async (input, chunkOptions = {}) => {
  try {
    const rawText = await parsePdfToText(input);
    const chunks = await chunkTextForRag(rawText, chunkOptions);

    return { rawText, chunks };
  } catch (error) {
    throw new Error(`Failed during PDF RAG preprocessing: ${error.message}`);
  }
};
