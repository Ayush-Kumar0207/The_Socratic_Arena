import { REASONING_METRICS, readMetric } from './reasoningProfile.js';

const fail = (message, statusCode = 409) => {
  throw Object.assign(new Error(message), { statusCode });
};

const canonicalSideScore = (match, side) => {
  const finalScore = match[`final_score_${side}`];
  if (finalScore !== null && finalScore !== undefined && finalScore !== '') {
    const stored = Number(finalScore);
    if (Number.isFinite(stored)) return stored;
  }
  const metrics = match.ai_scores?.[side];
  if (!metrics) return match.winner_id === match[`${side}_id`] ? 1 : 0;
  return Number((
    REASONING_METRICS.reduce((sum, metric) => sum + readMetric(metrics, metric), 0)
    / REASONING_METRICS.length
  ).toFixed(2));
};

export const buildVerifiedTournamentResult = ({ fixture, match, submittedWinnerId = null, verifiedAt = new Date().toISOString() }) => {
  if (!match) fail('Linked match not found', 404);
  if (match.status !== 'completed' || !match.winner_id) fail('The linked match must have a finalized, non-draw server result');

  const fixturePlayers = [fixture.player1_id, fixture.player2_id].filter(Boolean).sort();
  const matchPlayers = [match.critic_id, match.defender_id].filter(Boolean).sort();
  if (fixturePlayers.length !== 2 || matchPlayers.length !== 2 || fixturePlayers.some((playerId, index) => playerId !== matchPlayers[index])) {
    fail('Linked match participants do not match this seeded fixture');
  }
  if (submittedWinnerId && submittedWinnerId !== match.winner_id) {
    fail('Submitted winner conflicts with the server-finalized match result');
  }

  const scoreByUser = {
    [match.critic_id]: canonicalSideScore(match, 'critic'),
    [match.defender_id]: canonicalSideScore(match, 'defender'),
  };
  return {
    winner_id: match.winner_id,
    score_player1: scoreByUser[fixture.player1_id],
    score_player2: scoreByUser[fixture.player2_id],
    match_id: match.id,
    status: 'completed',
    result_source: 'verified_match',
    result_verified_at: verifiedAt,
    result_evidence: {
      match_id: match.id,
      match_status: match.status,
      winner_id: match.winner_id,
      verified_at: verifiedAt,
    },
    completed_at: verifiedAt,
  };
};
