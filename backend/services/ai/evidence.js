const CITATION_PATTERN = /\[E(\d+)\]/gi;

const unique = (values) => [...new Set(values)];

export const evidenceIdForChunk = (chunkIndex) => {
  const normalized = Number.parseInt(chunkIndex, 10);
  return `E${Number.isInteger(normalized) && normalized >= 0 ? normalized + 1 : 1}`;
};

const normalizeExcerpt = (value, maxLength = 700) => {
  const normalized = `${value || ''}`.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
};

export const normalizeRetrievedEvidence = (documents = []) => (
  (Array.isArray(documents) ? documents : []).map((document, fallbackIndex) => {
    const parsedIndex = Number.parseInt(document?.metadata?.chunkIndex, 10);
    const chunkIndex = Number.isInteger(parsedIndex) && parsedIndex >= 0
      ? parsedIndex
      : fallbackIndex;
    return {
      id: document?.metadata?.evidenceId || evidenceIdForChunk(chunkIndex),
      chunkIndex,
      excerpt: normalizeExcerpt(document?.pageContent),
      ...(Number.isFinite(Number(document?.metadata?.similarity))
        ? { similarity: Number(document.metadata.similarity) }
        : {}),
    };
  }).filter((item) => item.excerpt)
);

export const extractCitationIds = (text = '') => {
  const ids = [];
  for (const match of `${text}`.matchAll(CITATION_PATTERN)) ids.push(`E${Number(match[1])}`);
  return unique(ids);
};

export const validateEvidenceCitations = (text, evidence = []) => {
  const cited = extractCitationIds(text);
  const allowed = new Set((evidence || []).map((item) => item.id));
  return {
    citedEvidenceIds: cited.filter((id) => allowed.has(id)),
    invalidCitationIds: cited.filter((id) => !allowed.has(id)),
  };
};

export const formatEvidenceForPrompt = (evidence = []) => {
  if (!evidence.length) return 'No document evidence was retrieved for this turn.';
  return evidence
    .map((item) => `[${item.id}] (document chunk ${item.chunkIndex + 1})\n${item.excerpt}`)
    .join('\n\n');
};

export const createStructuredActorOutput = (text, documents = []) => {
  const normalizedText = typeof text === 'string' ? text.trim() : '';
  const evidence = normalizeRetrievedEvidence(documents);
  return {
    text: normalizedText,
    evidence,
    ...validateEvidenceCitations(normalizedText, evidence),
  };
};

export const normalizeActorOutput = (output) => {
  if (typeof output === 'string') {
    return { text: output.trim(), evidence: [], citedEvidenceIds: [], invalidCitationIds: [] };
  }
  if (!output || typeof output !== 'object') {
    return { text: '', evidence: [], citedEvidenceIds: [], invalidCitationIds: [] };
  }
  const text = typeof output.text === 'string' ? output.text.trim() : '';
  const evidence = Array.isArray(output.evidence) ? output.evidence : [];
  const validated = validateEvidenceCitations(text, evidence);
  return { text, evidence, ...validated };
};

export const summarizeCitationIntegrity = (transcript = []) => {
  const substantiveTurns = transcript.filter((turn) => turn?.speaker !== 'System' && turn?.text);
  const citedTurns = substantiveTurns.filter((turn) => (turn.citedEvidenceIds || []).length > 0);
  const validCount = substantiveTurns.reduce(
    (sum, turn) => sum + (turn.citedEvidenceIds || []).length,
    0,
  );
  const invalidCount = substantiveTurns.reduce(
    (sum, turn) => sum + (turn.invalidCitationIds || []).length,
    0,
  );
  const totalCitations = validCount + invalidCount;
  return {
    substantiveTurnCount: substantiveTurns.length,
    citedTurnCount: citedTurns.length,
    validCitationCount: validCount,
    invalidCitationCount: invalidCount,
    evidenceUsage: substantiveTurns.length
      ? Math.round((citedTurns.length / substantiveTurns.length) * 100)
      : 0,
    citationFidelity: totalCitations ? Math.round((validCount / totalCitations) * 100) : 0,
  };
};
