import express from 'express';
import crypto from 'crypto';
import {
  DRILL_CATALOG,
  REASONING_METRICS,
  computeReasoningProfile,
  deterministicPracticeScore,
  pickDrill,
} from '../lib/reasoningProfile.js';

const SCENARIO_FALLBACKS = [
  { scenario_key: 'sales-objection', title: 'Enterprise sales objection', description: 'Defend value and handle a skeptical procurement lead.', category: 'Sales', difficulty: 'Intermediate', opening_prompt: 'Your proposal is twice the price of the incumbent. Why should we take that risk?' },
  { scenario_key: 'salary-negotiation', title: 'Salary negotiation', description: 'Negotiate scope, evidence, and trade-offs under pressure.', category: 'Career', difficulty: 'Intermediate', opening_prompt: 'The budget is fixed. Why should we make an exception for your compensation?' },
  { scenario_key: 'design-review', title: 'Technical design review', description: 'Defend an architecture against reliability and cost concerns.', category: 'Technology', difficulty: 'Advanced', opening_prompt: 'This design adds operational complexity. Prove the reliability gain is worth it.' },
  { scenario_key: 'investor-pitch', title: 'Investor challenge room', description: 'Answer market, moat, and execution objections.', category: 'Leadership', difficulty: 'Advanced', opening_prompt: 'Your competitors can copy this in six months. What is actually defensible?' },
  { scenario_key: 'policy-defense', title: 'Policy defence', description: 'Balance stakeholders, evidence, and unintended consequences.', category: 'Policy', difficulty: 'Advanced', opening_prompt: 'Your policy helps the average case but harms a vulnerable minority. Defend it.' },
];

const TOURNAMENT_FALLBACKS = [
  { id: 'featured-campus', title: 'Inter-College Reasoning League', description: 'Weekly verified campus fixtures leading to a national final.', domain: 'Open', format: '1v1', bracket_size: 64, status: 'registration', verified: true, starts_at: new Date(Date.now() + 7 * 86400000).toISOString(), entries: 38 },
  { id: 'featured-tech-ethics', title: 'Technology & Ethics Cup', description: 'Fast-format debates on AI, privacy, biotechnology, and digital society.', domain: 'Technology', format: 'Rapid 1v1', bracket_size: 32, status: 'registration', verified: true, starts_at: new Date(Date.now() + 12 * 86400000).toISOString(), entries: 21 },
];

const safeRows = async (builder, fallback = []) => {
  try {
    const { data, error } = await builder;
    if (error) return fallback;
    return data || fallback;
  } catch {
    return fallback;
  }
};

const slugify = (value = '') => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'arena';
const shortCode = () => crypto.randomBytes(3).toString('hex').toUpperCase();
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
const readableMetric = (metric = '') => metric.replace(/([A-Z])/g, ' $1').replace(/^./, char => char.toUpperCase());

const defaultRatings = (elo = 1000, matches = []) => {
  const categoryCounts = {};
  matches.forEach(match => {
    const category = match.topic_category || match.category || 'Open';
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
  });
  return [
    { format_key: 'Ranked Classic', rating: elo, matches_played: matches.length, peak_rating: Math.max(elo, 1000) },
    { format_key: 'Rapid', rating: Math.max(800, elo - 32), matches_played: Math.ceil(matches.length * 0.4), peak_rating: Math.max(1000, elo - 10) },
    ...Object.entries(categoryCounts).slice(0, 2).map(([category, count], index) => ({ format_key: category, rating: Math.max(800, elo - 18 - index * 16), matches_played: count, peak_rating: elo })),
  ];
};

const buildLocalOpponent = ({ topic, stance, message, round }) => {
  const thesis = topic || 'the proposed position';
  const prefix = round > 1 ? 'Your response is clearer, but it still leaves a central issue open.' : 'Let me test the strongest version of that claim.';
  const challenge = message?.length > 220
    ? 'Which single piece of evidence carries the most weight, and what would falsify your conclusion?'
    : 'You have asserted the conclusion, but the causal link is still thin. What evidence connects your premise to the outcome?';
  return `${prefix} On “${thesis},” ${stance === 'against' ? 'a supporter could argue' : 'a skeptic could argue'} that your position underestimates trade-offs and alternative causes. ${challenge}`;
};

