import { Document } from 'langchain/document';

const cosineSimilarity = (left = [], right = []) => {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
};

const locallyRankDocuments = ({ documents, vectors, queryVector, topK }) => (
  documents
    .map((document, index) => ({ document, similarity: cosineSimilarity(vectors[index], queryVector) }))
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, topK)
    .map(({ document, similarity }) => new Document({
      pageContent: document.pageContent,
      metadata: { ...document.metadata, similarity },
    }))
);

export const createDocumentScopedRetriever = ({
  supabase,
  documentId,
  embeddings,
  documents,
  vectors,
  topK = 4,
  onDegraded = () => {},
}) => ({
  invoke: async (query) => {
    const queryVector = await embeddings.embedQuery(query);
    const { data, error } = await supabase.rpc('match_evidence_chunks', {
      p_document_id: documentId,
      p_query_embedding: queryVector,
      p_match_count: topK,
    });

    if (error) {
      onDegraded(error);
      return locallyRankDocuments({ documents, vectors, queryVector, topK });
    }

    // The SQL function is document-scoped. Filtering again here is a deliberate
    // defense-in-depth guard against a misconfigured or stale database function.
    return (data || [])
      .filter((row) => row.document_id === documentId)
      .slice(0, topK)
      .map((row) => new Document({
        pageContent: row.content,
        metadata: {
          chunkIndex: row.chunk_index,
          source: 'uploaded-document',
          evidenceId: `E${Number(row.chunk_index) + 1}`,
          similarity: Number(row.similarity),
          documentId,
        },
      }));
  },
});

export const persistSupabaseKnowledgeBase = async ({
  supabase,
  userId,
  filename,
  topic,
  documents,
  embeddings,
  batchSize,
  delay,
  topK,
}) => {
  const { data: evidenceDocument, error: documentError } = await supabase
    .from('evidence_documents')
    .insert({
      user_id: userId,
      filename,
      topic,
      chunk_count: documents.length,
    })
    .select('id')
    .single();

  if (documentError || !evidenceDocument?.id) {
    throw new Error('Evidence vector storage is unavailable or its migration has not been applied.');
  }

  const documentId = evidenceDocument.id;
  try {
    const vectors = [];
    for (let start = 0; start < documents.length; start += batchSize) {
      const batch = documents.slice(start, start + batchSize);
      const batchVectors = await embeddings.embedDocuments(batch.map((item) => item.pageContent));
      vectors.push(...batchVectors);
      if (start + batchSize < documents.length) await delay();
    }

    for (let start = 0; start < documents.length; start += 50) {
      const rows = documents.slice(start, start + 50).map((document, offset) => ({
        document_id: documentId,
        chunk_index: document.metadata.chunkIndex,
        content: document.pageContent,
        embedding: vectors[start + offset],
      }));
      const { error } = await supabase.from('evidence_chunks').insert(rows);
      if (error) throw new Error('Failed to persist evidence vectors.');
    }

    let degraded = false;
    const retriever = createDocumentScopedRetriever({
      supabase,
      documentId,
      embeddings,
      documents,
      vectors,
      topK,
      onDegraded: (error) => {
        if (!degraded) console.warn('[Evidence Arena] pgvector RPC unavailable; using in-process exact search:', error.message);
        degraded = true;
      },
    });

    return { retriever, documentId, vectorStore: null, vectorBackend: 'supabase' };
  } catch (error) {
    await supabase.from('evidence_documents').delete().eq('id', documentId).eq('user_id', userId);
    throw error;
  }
};

export const assertEvidenceDocumentOwnership = async (supabase, documentId, userId) => {
  const { data, error } = await supabase
    .from('evidence_documents')
    .select('id,user_id')
    .eq('id', documentId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error('Unable to verify evidence document ownership.');
  return Boolean(data?.id);
};
