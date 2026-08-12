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

test('rate limiter separates keys and returns Retry-After', () => {
  clearRateLimitsForTest();
  const middleware = createRateLimit({ name: 'test', max: 1, windowMs: 60_000, key: req => req.user.id });
  const makeResponse = () => ({ statusCode: 200, headers: {}, body: null, set(name, value) { this.headers[name] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  let nextCount = 0;
  middleware({ user: { id: 'a' } }, makeResponse(), () => { nextCount += 1; });
  const blocked = makeResponse(); middleware({ user: { id: 'a' } }, blocked, () => { nextCount += 1; });
  middleware({ user: { id: 'b' } }, makeResponse(), () => { nextCount += 1; });
  assert.equal(nextCount, 2);
  assert.equal(blocked.statusCode, 429);
  assert.ok(blocked.headers['Retry-After']);
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
