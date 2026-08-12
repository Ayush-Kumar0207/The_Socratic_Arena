export const REASONING_METRICS = [
  'logic',
  'evidence',
  'rebuttal',
  'clarity',
  'conciseness',
  'persuasion',
  'listening',
  'calibration',
  'humility',
  'sourceReliability',
  'emotionalControl',
];

export const DRILL_CATALOG = [
  { id: 'direct-rebuttal', metric: 'rebuttal', title: 'Three-minute direct rebuttal', duration: 3, description: 'Answer the opponent’s strongest claim before adding a new argument.' },
  { id: 'claim-evidence-link', metric: 'evidence', title: 'Claim → evidence → warrant', duration: 4, description: 'Support one claim with a source and explain why that source changes the conclusion.' },
  { id: 'steelman-first', metric: 'listening', title: 'Steelman before response', duration: 3, description: 'Restate the opposing case so they would accept it, then answer it directly.' },
  { id: 'confidence-calibration', metric: 'calibration', title: 'Confidence calibration', duration: 4, description: 'Attach a confidence level to each claim and name what evidence would change your mind.' },
  { id: 'one-breath-claim', metric: 'conciseness', title: 'One-breath argument', duration: 2, description: 'Deliver a complete argument in under 45 words without losing the warrant.' },
  { id: 'fallacy-repair', metric: 'logic', title: 'Fallacy repair lab', duration: 5, description: 'Find the hidden premise in a weak argument and rebuild it into a valid chain.' },
  { id: 'calm-under-fire', metric: 'emotionalControl', title: 'Calm under fire', duration: 3, description: 'Answer a hostile objection using neutral language and one precise concession.' },
  { id: 'credible-source', metric: 'sourceReliability', title: 'Source reliability sprint', duration: 4, description: 'Compare two sources by expertise, method, recency, and conflicts of interest.' },
  { id: 'clear-structure', metric: 'clarity', title: 'Signposted response', duration: 3, description: 'Use a claim, two numbered reasons, and one conclusion with no detours.' },
  { id: 'measured-persuasion', metric: 'persuasion', title: 'Audience bridge', duration: 4, description: 'Frame the same argument for a skeptical audience without overstating the evidence.' },
];

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const deviation = (values) => {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map(value => (value - average) ** 2)));
};

const aliases = {
  evidence: ['evidence', 'facts'],
  rebuttal: ['rebuttal', 'relevance'],
  listening: ['listening', 'directResponse'],
  humility: ['humility', 'epistemicHumility'],
  sourceReliability: ['sourceReliability', 'source_reliability'],
  emotionalControl: ['emotionalControl', 'emotional_control'],
};

export const readMetric = (scores = {}, metric, fallback = 6) => {
  const keys = aliases[metric] || [metric];
  for (const key of keys) {
    const value = Number(scores?.[key]);
    if (Number.isFinite(value)) return clamp(value, 1, 10);
  }
  return fallback;
};

export const pickDrill = (metrics = {}) => {
  const weakest = REASONING_METRICS
    .map(metric => ({ metric, score: Number(metrics[metric]) || 0 }))
    .sort((a, b) => a.score - b.score)[0]?.metric || 'rebuttal';
  return DRILL_CATALOG.find(drill => drill.metric === weakest) || DRILL_CATALOG[0];
};

export const aggregateJudgeVerdicts = (verdicts = [], version = 'arena-panel-1.0') => {
  const valid = verdicts.filter(verdict => verdict?.critic && verdict?.defender);
  if (!valid.length) return null;

  const aggregateSide = (side) => {
    const extended = {};
    for (const metric of REASONING_METRICS) {
      const values = valid.map(verdict => readMetric(verdict[side], metric));
      extended[metric] = Number(median(values).toFixed(1));
    }
    const feedback = valid.map(verdict => verdict?.[side]?.feedback).find(Boolean) || 'A balanced performance with clear next steps.';
    return {
      logic: extended.logic,
      facts: extended.evidence,
      relevance: extended.rebuttal,
      ...extended,
      feedback,
    };
  };

  const critic = aggregateSide('critic');
  const defender = aggregateSide('defender');
  const judgeMargins = valid.map((verdict) => {
    const criticTotal = mean(REASONING_METRICS.map(metric => readMetric(verdict.critic, metric)));
    const defenderTotal = mean(REASONING_METRICS.map(metric => readMetric(verdict.defender, metric)));
    return criticTotal - defenderTotal;
  });
  const direction = Math.sign(mean(judgeMargins));
  const agreementCount = judgeMargins.filter(margin => Math.sign(margin) === direction || Math.abs(margin) < 0.15).length;
  const rawUncertainty = mean([
    ...REASONING_METRICS.map(metric => deviation(valid.map(v => readMetric(v.critic, metric)))),
    ...REASONING_METRICS.map(metric => deviation(valid.map(v => readMetric(v.defender, metric)))),
  ]);
  const flaggedClaims = valid.flatMap(v => Array.isArray(v.flagged_claims) ? v.flagged_claims : []).slice(0, 8);

  return {
    critic,
    defender,
    overall_summary: valid.map(v => v.overall_summary).find(Boolean) || 'A closely examined contest of reasoning and evidence.',
    result_metadata: {
      judge_version: version,
      judge_count: valid.length,
      agreement: `${agreementCount}/${valid.length}`,
      agreement_count: agreementCount,
      uncertainty: Number(Math.min(2.5, rawUncertainty).toFixed(2)),
      confidence: Number(clamp(94 - rawUncertainty * 18, 45, 96).toFixed(0)),
      blind_scoring: true,
      rubric: 'Reasoning Rubric v2',
      factual_claims_flagged: flaggedClaims.length,
      flagged_claims: flaggedClaims,
      appeals_enabled: true,
      evaluated_at: new Date().toISOString(),
    },
    judge_verdicts: valid.map((verdict, index) => ({
      judge: verdict.judge || `Panel ${index + 1}`,
      confidence: Number(verdict.confidence) || 0.75,
      rationale: verdict.rationale || verdict.overall_summary || '',
    })),
  };
};

