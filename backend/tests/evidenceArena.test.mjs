import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createStructuredActorOutput,
  extractCitationIds,
  summarizeCitationIntegrity,
  validateEvidenceCitations,
} from '../services/ai/evidence.js';
import { createDocumentScopedRetriever } from '../services/ai/supabaseVectorStore.js';
import {
  createPollyService,
  validateTtsText,
} from '../services/tts/pollyService.js';
import { createAuthenticateMiddleware } from '../routes/apiRoutes.js';
import { hasPdfSignature } from '../controllers/documentCtrl.js';

test('evidence IDs are extracted and invalid citations are detected', () => {
  assert.deepEqual(extractCitationIds('Claim [E3], repeated [E3], and [E99].'), ['E3', 'E99']);
  assert.deepEqual(
    validateEvidenceCitations('Supported [E3], invented [E99].', [{ id: 'E3' }]),
    { citedEvidenceIds: ['E3'], invalidCitationIds: ['E99'] },
  );
});

test('structured actor output maps stable evidence IDs to retrieved chunks', () => {
  const output = createStructuredActorOutput('The source supports this [E7].', [{
    pageContent: 'A real retrieved source excerpt.',
    metadata: { chunkIndex: 6, similarity: 0.91 },
  }]);
  assert.equal(output.evidence[0].id, 'E7');
  assert.equal(output.evidence[0].excerpt, 'A real retrieved source excerpt.');
  assert.deepEqual(output.citedEvidenceIds, ['E7']);
  assert.deepEqual(output.invalidCitationIds, []);
});

test('citation integrity scores valid and invalid IDs deterministically', () => {
  const summary = summarizeCitationIntegrity([
    { speaker: 'Critic', text: 'One [E1].', citedEvidenceIds: ['E1'], invalidCitationIds: [] },
    { speaker: 'Defender', text: 'Two [E99].', citedEvidenceIds: [], invalidCitationIds: ['E99'] },
  ]);
  assert.equal(summary.evidenceUsage, 50);
  assert.equal(summary.citationFidelity, 50);
  assert.equal(summary.invalidCitationCount, 1);
});

test('Supabase retrieval is RPC-scoped and filters foreign-document rows defensively', async () => {
  const calls = [];
  const supabase = {
    rpc: async (name, payload) => {
      calls.push({ name, payload });
      return {
        data: [
          { id: 1, document_id: 'owned-doc', chunk_index: 0, content: 'Owned', similarity: 0.9 },
          { id: 2, document_id: 'foreign-doc', chunk_index: 1, content: 'Foreign', similarity: 0.99 },
        ],
        error: null,
      };
    },
  };
  const retriever = createDocumentScopedRetriever({
    supabase,
    documentId: 'owned-doc',
    embeddings: { embedQuery: async () => [1, 0] },
    documents: [],
    vectors: [],
    topK: 4,
  });
  const documents = await retriever.invoke('question');
  assert.equal(calls[0].name, 'match_evidence_chunks');
  assert.equal(calls[0].payload.p_document_id, 'owned-doc');
  assert.equal(documents.length, 1);
  assert.equal(documents[0].pageContent, 'Owned');
});

test('TTS rejects empty and oversized text', () => {
  assert.throws(() => validateTtsText('  '), /required/i);
  assert.throws(() => validateTtsText('x'.repeat(3001)), /cannot exceed/i);
});

test('TTS disabled behavior is explicit and does not initialize a paid request', async () => {
  const previousEnabled = process.env.TTS_ENABLED;
  const previousRegion = process.env.AWS_REGION;
  process.env.TTS_ENABLED = 'false';
  delete process.env.AWS_REGION;
  try {
    const service = createPollyService();
    assert.equal(service.capabilities.enabled, false);
    await assert.rejects(service.synthesize('Hello'), (error) => (
      error.code === 'TTS_DISABLED' && error.statusCode === 503
    ));
  } finally {
    if (previousEnabled === undefined) delete process.env.TTS_ENABLED; else process.env.TTS_ENABLED = previousEnabled;
    if (previousRegion === undefined) delete process.env.AWS_REGION; else process.env.AWS_REGION = previousRegion;
  }
});

test('Polly service accepts an injected client and returns MP3 bytes without a live AWS call', async () => {
  let commandInput;
  const service = createPollyService({ client: {
    send: async (command) => {
      commandInput = command.input;
      return { AudioStream: new Uint8Array([73, 68, 51]) };
    },
  } });
  const audio = await service.synthesize('Grounded response');
  assert.deepEqual([...audio], [73, 68, 51]);
  assert.equal(commandInput.OutputFormat, 'mp3');
  assert.equal(commandInput.Text, 'Grounded response');
});

test('AWS failures are converted to sanitized application errors', async () => {
  const previous = console.error;
  console.error = () => {};
  try {
    const service = createPollyService({ client: { send: async () => { throw new Error('secret provider detail'); } } });
    await assert.rejects(service.synthesize('Hello'), (error) => (
      error.code === 'TTS_SYNTHESIS_FAILED'
      && error.message === 'Voice synthesis is temporarily unavailable.'
      && !error.message.includes('secret provider detail')
    ));
  } finally {
    console.error = previous;
  }
});

test('unauthenticated TTS requests are rejected by the shared auth middleware', async () => {
  const authenticate = createAuthenticateMiddleware({ auth: { getUser: async () => { throw new Error('must not run'); } } });
  let statusCode;
  let payload;
  let nextCalled = false;
  await authenticate(
    { get: () => undefined },
    { status: (value) => { statusCode = value; return { json: (body) => { payload = body; } }; } },
    () => { nextCalled = true; },
  );
  assert.equal(statusCode, 401);
  assert.equal(payload.message, 'Authentication required');
  assert.equal(nextCalled, false);
});

test('invalid PDF bytes are rejected even when a filename or MIME type is spoofed', () => {
  assert.equal(hasPdfSignature(Buffer.from('not really a pdf')), false);
  assert.equal(hasPdfSignature(Buffer.from('%PDF-1.7\nvalid header')), true);
});

test('migration uses exact document-scoped 3072-dimensional search without an ANN index', async () => {
  const migration = await readFile(new URL('../migrations/007_evidence_arena.sql', import.meta.url), 'utf8');
  assert.match(migration, /vector\(3072\)/i);
  assert.match(migration, /where\s+ec\.document_id\s*=\s*p_document_id/i);
  assert.doesNotMatch(migration, /create\s+index[^;]+using\s+(hnsw|ivfflat)/i);
  assert.match(migration, /on delete cascade/i);
});
