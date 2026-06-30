import crypto from 'crypto';

const STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'because', 'before', 'being',
  'between', 'could', 'every', 'from', 'have', 'into', 'just', 'more', 'most',
  'only', 'other', 'over', 'same', 'should', 'than', 'that', 'their', 'there',
  'these', 'they', 'this', 'those', 'through', 'under', 'very', 'were', 'what',
  'when', 'where', 'which', 'while', 'with', 'would', 'your'
]);

const FALLACY_RULES = [
  {
    type: 'ad_hominem',
    label: 'Ad hominem risk',
    severity: 'high',
    confidence: 0.82,
    pattern: /\b(you are|you're|idiot|stupid|dumb|moron|fool|ignorant|clown|liar)\b/i,
    rationale: 'The argument appears to attack the person rather than the claim.'
  },
  {
    type: 'false_dilemma',
    label: 'False dilemma risk',
    severity: 'medium',
    confidence: 0.7,
    pattern: /\b(either\b.+\bor\b|only two options|no other choice|you are either)\b/i,
    rationale: 'The claim may frame a complex issue as only two possible choices.'
  },
  {
    type: 'slippery_slope',
    label: 'Slippery slope risk',
    severity: 'medium',
    confidence: 0.72,
    pattern: /\b(will inevitably|this will lead to|next thing|before long|eventually everyone|downfall of)\b/i,
    rationale: 'The claim predicts a chain of consequences without showing the causal steps.'
  },
  {
    type: 'appeal_to_popularity',
    label: 'Appeal to popularity risk',
    severity: 'medium',
    confidence: 0.68,
    pattern: /\b(everyone knows|most people believe|nobody disagrees|common sense says|the majority thinks)\b/i,
    rationale: 'The claim uses popularity as evidence for truth.'
  },
  {
    type: 'appeal_to_authority',
    label: 'Authority-only evidence risk',
    severity: 'low',
    confidence: 0.58,
    pattern: /\b(experts say|scientists say|a famous|authority says|because the government says)\b/i,
    rationale: 'The claim may rely on authority without explaining the supporting evidence.'
  },
  {
    type: 'anecdotal_evidence',
    label: 'Anecdotal evidence risk',
    severity: 'low',
    confidence: 0.62,
    pattern: /\b(my friend|my cousin|i know someone|in my experience|one time|personally saw)\b/i,
    rationale: 'The claim may generalize from an isolated example.'
  },
  {
    type: 'correlation_causation',
    label: 'Correlation-causation risk',
    severity: 'medium',
    confidence: 0.66,
    pattern: /\b(whenever|after this|since this happened|correlates with|linked to).+\b(causes|proves|therefore)\b/i,
    rationale: 'The claim may infer causation from timing or correlation alone.'
  },
  {
    type: 'hasty_generalization',
    label: 'Hasty generalization risk',
    severity: 'medium',
    confidence: 0.64,
    pattern: /\b(all|always|never|none|everyone|no one)\b/i,
    rationale: 'The claim uses an absolute quantifier that may need stronger support.'
  },
  {
    type: 'burden_shift',
    label: 'Burden-shifting risk',
    severity: 'medium',
    confidence: 0.67,
    pattern: /\b(prove me wrong|you cannot prove|until you disprove|no one has disproven)\b/i,
    rationale: 'The claim may shift the burden of proof away from the speaker.'
  }
];

const OPPOSITION_PAIRS = [
  ['increase', 'decrease'],
  ['increases', 'decreases'],
  ['legal', 'illegal'],
  ['moral', 'immoral'],
  ['ethical', 'unethical'],
  ['safe', 'dangerous'],
  ['good', 'bad'],
  ['better', 'worse'],
  ['true', 'false'],
  ['benefit', 'harm'],
  ['benefits', 'harms'],
  ['effective', 'ineffective'],
  ['necessary', 'unnecessary'],
  ['possible', 'impossible'],
  ['should', 'should not'],
  ['can', 'cannot'],
  ['will', 'will not']
];

const NEGATION_PATTERN = /\b(no|not|never|none|cannot|can't|won't|isn't|aren't|doesn't|don't|without|false)\b/i;
const EVIDENCE_PATTERN = /\b(study|studies|data|evidence|research|according to|survey|statistics|percent|percentage|rate|source|citation)\b|\d+(\.\d+)?%?/i;
const CAUSAL_PATTERN = /\b(because|therefore|thus|hence|so|as a result|causes|leads to|due to)\b/i;

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const normalize = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/can't/g, 'cannot')
    .replace(/won't/g, 'will not')
    .replace(/n't/g, ' not')
    .replace(/[^a-z0-9\s%.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (text) => {
  const normalized = normalize(text);
  return normalized
    .split(/\s+/)
    .filter((token) => token.length > 3 && !STOPWORDS.has(token));
};

const unique = (items) => [...new Set(items)];

const jaccard = (left, right) => {
  if (!left.length || !right.length) return 0;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let intersection = 0;
  leftSet.forEach((token) => {
    if (rightSet.has(token)) intersection++;
  });
  return intersection / (leftSet.size + rightSet.size - intersection || 1);
};

const hasOppositionPair = (currentText, previousText) => {
  const current = ` ${normalize(currentText)} `;
  const previous = ` ${normalize(previousText)} `;

  return OPPOSITION_PAIRS.some(([left, right]) => (
    (current.includes(` ${left} `) && previous.includes(` ${right} `)) ||
    (current.includes(` ${right} `) && previous.includes(` ${left} `))
  ));
};

const detectFallacies = (text) => FALLACY_RULES
  .filter((rule) => rule.pattern.test(text))
  .map(({ type, label, severity, confidence, rationale }) => ({
    type,
    label,
    severity,
    confidence,
    rationale
  }));

const detectContradiction = (message, transcript) => {
  const currentTokens = tokenize(message.text);
  const currentHasNegation = NEGATION_PATTERN.test(message.text);
  let best = null;

  transcript.slice(-10).forEach((previous) => {
    if (!previous?.text || previous.id === message.id) return;

    const previousTokens = tokenize(previous.text);
    const overlap = jaccard(currentTokens, previousTokens);
    if (overlap < 0.18) return;

    const previousHasNegation = NEGATION_PATTERN.test(previous.text);
    const polarityFlip = currentHasNegation !== previousHasNegation;
    const opposedTerms = hasOppositionPair(message.text, previous.text);
    if (!polarityFlip && !opposedTerms) return;

    const confidence = clamp(0.45 + overlap + (opposedTerms ? 0.22 : 0.12), 0, 0.92);
    if (!best || confidence > best.confidence) {
      best = {
        withMessageId: previous.id,
        speaker: previous.speaker,
        confidence,
        summary: `Possible tension with ${previous.speaker}'s earlier claim about ${unique(currentTokens.filter((t) => previousTokens.includes(t))).slice(0, 4).join(', ') || 'the same premise'}.`
      };
    }
  });

  return best;
};

const inferDimensions = ({ text, topic, tone, fallacies, contradiction }) => {
  const textTokens = tokenize(text);
  const topicTokens = tokenize(topic);
  const topicOverlap = topicTokens.length ? jaccard(textTokens, topicTokens) : 0.35;
  const hasEvidence = EVIDENCE_PATTERN.test(text);
  const hasCausalBridge = CAUSAL_PATTERN.test(text);
  const wordCount = normalize(text).split(/\s+/).filter(Boolean).length;
  const certainty = /\b(obviously|clearly|undeniably|always|never|everyone|no one)\b/i.test(text) ? 0.18 : 0;

  return {
    logic: clamp(0.76 + (hasCausalBridge ? 0.08 : 0) - fallacies.length * 0.09 - (contradiction ? 0.16 : 0)),
    evidence: clamp(0.3 + (hasEvidence ? 0.42 : 0) + (wordCount > 28 ? 0.12 : 0) - certainty),
    relevance: clamp(0.45 + topicOverlap * 1.15),
    intensity: clamp((tone === 'urgent' ? 0.55 : 0.25) + (/[!?]{2,}/.test(text) ? 0.25 : 0) + certainty)
  };
};

const severityFromRisk = (riskScore) => {
  if (riskScore >= 0.68) return 'high';
  if (riskScore >= 0.38) return 'medium';
  return 'low';
};

export const analyzeCognitiveTurn = ({ message, transcript, topic }) => {
  const priorTranscript = (transcript || []).filter((item) => item?.id !== message.id);
  const fallacies = detectFallacies(message.text);
  const contradiction = detectContradiction(message, priorTranscript);
  const dimensions = inferDimensions({
    text: message.text,
    topic,
    tone: message.tone,
    fallacies,
    contradiction
  });

  const fallacyWeight = fallacies.reduce((total, fallacy) => {
    if (fallacy.severity === 'high') return total + 0.26;
    if (fallacy.severity === 'medium') return total + 0.18;
    return total + 0.1;
  }, 0);

  const riskScore = clamp(
    fallacyWeight +
    (contradiction ? contradiction.confidence * 0.38 : 0) +
    ((dimensions.evidence < 0.38 && dimensions.intensity > 0.5) ? 0.16 : 0)
  );

  const keywords = unique(tokenize(message.text)).slice(0, 8);

  return {
    id: crypto.randomUUID(),
    messageId: message.id,
    speaker: message.speaker,
    turnIndex: (transcript || []).length,
    riskScore,
    severity: severityFromRisk(riskScore),
    fallacies,
    contradiction,
    dimensions,
    keywords,
    createdAt: new Date().toISOString()
  };
};

export const extractCognitiveInsights = (transcript = []) =>
  transcript
    .map((message) => message?.cognitive)
    .filter(Boolean);
