import {
  REASONING_METRICS,
  aggregateBlindPanelVerdicts,
  readMetric,
} from './reasoningProfile.js';

export const JUDGE_PANEL = [
  { role: 'Logic judge', lens: 'valid inference, contradictions, claim construction, direct rebuttal, and charitable interpretation' },
  { role: 'Evidence judge', lens: 'factual support, source reliability, confidence calibration, uncertainty, and unsupported empirical claims' },
  { role: 'Communication judge', lens: 'clarity, conciseness, listening, persuasion without manipulation, humility, and emotional control' },
];

const scoreShape = () => ({
  logic: 6,
  evidence: 6,
  rebuttal: 6,
  clarity: 6,
  conciseness: 6,
  persuasion: 6,
  listening: 6,
  calibration: 6,
  humility: 6,
  sourceReliability: 6,
  emotionalControl: 6,
  feedback: 'A full Gemini panel was unavailable, so this neutral score cannot certify a competitive result.',
});

export const neutralJudgeVerdict = (judge, index, sideKeys = ['critic', 'defender']) => ({
  judge: judge.role,
  [sideKeys[0]]: scoreShape(),
  [sideKeys[1]]: scoreShape(),
  overall_summary: 'The debate concluded and is awaiting a fully configured judge panel.',
  confidence: 0.45 + index * 0.01,
  rationale: 'Neutral offline fallback.',
  flagged_claims: [],
});

const transcriptText = (transcript = []) => transcript
  .slice(-40)
  .map(turn => `${turn.side || turn.speaker || 'speaker'}: ${turn.text}`)
  .join('\n');

export const buildBlindJudgePrompt = ({ judge, topic, transcript, sideKeys, sideLabels }) => {
  const [firstSide, secondSide] = sideKeys;
  const [firstLabel, secondLabel] = sideLabels;
  const sideTemplate = `{
    "logic": 1, "evidence": 1, "rebuttal": 1, "clarity": 1,
    "conciseness": 1, "persuasion": 1, "listening": 1,
    "calibration": 1, "humility": 1, "sourceReliability": 1,
    "emotionalControl": 1, "feedback": "two concrete sentences"
  }`;
  return `You are the ${judge.role} on a blind debate panel. Player identities are hidden. Judge only the transcript and do not reward aggression, accent, vocabulary, ideology, or verbosity. Focus on ${judge.lens}. Treat factual claims as unverified unless the speaker provides a checkable source. Score both sides independently from 1-10.

Topic: ${topic || 'Debate topic not supplied'}
Side labels: ${firstSide} means ${firstLabel}; ${secondSide} means ${secondLabel}.

Return ONLY JSON in this exact structure:
{
  "judge": "${judge.role}",
  "${firstSide}": ${sideTemplate},
  "${secondSide}": ${sideTemplate},
  "overall_summary": "one sentence",
  "confidence": 0.0,
  "rationale": "one concise panel note",
  "flagged_claims": [{ "speaker": "${firstSide} or ${secondSide}", "claim": "claim requiring verification", "reason": "why" }]
}

Transcript, in original speaking order:
${transcriptText(transcript)}`;
};

const sideOverall = scores => (
  REASONING_METRICS.reduce((sum, metric) => sum + readMetric(scores, metric), 0) / REASONING_METRICS.length
);

export const runBlindJudgePanel = async ({
  topic,
  transcript,
  generate,
  advancedAi = true,
  allowFallback = false,
  sideKeys = ['critic', 'defender'],
  sideLabels = sideKeys,
  version = 'arena-panel-1.0',
} = {}) => {
  if ((!advancedAi || typeof generate !== 'function') && !allowFallback) {
    throw Object.assign(new Error('The blind Gemini judge panel is not configured'), { code: 'JUDGE_PANEL_UNAVAILABLE' });
  }

  const verdicts = await Promise.all(JUDGE_PANEL.map(async (judge, index) => {
    if (!advancedAi || typeof generate !== 'function') return neutralJudgeVerdict(judge, index, sideKeys);
    try {
      const verdict = await generate(buildBlindJudgePrompt({ judge, topic, transcript, sideKeys, sideLabels }), 3, true);
      if (!verdict?.[sideKeys[0]] || !verdict?.[sideKeys[1]]) throw new Error('Judge returned an incomplete scorecard');
      return { ...verdict, judge: verdict.judge || judge.role };
    } catch (error) {
      if (!allowFallback) throw error;
      return neutralJudgeVerdict(judge, index, sideKeys);
    }
  }));

  const scores = aggregateBlindPanelVerdicts(verdicts, { version, sideKeys });
  if (!scores || (!allowFallback && scores.result_metadata?.judge_count !== JUDGE_PANEL.length)) {
    throw Object.assign(new Error('All three independent judge verdicts are required'), { code: 'INCOMPLETE_JUDGE_PANEL' });
  }

  const firstOverall = sideOverall(scores[sideKeys[0]]);
  const secondOverall = sideOverall(scores[sideKeys[1]]);
  const margin = firstOverall - secondOverall;
  const winningSide = Math.abs(margin) < 0.15 ? 'draw' : margin > 0 ? sideKeys[0] : sideKeys[1];
  return {
    verdicts,
    scores: {
      ...scores,
      result_metadata: {
        ...scores.result_metadata,
        methodology: 'blind-three-judge-median-panel',
        side_overall: {
          [sideKeys[0]]: Number(firstOverall.toFixed(2)),
          [sideKeys[1]]: Number(secondOverall.toFixed(2)),
        },
        winning_margin: Number(Math.abs(margin).toFixed(2)),
      },
    },
    winningSide,
  };
};