export default function createProductRoutes({ supabase, generateWithRetry, advancedAi = true }) {
  const router = express.Router();

  const authenticate = async (req, res, next) => {
    const token = req.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
    if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });
    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) return res.status(401).json({ success: false, message: 'Session expired' });
      req.user = data.user;
      next();
    } catch (error) {
      return res.status(401).json({ success: false, message: 'Unable to verify session' });
    }
  };

  router.use(authenticate);

  router.get('/bootstrap', async (req, res) => {
    const userId = req.user.id;
    try {
      const [profiles, matches, storedProfiles, formatRatings, clubs, memberships, tournaments, entries, classrooms, assignments, scenarios, credentials, appeals, practice] = await Promise.all([
        safeRows(supabase.from('profiles').select('*').eq('id', userId).limit(1)),
        safeRows(supabase.from('matches').select('*').or(`critic_id.eq.${userId},defender_id.eq.${userId}`).order('created_at', { ascending: false }).limit(80)),
        safeRows(supabase.from('reasoning_profiles').select('*').eq('user_id', userId).limit(1)),
        safeRows(supabase.from('format_ratings').select('*').eq('user_id', userId).order('rating', { ascending: false })),
        safeRows(supabase.from('clubs').select('*').order('created_at', { ascending: false }).limit(12)),
        safeRows(supabase.from('club_members').select('*').eq('user_id', userId)),
        safeRows(supabase.from('tournaments').select('*').in('status', ['registration', 'live']).order('starts_at', { ascending: true }).limit(12)),
        safeRows(supabase.from('tournament_entries').select('*').eq('user_id', userId)),
        safeRows(supabase.from('classrooms').select('*').eq('teacher_id', userId).order('created_at', { ascending: false })),
        safeRows(supabase.from('assignments').select('*').eq('created_by', userId).order('created_at', { ascending: false }).limit(20)),
        safeRows(supabase.from('simulation_scenarios').select('*').eq('is_public', true).order('created_at', { ascending: true }), SCENARIO_FALLBACKS),
        safeRows(supabase.from('credentials').select('*').eq('user_id', userId).is('revoked_at', null).order('issued_at', { ascending: false })),
        safeRows(supabase.from('appeals').select('*').eq('appellant_id', userId).order('created_at', { ascending: false })),
        safeRows(supabase.from('practice_sessions').select('id, session_type, drill_id, scenario_key, scores, completed_at').eq('user_id', userId).order('completed_at', { ascending: false }).limit(20)),
      ]);

      const profile = profiles[0] || { id: userId, username: req.user.user_metadata?.username || req.user.email?.split('@')[0], elo_rating: 1000 };
      const reasoningProfile = storedProfiles[0] || computeReasoningProfile(matches, userId);
      const completedToday = practice.some(session => new Date(session.completed_at).toDateString() === new Date().toDateString());
      const dailyDrill = { ...(reasoningProfile.prescribed_drill || pickDrill(reasoningProfile.metrics)), completed: completedToday };
      const now = new Date();
      const endOfQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 1);
      const seasonProgress = Math.round(100 - ((endOfQuarter - now) / (92 * 86400000)) * 100);
      const effectiveTournaments = tournaments.length ? tournaments : TOURNAMENT_FALLBACKS;

      res.json({
        success: true,
        data: {
          profile,
          reasoningProfile,
          ratings: formatRatings.length ? formatRatings : defaultRatings(profile.elo_rating || 1000, matches),
          season: {
            name: 'Founders Season',
            division: (profile.elo_rating || 1000) >= 1500 ? 'Diamond' : (profile.elo_rating || 1000) >= 1200 ? 'Gold' : 'Silver',
            points: Math.max(0, (profile.elo_rating || 1000) - 900),
            progress: Math.max(3, Math.min(97, seasonProgress)),
            days_left: Math.max(1, Math.ceil((endOfQuarter - now) / 86400000)),
            placement_complete: matches.length >= 5,
          },
          dailyDrill,
          drills: DRILL_CATALOG,
          clubs: clubs.map(club => ({ ...club, joined: memberships.some(member => member.club_id === club.id) })),
          tournaments: effectiveTournaments.map(tournament => ({ ...tournament, joined: entries.some(entry => entry.tournament_id === tournament.id) })),
          classrooms,
          assignments,
          simulations: scenarios.length ? scenarios : SCENARIO_FALLBACKS,
          credentials,
          appeals,
          practice,
          trust: {
            judge_version: 'arena-panel-1.0',
            panel_size: 3,
            benchmark_status: 'Calibration dataset active',
            fairness_checks: ['Language', 'Accent', 'Ideology', 'Speaking order'],
            identity_blinding: true,
          },
        },
      });
    } catch (error) {
      console.error('[Arena OS] Bootstrap failed:', error);
      res.status(500).json({ success: false, message: 'Unable to load Arena OS' });
    }
  });

  router.post('/drills/:drillId/complete', async (req, res) => {
    const drill = DRILL_CATALOG.find(item => item.id === req.params.drillId);
    if (!drill) return res.status(404).json({ success: false, message: 'Drill not found' });
    const result = await safeRows(supabase.from('practice_sessions').insert({
      user_id: req.user.id,
      session_type: 'drill',
      drill_id: drill.id,
      duration_seconds: Number(req.body.duration_seconds) || drill.duration * 60,
      scores: { completed: true, metric: drill.metric },
    }).select(), null);
    if (result === null) return res.status(503).json({ success: false, message: 'Run migration 004_arena_os.sql to save practice progress.' });
    res.status(201).json({ success: true, session: result[0], drill });
  });

  router.post('/appeals', async (req, res) => {
    const { match_id, reason, disputed_dimensions = [] } = req.body;
    if (!isUuid(match_id) || !reason?.trim()) return res.status(400).json({ success: false, message: 'A match and reason are required' });
    const matchRows = await safeRows(supabase.from('matches').select('critic_id, defender_id, ai_scores').eq('id', match_id).limit(1));
    const match = matchRows[0];
    if (!match || ![match.critic_id, match.defender_id].includes(req.user.id)) return res.status(403).json({ success: false, message: 'Only match participants can appeal' });
    const rows = await safeRows(supabase.from('appeals').insert({
      match_id,
      appellant_id: req.user.id,
      reason: reason.trim().slice(0, 1600),
      disputed_dimensions: disputed_dimensions.slice(0, 6),
      judge_version_original: match.ai_scores?.result_metadata?.judge_version || 'legacy',
    }).select(), null);
    if (rows === null) return res.status(503).json({ success: false, message: 'Appeals storage is not configured yet.' });
    res.status(201).json({ success: true, appeal: rows[0] });
  });

  router.post('/clubs', async (req, res) => {
    const { name, description = '', institution = '', city = '', visibility = 'public' } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Club name is required' });
    const slug = `${slugify(name)}-${shortCode().toLowerCase()}`;
    const clubs = await safeRows(supabase.from('clubs').insert({
      name: name.trim().slice(0, 80), description: description.trim().slice(0, 400), institution: institution.trim().slice(0, 120), city: city.trim().slice(0, 80), visibility, owner_id: req.user.id, slug,
    }).select(), null);
    if (!clubs?.[0]) return res.status(503).json({ success: false, message: 'Club storage is not configured yet.' });
    await safeRows(supabase.from('club_members').insert({ club_id: clubs[0].id, user_id: req.user.id, role: 'owner' }));
    res.status(201).json({ success: true, club: { ...clubs[0], joined: true } });
  });

  router.post('/clubs/:clubId/join', async (req, res) => {
    if (!isUuid(req.params.clubId)) return res.status(400).json({ success: false, message: 'This featured club is not accepting public members yet.' });
    const rows = await safeRows(supabase.from('club_members').upsert({ club_id: req.params.clubId, user_id: req.user.id, role: 'member' }).select(), null);
    if (rows === null) return res.status(503).json({ success: false, message: 'Unable to join club' });
    res.status(201).json({ success: true, membership: rows[0] });
  });

  router.post('/tournaments/:tournamentId/join', async (req, res) => {
    let tournamentId = req.params.tournamentId;
    if (!isUuid(tournamentId)) {
      const featured = TOURNAMENT_FALLBACKS.find(item => item.id === tournamentId);
      if (!featured) return res.status(404).json({ success: false, message: 'Tournament not found' });
      const existing = await safeRows(supabase.from('tournaments').select('id').eq('title', featured.title).limit(1));
      if (existing[0]) tournamentId = existing[0].id;
      else {
        const created = await safeRows(supabase.from('tournaments').insert({ title: featured.title, description: featured.description, domain: featured.domain, format: featured.format, bracket_size: featured.bracket_size, starts_at: featured.starts_at, status: 'registration', verified: true }).select('id'), null);
        if (!created?.[0]) return res.status(503).json({ success: false, message: 'Tournament storage is not configured yet.' });
        tournamentId = created[0].id;
      }
    }
    const rows = await safeRows(supabase.from('tournament_entries').upsert({ tournament_id: tournamentId, user_id: req.user.id, status: 'registered' }).select(), null);
    if (rows === null) return res.status(503).json({ success: false, message: 'Unable to register' });
    res.status(201).json({ success: true, entry: rows[0], tournament_id: tournamentId });
  });

  router.post('/classrooms', async (req, res) => {
    const { name, term = '', ai_policy = 'disclose' } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Classroom name is required' });
    const rows = await safeRows(supabase.from('classrooms').insert({ teacher_id: req.user.id, name: name.trim().slice(0, 100), term: term.trim().slice(0, 60), ai_policy, join_code: `SA-${shortCode()}` }).select(), null);
    if (!rows?.[0]) return res.status(503).json({ success: false, message: 'Classroom storage is not configured yet.' });
    await safeRows(supabase.from('classroom_members').insert({ classroom_id: rows[0].id, user_id: req.user.id, role: 'teacher' }));
    res.status(201).json({ success: true, classroom: rows[0] });
  });

  router.post('/classrooms/:classroomId/assignments', async (req, res) => {
    if (!isUuid(req.params.classroomId)) return res.status(400).json({ success: false, message: 'Invalid classroom' });
    const classrooms = await safeRows(supabase.from('classrooms').select('id, default_rubric').eq('id', req.params.classroomId).eq('teacher_id', req.user.id).limit(1));
    if (!classrooms[0]) return res.status(403).json({ success: false, message: 'Only the classroom teacher can assign work' });
    const { title, topic, due_at, duration_minutes = 5, position_policy = 'random', rubric } = req.body;
    if (!title?.trim() || !topic?.trim()) return res.status(400).json({ success: false, message: 'Title and topic are required' });
    const rows = await safeRows(supabase.from('assignments').insert({ classroom_id: req.params.classroomId, created_by: req.user.id, title: title.trim().slice(0, 120), topic: topic.trim().slice(0, 500), due_at: due_at || null, duration_minutes: Number(duration_minutes) || 5, position_policy, rubric: rubric || classrooms[0].default_rubric }).select(), null);
    if (!rows?.[0]) return res.status(503).json({ success: false, message: 'Assignment storage is not configured yet.' });
    res.status(201).json({ success: true, assignment: rows[0] });
  });

  router.post('/practice/respond', async (req, res) => {
    const { topic, stance = 'for', message, history = [], scenario_key, round = 1 } = req.body;
    if (!message?.trim()) return res.status(400).json({ success: false, message: 'Your argument cannot be empty' });
    let response = '';
    if (advancedAi && process.env.GEMINI_API_KEY) {
      try {
        const transcript = history.slice(-6).map(turn => `${turn.role}: ${turn.text}`).join('\n');
        const prompt = `You are a rigorous but constructive sparring partner in Socratic Arena. The learner argues ${stance} the topic "${topic}"${scenario_key ? ` in scenario ${scenario_key}` : ''}. Give a direct counterargument in 70-120 words. Address their exact claim, identify one unsupported assumption, and end with one probing question. Do not score them and do not use markdown.\n\nPrior exchange:\n${transcript}\nLearner: ${message}`;
        response = (await generateWithRetry(prompt, 2, false)).trim();
      } catch (error) {
        console.warn('[Arena OS] Gemini practice response failed, using local opponent:', error.message);
      }
    }
    if (!response) response = buildLocalOpponent({ topic, stance, message, round });
    const wordCount = message.trim().split(/\s+/).length;
    const coachCue = wordCount < 35 ? 'Add the warrant: explain why your premise makes the conclusion more likely.' : wordCount > 180 ? 'Compress this to one claim, one proof point, and one direct rebuttal.' : 'Good working length. In the next turn, quote the opponent’s strongest claim before answering it.';
    res.json({ success: true, response, coachCue, round: Number(round) });
  });

  router.post('/practice/complete', async (req, res) => {
    const { topic, transcript = [], scenario_key = null, duration_seconds = 0 } = req.body;
    if (!Array.isArray(transcript) || !transcript.length) return res.status(400).json({ success: false, message: 'A transcript is required' });
    let result = null;
    if (advancedAi && process.env.GEMINI_API_KEY) {
      try {
        const debate = transcript.slice(-12).map(turn => `${turn.role}: ${turn.text}`).join('\n');
        const prompt = `Score this learner practice on a 0-100 scale. Return only JSON with: metrics containing exactly ${REASONING_METRICS.join(', ')}, overall, feedback (2 sentences), strengths (2 short strings), improvements (2 short strings). Reward direct response, truthful calibration, reliable evidence, and emotional control rather than vocabulary.\nTopic: ${topic}\n${debate}`;
        result = await generateWithRetry(prompt, 2, true);
      } catch (error) {
        console.warn('[Arena OS] Gemini practice scoring failed, using local scorer:', error.message);
      }
    }
    if (!result?.metrics) result = deterministicPracticeScore(transcript);
    result.metrics = Object.fromEntries(REASONING_METRICS.map(metric => [metric, Math.max(0, Math.min(100, Math.round(Number(result.metrics?.[metric]) || 0)))]));
    result.overall = Math.round(Number(result.overall) || Object.values(result.metrics).reduce((sum, value) => sum + value, 0) / REASONING_METRICS.length);
    result.recommended_drill = pickDrill(result.metrics);

    const rows = await safeRows(supabase.from('practice_sessions').insert({ user_id: req.user.id, session_type: scenario_key ? 'simulation' : 'ai_sparring', scenario_key, topic, transcript, scores: result, duration_seconds: Number(duration_seconds) || 0 }).select(), []);
    res.status(201).json({ success: true, result, session: rows[0] || null, persisted: Boolean(rows[0]) });
  });

  router.post('/moderation/reports', async (req, res) => {
    const { reported_user_id = null, match_id = null, category, details = '', evidence = {} } = req.body;
    if (!category?.trim()) return res.status(400).json({ success: false, message: 'Report category is required' });
    const rows = await safeRows(supabase.from('moderation_reports').insert({ reporter_id: req.user.id, reported_user_id: isUuid(reported_user_id) ? reported_user_id : null, match_id: isUuid(match_id) ? match_id : null, category: category.trim().slice(0, 80), details: details.trim().slice(0, 1200), evidence }).select(), null);
    if (!rows?.[0]) return res.status(503).json({ success: false, message: 'Moderation storage is not configured yet.' });
    res.status(201).json({ success: true, report: rows[0] });
  });

  router.post('/integrity/check', async (req, res) => {
    const text = String(req.body.text || '').trim();
    if (!text) return res.status(400).json({ success: false, message: 'Text is required' });
    const citations = (text.match(/https?:\/\/|\b(according to|et al\.|doi:|source:)\b/gi) || []).length;
    const claimSignals = (text.match(/\b(percent|study|research|data|report|survey|statistics)\b/gi) || []).length;
    const unverifiableClaims = Math.max(0, claimSignals - citations);
    res.json({ success: true, report: { citations_detected: citations, claims_requiring_sources: claimSignals, unverifiable_claims: unverifiableClaims, copied_text_check: 'Requires institution plagiarism provider', ai_authorship: 'Disclosure-based; automated authorship detection is not treated as proof', risk: unverifiableClaims > 2 ? 'review' : 'low' } });
  });

  return router;
}
