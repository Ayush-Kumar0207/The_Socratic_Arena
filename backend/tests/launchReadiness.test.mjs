import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'fs/promises';
import {
  buildDebateHighlights,
  buildTranscriptText,
  computeCohortPercentile,
  nextTeamTurn,
  nextTournamentSlot,
  pickTeamSlot,
  seedTournamentEntries,
  signCredential,
} from '../lib/platformWorkflows.js';
import { assertPublicSourceUrl, extractEvidenceClaims, extractEvidenceUrls, verifyEvidence } from '../lib/evidenceVerifier.js';
import { clearRateLimitsForTest, createRateLimit } from '../lib/rateLimit.js';
import { JUDGE_PANEL, runBlindJudgePanel } from '../lib/judgePanel.js';
import { buildVerifiedTournamentResult } from '../lib/tournamentIntegrity.js';

test('cohort percentile uses the observed distribution rather than a score formula', () => {
  assert.deepEqual(computeCohortPercentile(70, [50, 60, 70, 80]), { percentile: 63, cohortSize: 4 });
  assert.deepEqual(computeCohortPercentile(99, []), { percentile: 50, cohortSize: 1 });
});
test('tournament seeding creates deterministic brackets, byes, and next slots', () => {
  const seeded = seedTournamentEntries([
    { user_id: 'b', elo_rating: 1400 }, { user_id: 'a', elo_rating: 1600 }, { user_id: 'c', elo_rating: 1200 },
  ], 8);
  assert.equal(seeded.bracketSize, 4);
  assert.equal(seeded.entries[0].user_id, 'a');
  assert.equal(seeded.entries[0].seed, 1);
  assert.equal(seeded.fixtures.length, 2);
  assert.equal(seeded.fixtures[1].status, 'ready');
  assert.deepEqual(nextTournamentSlot({ round_number: 1, bracket_position: 2 }), { roundNumber: 2, bracketPosition: 1, playerColumn: 'player2_id' });
});

test('2v2 slot and turn rotation are deterministic through completion', () => {
  assert.deepEqual(pickTeamSlot([{ side: 'affirmative', position: 1 }], 'affirmative'), { side: 'affirmative', position: 2 });
  assert.deepEqual(pickTeamSlot([
    { side: 'affirmative', position: 1 }, { side: 'affirmative', position: 2 }, { side: 'negative', position: 1 }, { side: 'negative', position: 2 },
  ]), null);
  assert.deepEqual(nextTeamTurn({ active_side: 'affirmative', active_position: 1, turn_number: 1, max_rounds: 1 }), { completed: false, side: 'negative', position: 1, turnNumber: 2 });
  assert.deepEqual(nextTeamTurn({ active_side: 'negative', active_position: 2, turn_number: 4, max_rounds: 1 }), { completed: true, side: 'affirmative', position: 1, turnNumber: 5 });
});

test('highlight, transcript, and credential artifacts are stable and auditable', () => {
  const transcript = [
    { id: '1', speaker: 'Critic', text: 'The controlled evidence matters because the mechanism is observable.', timestamp: '2026-01-01T00:00:00.000Z' },
    { id: '2', speaker: 'Defender', text: 'No.' },
  ];
  assert.equal(buildDebateHighlights(transcript)[0].message_id, '1');
  assert.match(buildTranscriptText({ id: 'm1', topic: 'Test', status: 'completed', transcript }), /VERIFIED DEBATE TRANSCRIPT/);
  const credential = { user_id: 'u', credential_key: 'k', verification_code: 'v', issued_at: 't' };
  assert.equal(signCredential(credential, 'secret'), signCredential(credential, 'secret'));
  assert.notEqual(signCredential(credential, 'secret'), signCredential(credential, 'different'));
});

