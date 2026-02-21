/**
 * agents.js
 * -----------------------------------------------------------------------------
 * This module creates the AI knowledge layer and persona-driven agents used in
 * The Socratic Arena debate system.
 *
 * Core responsibilities:
 * 1) Turn text chunks into embeddings and store them in a vector database.
 * 2) Expose a retriever so agents can pull relevant evidence from the document.
 * 3) Build two specialized personas:
 *    - Defender: supports and strengthens the document's arguments.
 *    - Critic: challenges weaknesses and missing details in the document.
 * -----------------------------------------------------------------------------
 */

// Google Gemini embedding + chat clients used by LangChain.
// NOTE: Requires GOOGLE_API_KEY in environment variables.
import {
  GoogleGenerativeAIEmbeddings,
  ChatGoogleGenerativeAI,
} from '@langchain/google-genai';

// MemoryVectorStore keeps vectors in-memory for fast prototyping and local runs.
import { MemoryVectorStore } from 'langchain/vectorstores/memory';

// Document class provides a consistent shape for retrievable chunks.
import { Document } from 'langchain/document';

// Prompt builder for structured system + user context prompts.
import { ChatPromptTemplate } from '@langchain/core/prompts';

// Output parser converts model messages into plain string output.
import { StringOutputParser } from '@langchain/core/output_parsers';

/**
 * Rate-limit helpers
 * ---------------------------------------------------------------------------
 * Google free tier is strict (20 RPM). We keep outbound calls paced and disable
 * retries so failed requests do not create hidden retry storms.
 */
const EMBEDDING_BATCH_SIZE = 2;
const EMBEDDING_BATCH_DELAY_MS = 4000;

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRateLimitError = (error) => {
  const message = `${error?.message || ''}`.toLowerCase();
  const status = error?.status ?? error?.statusCode ?? error?.response?.status;
  return status === 429 || message.includes('429') || message.includes('too many requests');
};

/**
 * createKnowledgeBase
 * ---------------------------------------------------------------------------
 * Builds an in-memory vector knowledge base from chunked text.
 *
 * What embeddings are (beginner explanation):
 * - Embeddings are numeric vectors that represent the semantic meaning of text.
 * - Similar meaning => vectors are closer together in vector space.
 * - This lets us ask, "Which chunks are most relevant to this question?"
 *
 * Why this is needed for RAG:
 * - Instead of sending the entire document to the model every turn,
 *   we retrieve only the most relevant chunks.
 * - This improves focus, reduces token usage, and scales better.
 *
 * @param {string[]} chunks - Text chunks from rag.js.
 * @returns {Promise<{ retriever: import('@langchain/core/retrievers').BaseRetrieverInterface, vectorStore: MemoryVectorStore }>} retriever + store.
 * @throws {Error} If embeddings or vector store initialization fails.
 */
export const createKnowledgeBase = async (chunks) => {
  try {
    // Validate input chunks early.
    if (!Array.isArray(chunks) || chunks.length === 0) {
      throw new Error('Knowledge base initialization requires a non-empty chunks array.');
    }

    // Filter out empty chunks to avoid wasting embedding calls and noisy retrieval.
    const sanitizedChunks = chunks
      .map((chunk) => (typeof chunk === 'string' ? chunk.trim() : ''))
      .filter(Boolean);

    if (sanitizedChunks.length === 0) {
      throw new Error('All provided chunks were empty after sanitization.');
    }

    // Convert each string chunk into a LangChain Document.
    // Metadata includes chunk index for easier debugging/citation in later steps.
    const documents = sanitizedChunks.map(
      (chunk, index) =>
        new Document({
          pageContent: chunk,
          metadata: {
            chunkIndex: index,
            source: 'uploaded-document',
          },
        }),
    );

    // Create Gemini embeddings client. The model transforms text -> vectors.
    const embeddings = new GoogleGenerativeAIEmbeddings({
      model: 'gemini-embedding-001',
      apiKey: process.env.GOOGLE_API_KEY,
      maxRetries: 0,
    });

    // Build vector store incrementally in small batches with strict pacing.
    const vectorStore = new MemoryVectorStore(embeddings);

    for (let startIndex = 0; startIndex < documents.length; startIndex += EMBEDDING_BATCH_SIZE) {
      const batch = documents.slice(startIndex, startIndex + EMBEDDING_BATCH_SIZE);
      await vectorStore.addDocuments(batch);

      // Force a gap between batches to avoid embedding burst traffic.
      if (startIndex + EMBEDDING_BATCH_SIZE < documents.length) {
        await delay(EMBEDDING_BATCH_DELAY_MS);
      }
    }

    // Expose retriever abstraction for downstream agent calls.
    const retriever = vectorStore.asRetriever({
      k: Number(process.env.RETRIEVER_TOP_K) || 4,
    });

    return { retriever, vectorStore };
  } catch (error) {
    if (isRateLimitError(error)) {
      throw new Error('RATE_LIMIT_EMBEDDINGS: Google embedding RPM limit reached while indexing.');
    }

    throw new Error(`Failed to create vector knowledge base: ${error.message}`);
  }
};

/**
 * Helper: formatRetrievedEvidence
 * ---------------------------------------------------------------------------
 * Converts retrieved documents into a readable evidence block for prompts.
 *
 * @param {Document[]} documents - Retrieved document chunks.
 * @returns {string} Human-readable evidence text for model context.
 */
