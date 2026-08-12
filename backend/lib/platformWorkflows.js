import crypto from 'crypto';

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));

export const computeCohortPercentile = (overall, cohortScores = []) => {
  const score = Number(overall) || 0;
  const cohort = cohortScores.map(Number).filter(Number.isFinite);
  if (!cohort.length) return { percentile: 50, cohortSize: 1 };
  const below = cohort.filter(value => value < score).length;
  const equal = cohort.filter(value => value === score).length;
  return {
    percentile: Math.round(clamp(((below + equal * 0.5) / cohort.length) * 100, 1, 99)),
    cohortSize: cohort.length,
  };
};
export const seedTournamentEntries = (entries = [], bracketLimit = 64) => {
  const normalized = entries
    .filter(entry => entry?.user_id)
    .map(entry => ({
      ...entry,
      rating: Number(entry.elo_rating ?? entry.rating) || 1000,
      requestedSeed: Number(entry.seed) || null,
    }))
    .sort((a, b) => {
      if (a.requestedSeed && b.requestedSeed) return a.requestedSeed - b.requestedSeed;
      if (a.requestedSeed) return -1;
      if (b.requestedSeed) return 1;
      return b.rating - a.rating || String(a.user_id).localeCompare(String(b.user_id));
    })
    .slice(0, Math.max(2, Number(bracketLimit) || 64));

  const bracketSize = Math.min(
    Math.max(2, Number(bracketLimit) || 64),
    2 ** Math.ceil(Math.log2(Math.max(2, normalized.length))),
  );
  const slots = Array(bracketSize).fill(null);
  normalized.forEach((entry, index) => { slots[index] = { ...entry, seed: index + 1 }; });

  const fixtures = [];
  for (let index = 0; index < bracketSize / 2; index += 1) {
    const first = slots[index];
    const second = slots[bracketSize - 1 - index];
    const player1 = first?.user_id || null;
    const player2 = second?.user_id || null;
    fixtures.push({
      round_number: 1,
      bracket_position: index + 1,
      player1_id: player1,
      player2_id: player2,
      winner_id: player1 && !player2 ? player1 : player2 && !player1 ? player2 : null,
      status: player1 && player2 ? 'ready' : 'bye',
    });
  }

  return {
    entries: normalized.map((entry, index) => ({ ...entry, seed: index + 1 })),
    fixtures,
    bracketSize,
    totalRounds: Math.log2(bracketSize),
  };
};

export const nextTournamentSlot = (fixture) => ({
  roundNumber: Number(fixture.round_number) + 1,
  bracketPosition: Math.ceil(Number(fixture.bracket_position) / 2),
  playerColumn: Number(fixture.bracket_position) % 2 === 1 ? 'player1_id' : 'player2_id',
});

export const buildDebateHighlights = (transcript = [], limit = 4) => {
  const candidates = transcript
    .filter(turn => turn?.text && ['critic', 'defender'].includes(String(turn.speaker || '').toLowerCase()))
    .map((turn, index) => {
      const text = String(turn.text).trim();
      const signalWords = (text.match(/\b(because|therefore|however|evidence|data|concede|means|unless|contradiction)\b/gi) || []).length;
      const score = Math.min(text.length, 520) + signalWords * 55 + (turn.cognitive?.riskScore ? 20 : 0);
      return { turn, index, text, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(1, limit));

  return candidates.map(({ turn, text }) => ({
    quote: text.length > 300 ? `${text.slice(0, 297).trim()}…` : text,
    author_role: turn.speaker,
    context: turn.cognitive?.contradiction ? 'Premise challenge' : turn.cognitive?.fallacies?.length ? 'Logical turning point' : 'Key argument',
    message_id: turn.id || null,
  }));
};

export const buildTranscriptText = (match) => {
  const created = match?.created_at ? new Date(match.created_at).toISOString() : new Date().toISOString();
  const transcript = Array.isArray(match?.transcript) ? match.transcript : [];
  const lines = [
    'THE SOCRATIC ARENA — VERIFIED DEBATE TRANSCRIPT',
    `Match: ${match?.id || 'unknown'}`,
    `Topic: ${match?.topic || match?.topic_title || 'Untitled'}`,
    `Created: ${created}`,
    `Status: ${match?.status || 'unknown'}`,
    '',
    ...transcript.map((turn, index) => {
      const timestamp = turn.timestamp ? ` [${turn.timestamp}]` : '';
      return `${index + 1}. ${turn.speaker || 'Speaker'}${timestamp}\n${turn.text || ''}`;
    }),
    '',
    `Judge version: ${match?.ai_scores?.result_metadata?.judge_version || 'not evaluated'}`,
    `Judge agreement: ${match?.ai_scores?.result_metadata?.agreement || 'not available'}`,
  ];
  return lines.join('\n\n');
};

export const signCredential = (credential, secret) => {
  if (!secret) return null;
  const canonical = [credential.user_id, credential.credential_key, credential.verification_code, credential.issued_at].join('|');
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
};

export const pickTeamSlot = (members = [], requestedSide = null) => {
  const sides = requestedSide && ['affirmative', 'negative'].includes(requestedSide)
    ? [requestedSide, requestedSide === 'affirmative' ? 'negative' : 'affirmative']
    : ['affirmative', 'negative'];
  for (const side of sides) {
    const occupied = new Set(members.filter(member => member.side === side).map(member => Number(member.position)));
    for (const position of [1, 2]) if (!occupied.has(position)) return { side, position };
  }
  return null;
};

export const nextTeamTurn = ({ active_side: side, active_position: position, turn_number: turnNumber, max_rounds: maxRounds }) => {
  const order = [
    { side: 'affirmative', position: 1 },
    { side: 'negative', position: 1 },
    { side: 'affirmative', position: 2 },
    { side: 'negative', position: 2 },
  ];
  const currentIndex = order.findIndex(slot => slot.side === side && slot.position === Number(position));
  const nextIndex = currentIndex < 0 ? 0 : currentIndex + 1;
  const completed = nextIndex >= order.length && Number(turnNumber) >= Number(maxRounds) * order.length;
  const next = order[nextIndex % order.length];
  return { completed, side: next.side, position: next.position, turnNumber: Number(turnNumber) + 1 };
};
