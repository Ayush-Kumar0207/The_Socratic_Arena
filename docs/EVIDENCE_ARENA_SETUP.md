# Evidence Arena setup

Evidence Arena works immediately with `RAG_VECTOR_BACKEND=memory`. In that mode the PDF, chunks, and vectors live only for the running backend process/session.

## Enable persistent Supabase pgvector retrieval

1. Open the Supabase SQL editor for the same project used by the backend.
2. Apply [`backend/migrations/007_evidence_arena.sql`](../backend/migrations/007_evidence_arena.sql) after migrations 001–006.
3. Set `RAG_VECTOR_BACKEND=supabase` on the backend and redeploy it.
4. Keep `SUPABASE_SERVICE_KEY` on the backend only. Do not add it to Vercel or a `VITE_*` variable.
5. Run a one-round Evidence Arena session and confirm the UI reports `Supabase pgvector`.

The migration stores `vector(3072)` because [`gemini-embedding-001`](https://ai.google.dev/gemini-api/docs/models/gemini-embedding-001) emits 3072 dimensions by default. Retrieval follows Supabase's [pgvector column/RPC pattern](https://supabase.com/docs/guides/ai/vector-columns), using exact cosine distance filtered by `document_id`; it deliberately creates no HNSW/IVFFlat index because pgvector's regular [`vector` ANN indexes support up to 2,000 dimensions](https://github.com/pgvector/pgvector#hnsw). The backend also filters RPC results by document ID as defense in depth.

If the table/function is absent or persistence is unavailable, the backend logs the degradation and uses the existing in-memory vector store. Evidence Arena does not fail solely because the optional migration is missing.

## Data lifecycle

- Multer accepts one PDF into memory, checks its MIME type/name/size, and the controller verifies a PDF header.
- Raw PDF bytes are not written to disk, Supabase Storage, or S3.
- With the Supabase backend, extracted chunks, embeddings, filename, and topic persist until the user deletes the stored evidence from the completed-session UI/API.
- `DELETE /api/evidence/documents/:documentId` verifies ownership; the database foreign key cascade removes its chunks.
- Memory mode retains no document record after the process releases the session.

Evidence Arena sessions are private, unranked, and separate from the normal match/Elo tables.