const formatRetrievedEvidence = (documents) => {
  if (!Array.isArray(documents) || documents.length === 0) {
    return 'No document evidence retrieved for this turn.';
  }

  return documents
    .map((doc, idx) => {
      const chunkLabel = doc?.metadata?.chunkIndex ?? idx;
      return `Evidence ${idx + 1} (chunk ${chunkLabel}):\n${doc.pageContent}`;
    })
    .join('\n\n');
};

/**
 * Helper: createPersonaChain
 * ---------------------------------------------------------------------------
 * Creates a runnable persona chain (model + prompt + parser).
 *
 * Why persona-specific prompts:
 * - Multi-agent systems work best when each agent has a clear role.
 * - Defender and Critic must behave differently to generate a useful debate.
 * - Strong role prompts reduce bland, generic responses.
 *
 * @param {ChatGoogleGenerativeAI} model - Shared chat model instance.
 * @param {string} systemPrompt - Persona instructions.
 * @returns {{ invoke: (input: {topic: string, evidence: string, priorContext?: string}) => Promise<string> }}
 */
const createPersonaChain = (model, systemPrompt) => {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', systemPrompt],
    [
      'human',
      [
        'Debate Topic/Question:',
        '{topic}',
        '',
        'Conversation Context (if any):',
        '{priorContext}',
        '',
        'Retrieved Evidence from the document:',
        '{evidence}',
        '',
        'Instructions:',
        '- Build your argument using only supported claims from retrieved evidence.',
        '- Quote or closely reference exact facts whenever possible.',
        '- Keep tone professional and analytical.',
      ].join('\n'),
    ],
  ]);

  // Compose: prompt -> model -> plain string.
  const chain = prompt.pipe(model).pipe(new StringOutputParser());

  return {
    invoke: async ({ topic, evidence, priorContext = 'No previous turns yet.' }) => {
      return chain.invoke({ topic, evidence, priorContext });
    },
  };
};

/**
 * createAgents
 * ---------------------------------------------------------------------------
 * Creates two role-specialized agents that can retrieve evidence and respond.
 *
 * Output contract:
 * - defender.respond({ topic, priorContext? }) => string
 * - critic.respond({ topic, priorContext? }) => string
 *
 * Each response step does:
 * 1) Retrieve relevant chunks from the vector store.
 * 2) Inject those chunks into the persona prompt.
 * 3) Generate a role-specific argument.
 *
 * @param {import('@langchain/core/retrievers').BaseRetrieverInterface} retriever - Retriever from createKnowledgeBase.
 * @returns {Promise<{
 *   defender: { respond: (input: {topic: string, priorContext?: string}) => Promise<string> },
 *   critic: { respond: (input: {topic: string, priorContext?: string}) => Promise<string> }
 * }>}
 * @throws {Error} If chat model or persona setup fails.
 */
export const createAgents = async (retriever) => {
  try {
    // Validate retriever interface shape to prevent runtime surprises.
    if (!retriever || typeof retriever.invoke !== 'function') {
      throw new Error('A valid retriever with an invoke function is required to create agents.');
    }

    // Shared Gemini chat model configuration for both personas.
    const chatModel = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      temperature: 0.5,
      apiKey: process.env.GOOGLE_API_KEY,
      maxRetries: 0,
    });

    // Defender persona: support and fortify document claims with evidence.
    const defenderSystemPrompt = [
      'You are "The Defender" in a formal AI debate.',
      'Your job is to rigorously defend the document and highlight its strengths.',
      'Use retrieved evidence to justify claims with explicit facts, details, and logical support.',
      'Do not invent citations. If evidence is weak, acknowledge uncertainty and still construct the strongest fair defense.',
    ].join(' ');

    // Critic persona: challenge assumptions, logic gaps, ethics, and omissions.
    const criticSystemPrompt = [
      'You are "The Critic" in a formal AI debate.',
      'Your job is to aggressively but professionally challenge the document.',
      'Identify logical flaws, ethical concerns, unsupported assumptions, and missing details.',
      'Base critiques on retrieved evidence and clearly explain why each issue matters.',
      'Do not fabricate facts. If evidence is limited, state that limitation while still pressing the strongest critique.',
    ].join(' ');

    // Build runnable persona chains.
    const defenderChain = createPersonaChain(chatModel, defenderSystemPrompt);
    const criticChain = createPersonaChain(chatModel, criticSystemPrompt);

    // Create standard response wrapper to avoid duplicated retrieval logic.
    const buildResponder = (personaChain) => ({
      respond: async ({ topic, priorContext = 'No previous turns yet.' }) => {
        try {
          if (!topic || typeof topic !== 'string' || !topic.trim()) {
            throw new Error('A non-empty debate topic is required for agent response.');
          }

          // Retrieve relevant evidence snippets for the requested topic.
          const retrievedDocs = await retriever.invoke(topic);
          const evidence = formatRetrievedEvidence(retrievedDocs);

          // Generate persona-specific response.
          const response = await personaChain.invoke({
            topic: topic.trim(),
            priorContext,
            evidence,
          });

          if (!response || typeof response !== 'string') {
            throw new Error('Model returned an invalid response payload.');
          }

          return response.trim();
        } catch (error) {
          if (isRateLimitError(error)) {
            throw new Error('RATE_LIMIT_CHAT: Google chat RPM limit reached during debate turn.');
          }

          throw new Error(`Failed to generate persona response: ${error.message}`);
        }
      },
    });

    return {
      defender: buildResponder(defenderChain),
      critic: buildResponder(criticChain),
    };
  } catch (error) {
    throw new Error(`Failed to initialize AI agents: ${error.message}`);
  }
};