test('evidence verification extracts claims, retrieves cited text, and blocks SSRF', async () => {
  const input = 'According to https://example.edu/study, the controlled study reports 20 percent improvement.';
  assert.equal(extractEvidenceClaims(input).length, 1);
  assert.deepEqual(extractEvidenceUrls(input), ['https://example.edu/study']);
  await assert.rejects(() => assertPublicSourceUrl('http://127.0.0.1/private', async () => [{ address: '127.0.0.1' }]));
  const report = await verifyEvidence(input, {
    lookup: async () => [{ address: '203.0.113.10' }],
    fetchImpl: async () => new Response('<html><title>Controlled Study</title><body>The controlled study reports 20 percent improvement after treatment.</body></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
  });
  assert.equal(report.sources[0].authority, 'primary_or_academic');
  assert.equal(report.claims[0].status, 'supported_by_cited_source');
  assert.equal(report.risk, 'low');
});

test('rate limiter separates keys and returns Retry-After', async () => {
  clearRateLimitsForTest();
  const middleware = createRateLimit({ name: 'test', max: 1, windowMs: 60_000, key: req => req.user.id });
  const makeResponse = () => ({ statusCode: 200, headers: {}, body: null, set(name, value) { this.headers[name] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  let nextCount = 0;
  await middleware({ user: { id: 'a' } }, makeResponse(), () => { nextCount += 1; });
  const blocked = makeResponse(); await middleware({ user: { id: 'a' } }, blocked, () => { nextCount += 1; });
  await middleware({ user: { id: 'b' } }, makeResponse(), () => { nextCount += 1; });
  assert.equal(nextCount, 2);
  assert.equal(blocked.statusCode, 429);
  assert.ok(blocked.headers['Retry-After']);
});

test('rate limiter accepts a distributed atomic consumer', async () => {
  const calls = [];
  const consume = async options => {
    calls.push(options);
    return { allowed: calls.length === 1, count: calls.length, retryAfterMs: 2_500, mode: 'redis-distributed' };
  };
  const middleware = createRateLimit({ name: 'global', max: 1, consume });
  const makeResponse = () => ({ statusCode: 200, headers: {}, set(name, value) { this.headers[name] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  let nextCount = 0;
  await middleware({ ip: '203.0.113.1' }, makeResponse(), () => { nextCount += 1; });
  const blocked = makeResponse();
  await middleware({ ip: '203.0.113.1' }, blocked, () => { nextCount += 1; });
  assert.equal(nextCount, 1);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers['X-RateLimit-Mode'], 'redis-distributed');
  assert.equal(calls[0].bucketKey, 'global:203.0.113.1');
});

test('tournament advancement is derived only from a canonical completed match', () => {
  const fixture = { player1_id: 'player-a', player2_id: 'player-b' };
  const match = {
    id: 'match-1', status: 'completed', critic_id: 'player-b', defender_id: 'player-a', winner_id: 'player-b',
    final_score_critic: 7.5, final_score_defender: 6.25, ai_scores: {},
  };
  const result = buildVerifiedTournamentResult({ fixture, match, verifiedAt: '2026-08-12T00:00:00.000Z' });
  assert.equal(result.winner_id, 'player-b');
  assert.equal(result.score_player1, 6.25);
  assert.equal(result.score_player2, 7.5);
  assert.equal(result.result_source, 'verified_match');
  assert.throws(() => buildVerifiedTournamentResult({ fixture, match, submittedWinnerId: 'player-a' }), /conflicts/);
  assert.throws(() => buildVerifiedTournamentResult({ fixture, match: { ...match, defender_id: 'outsider' } }), /participants/);
  assert.throws(() => buildVerifiedTournamentResult({ fixture, match: { ...match, status: 'pending_votes' } }), /finalized/);
});

test('competitive 2v2 requires and aggregates three blind independent judges', async () => {
  const seenPrompts = [];
  const generate = async (prompt) => {
    seenPrompts.push(prompt);
    const index = seenPrompts.length;
    const side = score => Object.fromEntries([
      'logic', 'evidence', 'rebuttal', 'clarity', 'conciseness', 'persuasion',
      'listening', 'calibration', 'humility', 'sourceReliability', 'emotionalControl',
    ].map(metric => [metric, score]));
    return {
      judge: JUDGE_PANEL[index - 1].role,
      affirmative: { ...side(8 + (index === 2 ? 1 : 0)), feedback: 'Specific affirmative feedback.' },
      negative: { ...side(6), feedback: 'Specific negative feedback.' },
      confidence: 0.9,
      rationale: 'Affirmative directly answered the strongest objection.',
    };
  };
  const result = await runBlindJudgePanel({
    topic: 'Test motion',
    transcript: [{ side: 'affirmative', text: 'Claim with warrant.' }, { side: 'negative', text: 'Rebuttal.' }],
    generate,
    sideKeys: ['affirmative', 'negative'],
    sideLabels: ['supporting', 'opposing'],
  });
  assert.equal(seenPrompts.length, 3);
  assert.ok(seenPrompts.every(prompt => /identities are hidden/i.test(prompt)));
  assert.equal(result.scores.result_metadata.judge_count, 3);
  assert.equal(result.scores.result_metadata.methodology, 'blind-three-judge-median-panel');
  assert.equal(result.winningSide, 'affirmative');
  await assert.rejects(() => runBlindJudgePanel({ advancedAi: false, allowFallback: false }), /not configured/);
});

test('launch migration codifies core RLS and service-only atomic voting', async () => {
  const migration = await readFile(new URL('../migrations/005_launch_readiness.sql', import.meta.url), 'utf8');
  for (const table of ['profiles', 'topics', 'matches', 'votes', 'user_follows', 'topic_follows', 'notifications']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(migration, /create or replace function public\.cast_match_vote_service/i);
  assert.match(migration, /revoke all on function public\.cast_match_vote_service[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /revoke insert, update, delete on public\.matches, public\.votes from anon, authenticated/i);
});

test('final integrity migration makes team judgments auditable and match linkage unique', async () => {
  const migration = await readFile(new URL('../migrations/006_final_integrity.sql', import.meta.url), 'utf8');
  assert.match(migration, /create unique index[\s\S]*tournament_fixture_verified_match/i);
  assert.match(migration, /status in \('waiting','active','judging','judging_failed','completed','cancelled'\)/i);
  assert.match(migration, /create table if not exists public\.team_judge_evaluations/i);
  assert.match(migration, /revoke all on public\.team_judge_evaluations from anon, authenticated/i);
});

test('judge calibration dataset has human labels and fairness pairs', async () => {
  const dataset = JSON.parse(await readFile(new URL('../benchmarks/judge-calibration.json', import.meta.url), 'utf8'));
  assert.equal(dataset.label_source, 'human_rubric_review');
  assert.ok(dataset.cases.length >= 8);
  for (const dimension of ['language', 'accent_proxy', 'ideology', 'speaking_order']) {
    const cases = dataset.cases.filter(item => item.dimension === dimension);
    assert.ok(cases.length >= 2, `${dimension} requires paired cases`);
    assert.ok(cases.every(item => item.label_rationale && item.expected_winner));
  }
});
