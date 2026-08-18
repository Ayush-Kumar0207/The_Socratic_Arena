import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { summarizeCitationIntegrity } from './evidence.js';

const clampScore = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : fallback;
};

const parseJsonObject = (value) => {
  const normalized = `${value || ''}`.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = normalized.indexOf('{');
  const end = normalized.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Evaluator did not return a JSON object.');
  return JSON.parse(normalized.slice(start, end + 1));
};

const buildEvaluationPayload = (topic, transcript) => ({
  topic,
  turns: transcript
    .filter((turn) => turn.speaker !== 'System')
    .map((turn) => ({
      speaker: turn.speaker,
      round: turn.round,
      text: turn.text,
      validCitations: turn.citedEvidenceIds || [],
      invalidCitations: turn.invalidCitationIds || [],
      retrievedEvidence: (turn.evidence || []).map((item) => ({
        id: item.id,
        excerpt: item.excerpt.slice(0, 500),
      })),
    })),
});

const deterministicFallback = (integrity) => {
  const groundedness = Math.round((integrity.evidenceUsage + integrity.citationFidelity) / 2);
  return {
    groundedness,
    argumentQuality: groundedness,
    unsupportedClaimRisk: 100 - groundedness,
    summary: 'Automated semantic evaluation was unavailable; citation integrity was scored deterministically.',
    strongestGroundedPoint: 'See the turns with valid evidence citations.',
    weakestSupportedPoint: integrity.invalidCitationCount
      ? 'At least one citation did not map to evidence retrieved for its turn.'
      : 'Semantic support could not be assessed by the evaluator.',
    evaluationMode: 'deterministic-fallback',
  };
};

export const evaluateGrounding = async ({ topic, transcript, model = null }) => {
  const integrity = summarizeCitationIntegrity(transcript);
  const fallback = deterministicFallback(integrity);

  try {
    const evaluationModel = model || new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      temperature: 0.1,
      apiKey: process.env.GOOGLE_API_KEY,
      maxRetries: 0,
    });
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', [
        'You evaluate a source-grounded debate against only the retrieved evidence supplied for each turn.',
        'Return strict JSON with: groundedness, argumentQuality, unsupportedClaimRisk (0-100), summary, strongestGroundedPoint, weakestSupportedPoint.',
        'Do not reward a claim merely because it contains a citation marker; assess whether its cited excerpt supports it.',
      ].join(' ')],
      ['human', '{payload}'],
    ]);
    const chain = prompt.pipe(evaluationModel).pipe(new StringOutputParser());
    const raw = await chain.invoke({ payload: JSON.stringify(buildEvaluationPayload(topic, transcript)) });
    const semantic = parseJsonObject(raw);
    return {
      groundedness: clampScore(semantic.groundedness, fallback.groundedness),
      evidenceUsage: integrity.evidenceUsage,
      citationFidelity: integrity.citationFidelity,
      argumentQuality: clampScore(semantic.argumentQuality, fallback.argumentQuality),
      unsupportedClaimRisk: clampScore(semantic.unsupportedClaimRisk, fallback.unsupportedClaimRisk),
      summary: `${semantic.summary || fallback.summary}`.slice(0, 600),
      strongestGroundedPoint: `${semantic.strongestGroundedPoint || fallback.strongestGroundedPoint}`.slice(0, 600),
      weakestSupportedPoint: `${semantic.weakestSupportedPoint || fallback.weakestSupportedPoint}`.slice(0, 600),
      evaluationMode: 'deterministic-and-semantic',
      citationIntegrity: integrity,
    };
  } catch (error) {
    console.warn('[Evidence Arena] Semantic grounding evaluator unavailable:', error.message);
    return { ...fallback, evidenceUsage: integrity.evidenceUsage, citationFidelity: integrity.citationFidelity, citationIntegrity: integrity };
  }
};
