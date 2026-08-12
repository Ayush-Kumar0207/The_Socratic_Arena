import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateJudgeVerdicts,
  computeReasoningProfile,
  deterministicPracticeScore,
} from '../lib/reasoningProfile.js';

const verdict = (judge, criticLogic, defenderLogic) => ({
  judge,
  critic: { logic: criticLogic, evidence: 8, rebuttal: 7, clarity: 8, conciseness: 7, persuasion: 7, listening: 8, calibration: 7, humility: 8, sourceReliability: 7, emotionalControl: 9, feedback: 'Specific feedback.' },
  defender: { logic: defenderLogic, evidence: 7, rebuttal: 6, clarity: 7, conciseness: 7, persuasion: 6, listening: 7, calibration: 6, humility: 7, sourceReliability: 6, emotionalControl: 8, feedback: 'Specific feedback.' },
  overall_summary: 'A tested debate.',
  confidence: 0.8,
  flagged_claims: [],
});

test('judge aggregation uses the median and preserves legacy score keys', () => {
  const result = aggregateJudgeVerdicts([
    verdict('Logic', 9, 5),
    verdict('Evidence', 8, 6),
    verdict('Communication', 2, 7),
  ]);
  assert.equal(result.critic.logic, 8);
  assert.equal(result.critic.facts, 8);
  assert.equal(result.critic.relevance, 7);
  assert.equal(result.result_metadata.judge_count, 3);
  assert.equal(result.result_metadata.blind_scoring, true);
});

test('reasoning profile reads the side played by a user', () => {
  const userId = 'user-a';
  const result = computeReasoningProfile([
    { critic_id: userId, defender_id: 'user-b', ai_scores: aggregateJudgeVerdicts([verdict('A', 9, 5)]) },
    { critic_id: 'user-c', defender_id: userId, ai_scores: aggregateJudgeVerdicts([verdict('B', 5, 8)]) },
  ], userId);
  assert.equal(result.metrics.logic, 85);
  assert.equal(result.match_count, 2);
  assert.ok(result.prescribed_drill.id);
});

test('local practice scoring rewards evidence and rebuttal signals', () => {
  const baseline = deterministicPracticeScore([{ role: 'user', text: 'I disagree.' }]);
  const supported = deterministicPracticeScore([{ role: 'user', text: 'However, according to the research data, that claim misses the causal evidence because the study controls for the alternative explanation. I may revise this view if newer evidence changes the estimate.' }]);
  assert.ok(supported.metrics.evidence > baseline.metrics.evidence);
  assert.ok(supported.metrics.rebuttal > baseline.metrics.rebuttal);
  assert.ok(supported.metrics.calibration > baseline.metrics.calibration);
});
