const positiveInteger = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

export const launchAiLimits = Object.freeze({
  practiceTurnsPerUser: positiveInteger('AI_PRACTICE_TURNS_PER_USER_DAILY', 20),
  practiceScoresPerUser: positiveInteger('AI_PRACTICE_SESSIONS_PER_USER_DAILY', 5),
  practiceTurnsGlobal: positiveInteger('AI_PRACTICE_TURNS_GLOBAL_DAILY', 4000),
  practiceScoresGlobal: positiveInteger('AI_PRACTICE_SESSIONS_GLOBAL_DAILY', 1000),
  evidencePerUser: positiveInteger('EVIDENCE_ARENA_SESSIONS_PER_USER_DAILY', 3),
  evidenceGlobal: positiveInteger('EVIDENCE_ARENA_SESSIONS_GLOBAL_DAILY', 75),
  ttsPerUser: positiveInteger('TTS_REQUESTS_PER_USER_DAILY', 40),
  ttsGlobal: positiveInteger('TTS_REQUESTS_GLOBAL_DAILY', 1000),
  summariesPerUser: positiveInteger('AI_SUMMARIES_PER_USER_DAILY', 10),
  summariesGlobal: positiveInteger('AI_SUMMARIES_GLOBAL_DAILY', 1000),
  objectionsPerUser: positiveInteger('AI_OBJECTIONS_PER_USER_DAILY', 10),
  objectionsGlobal: positiveInteger('AI_OBJECTIONS_GLOBAL_DAILY', 1000),
});

export const launchAllowanceMessages = Object.freeze({
  practice: "You've reached today's AI practice allowance. Ranked debates and the rest of Socratic Arena remain available. AI practice resets tomorrow.",
  evidence: "You've reached today's Evidence Arena allowance. Ranked debates and the rest of Socratic Arena remain available. Evidence Arena resets tomorrow.",
  tts: "You've reached today's voice allowance. Text practice remains available, and voice resets tomorrow.",
  summary: "You've reached today's deep-analysis allowance. Match replays and ranked debates remain available. Analysis resets tomorrow.",
  objection: "You've reached today's AI Objection allowance. The debate remains fully available, and AI Objections reset tomorrow.",
  globalPractice: 'AI practice is temporarily at capacity due to launch demand. Ranked debates and the rest of Socratic Arena remain available. Please try again later.',
  globalEvidence: 'Evidence Arena is temporarily at capacity due to launch demand. Ranked debates and the rest of Socratic Arena remain available. Please try again later.',
  globalTts: 'Voice is temporarily at capacity due to launch demand. All text features remain available. Please try again later.',
  globalSummary: 'Deep analysis is temporarily at capacity due to launch demand. Match replays remain available. Please try again later.',
  globalObjection: 'AI Objections are temporarily at capacity due to launch demand. The debate remains fully available. Please try again later.',
});

export const launchLimitSummary = () => ({
  reset_timezone: 'UTC',
  practice_sessions_per_user_daily: launchAiLimits.practiceScoresPerUser,
  evidence_sessions_per_user_daily: launchAiLimits.evidencePerUser,
  tts_requests_per_user_daily: launchAiLimits.ttsPerUser,
  global_capacity_configured: true,
});