const sideScoresFromMatch = (match, userId) => {
  if (!match?.ai_scores) return null;
  if (match.critic_id === userId) return match.ai_scores.critic || null;
  if (match.defender_id === userId) return match.ai_scores.defender || null;
  return null;
};

export const computeReasoningProfile = (matches = [], userId, previous = null) => {
  const performances = matches.map(match => sideScoresFromMatch(match, userId)).filter(Boolean);
  const metrics = {};
  for (const metric of REASONING_METRICS) {
    const values = performances.map(performance => readMetric(performance, metric) * 10);
    metrics[metric] = Math.round(values.length ? mean(values) : Number(previous?.metrics?.[metric]) || 64);
  }

  const overall = Math.round(mean(Object.values(metrics)));
  const matchCount = Math.max(performances.length, Number(previous?.match_count) || 0);
  const confidence = Math.round(clamp(36 + matchCount * 5.5, 36, 96));
  // Percentile is populated by the service after comparing this score with
  // the stored cohort distribution. Never infer a population rank from the
  // user's score alone.
  const percentile = Number.isFinite(Number(previous?.percentile)) ? Number(previous.percentile) : null;
  const recent = performances.slice(0, 3);
  const older = performances.slice(3, 6);
  const recentAverage = recent.length ? mean(recent.flatMap(p => REASONING_METRICS.map(m => readMetric(p, m)))) : overall / 10;
  const olderAverage = older.length ? mean(older.flatMap(p => REASONING_METRICS.map(m => readMetric(p, m)))) : recentAverage;
  const trend = Number(((recentAverage - olderAverage) * 10).toFixed(1));
  const prescribedDrill = pickDrill(metrics);

  return {
    metrics,
    overall,
    match_count: matchCount,
    confidence,
    percentile,
    trend,
    prescribed_drill: prescribedDrill,
    updated_at: new Date().toISOString(),
  };
};

export const deterministicPracticeScore = (transcript = []) => {
  const userTurns = transcript.filter(turn => turn.role === 'user' || turn.speaker === 'You');
  const text = userTurns.map(turn => turn.text || '').join(' ');
  const words = text.trim().split(/\s+/).filter(Boolean);
  const evidenceSignals = (text.match(/\b(according to|study|data|evidence|source|research|because)\b/gi) || []).length;
  const rebuttalSignals = (text.match(/\b(however|you argue|that claim|respond|but|yet|although)\b/gi) || []).length;
  const qualificationSignals = (text.match(/\b(may|likely|uncertain|confidence|unless|depends|could)\b/gi) || []).length;
  const base = clamp(52 + Math.min(18, words.length / 18), 45, 78);
  const metrics = {
    logic: clamp(base + evidenceSignals * 2),
    evidence: clamp(base - 4 + evidenceSignals * 4),
    rebuttal: clamp(base - 3 + rebuttalSignals * 5),
    clarity: clamp(base + (words.length < 360 ? 8 : -4)),
    conciseness: clamp(82 - Math.max(0, words.length - 220) / 5),
    persuasion: clamp(base + rebuttalSignals * 2),
    listening: clamp(base - 2 + rebuttalSignals * 4),
    calibration: clamp(base - 5 + qualificationSignals * 5),
    humility: clamp(base - 2 + qualificationSignals * 4),
    sourceReliability: clamp(base - 8 + evidenceSignals * 4),
    emotionalControl: clamp(78 - (text.match(/!/g) || []).length * 2),
  };
  Object.keys(metrics).forEach(key => { metrics[key] = Math.round(metrics[key]); });
  return {
    metrics,
    overall: Math.round(mean(Object.values(metrics))),
    feedback: 'Your practice was scored locally. Connect Gemini for panel-level qualitative feedback.',
    strengths: Object.entries(metrics).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([key]) => key),
    improvements: Object.entries(metrics).sort((a, b) => a[1] - b[1]).slice(0, 2).map(([key]) => key),
  };
};
