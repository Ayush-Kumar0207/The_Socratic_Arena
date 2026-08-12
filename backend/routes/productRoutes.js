import express from 'express';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import {
  DRILL_CATALOG,
  REASONING_METRICS,
  computeReasoningProfile,
  deterministicPracticeScore,
  pickDrill,
} from '../lib/reasoningProfile.js';
import {
  buildTranscriptText,
  computeCohortPercentile,
  nextTeamTurn,
  nextTournamentSlot,
  pickTeamSlot,
  seedTournamentEntries,
  signCredential,
} from '../lib/platformWorkflows.js';
import { verifyEvidence } from '../lib/evidenceVerifier.js';
import { createRateLimit } from '../lib/rateLimit.js';
import { JUDGE_PANEL, runBlindJudgePanel } from '../lib/judgePanel.js';
import { buildVerifiedTournamentResult } from '../lib/tournamentIntegrity.js';

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
const shortCode = (prefix = '') => `${prefix}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
const isMissingTable = error => /does not exist|schema cache|not configured/i.test(error?.message || '');
const cleanText = (value, max = 1600) => String(value || '').trim().slice(0, max);

const defaultRatings = (elo = 1000, matches = []) => [
  { format_key: 'Ranked Classic', rating: elo, matches_played: matches.length, peak_rating: Math.max(elo, 1000) },
  { format_key: 'Rapid', rating: Math.max(800, elo - 32), matches_played: Math.ceil(matches.length * 0.4), peak_rating: Math.max(1000, elo - 10) },
];

const buildLocalOpponent = ({ topic, stance, message, round }) => {
  const prefix = round > 1 ? 'Your response is clearer, but it still leaves a central issue open.' : 'Let me test the strongest version of that claim.';
  const challenge = message?.length > 220
    ? 'Which single piece of evidence carries the most weight, and what would falsify your conclusion?'
    : 'You have asserted the conclusion, but the causal link is still thin. What evidence connects your premise to the outcome?';
  return `${prefix} On “${topic || 'the proposed position'},” ${stance === 'against' ? 'a supporter could argue' : 'a skeptic could argue'} that your position underestimates trade-offs and alternative causes. ${challenge}`;
};

const csvCell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;

export default function createProductRoutes({ supabase, generateWithRetry, advancedAi = true }) {
  const router = express.Router();

  const authenticate = async (req, res, next) => {
    const token = req.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
    if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });
    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) return res.status(401).json({ success: false, message: 'Session expired' });
      req.user = data.user;
      req.accessToken = token;
      const actions = await safeRows(
        supabase.from('moderation_actions').select('*').eq('user_id', data.user.id).is('revoked_at', null).lte('starts_at', new Date().toISOString()).order('created_at', { ascending: false }),
      );
      req.moderationAction = actions.find(action => !action.expires_at || new Date(action.expires_at) > new Date()) || null;
      const appealSafe = req.path.startsWith('/moderation/my-') || /\/moderation\/actions\/[^/]+\/appeal$/.test(req.path);
      if (req.moderationAction && ['suspension', 'ban'].includes(req.moderationAction.action_type) && !appealSafe) {
        return res.status(403).json({
          success: false,
          code: 'ACCOUNT_RESTRICTED',
          message: req.moderationAction.action_type === 'ban' ? 'This account is banned.' : 'This account is temporarily suspended.',
          action: req.moderationAction,
        });
      }
      return next();
    } catch {
      return res.status(401).json({ success: false, message: 'Unable to verify session' });
    }
  };

  const isAdmin = async userId => Boolean((await safeRows(supabase.from('platform_admins').select('role').eq('user_id', userId).limit(1)))[0]);
  const requireAdmin = async (req, res, next) => (
    (await isAdmin(req.user.id)) ? next() : res.status(403).json({ success: false, message: 'Platform moderator access required' })
  );

  const issueCredential = async ({ userId, key, title, level = 'verified', type = 'skill', evidence = {}, issuerId = null }) => {
    const signingSecret = process.env.CREDENTIAL_SIGNING_SECRET || process.env.ADMIN_SECRET;
    if (!signingSecret) throw Object.assign(new Error('Credential signing is not configured'), { statusCode: 503 });
    const verificationCode = `SA-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    const issuedAt = new Date().toISOString();
    const credential = {
      user_id: userId,
      credential_key: key,
      title,
      level,
      credential_type: type,
      evidence,
      issuer_id: issuerId,
      verification_code: verificationCode,
      issued_at: issuedAt,
    };
    credential.signature = signCredential(credential, signingSecret);
    const { data, error } = await supabase.from('credentials').upsert(credential, { onConflict: 'user_id,credential_key' }).select().single();
    if (error) throw error;
    return data;
  };

  const judgeTeamDebate = async (debate) => {
    const turns = await safeRows(supabase.from('team_debate_turns').select('*').eq('debate_id', debate.id).order('turn_number'));
    const requiredTurns = Number(debate.max_rounds) * 4;
    if (turns.length !== requiredTurns) throw Object.assign(new Error(`A complete 2v2 transcript requires ${requiredTurns} turns`), { statusCode: 409 });

    const { verdicts, scores, winningSide } = await runBlindJudgePanel({
      topic: debate.topic,
      transcript: turns,
      generate: generateWithRetry,
      advancedAi,
      allowFallback: false,
      sideKeys: ['affirmative', 'negative'],
      sideLabels: ['the team supporting the motion', 'the team opposing the motion'],
      version: 'arena-panel-1.1',
    });

    const auditRows = verdicts.map((verdict, index) => ({
      debate_id: debate.id,
      judge_version: 'arena-panel-1.1',
      judge_role: verdict.judge || JUDGE_PANEL[index].role,
      verdict,
      confidence: Number(verdict.confidence) || null,
    }));
    const { error: auditError } = await supabase
      .from('team_judge_evaluations')
      .upsert(auditRows, { onConflict: 'debate_id,judge_role' });
    if (auditError) throw auditError;

    const finalizedAt = new Date().toISOString();
    const { data: completed, error: completionError } = await supabase.from('team_debates').update({
      status: 'completed',
      winning_side: winningSide,
      scores,
      judge_version: 'arena-panel-1.1',
      judging_error: null,
      completed_at: finalizedAt,
      result_finalized_at: finalizedAt,
    }).eq('id', debate.id).eq('status', 'judging').select().single();
    if (completionError || !completed) throw completionError || new Error('Team result was already finalized');

    const credentialWarnings = [];
    if (winningSide !== 'draw') {
      const winners = await safeRows(supabase.from('team_debate_members').select('user_id').eq('debate_id', debate.id).eq('side', winningSide));
      const outcomes = await Promise.allSettled(winners.map(winner => issueCredential({
        userId: winner.user_id,
        key: `team-debate:${debate.id}:winner`,
        title: 'Verified 2v2 Team Debate Winner',
        level: 'winner',
        type: 'team_competition',
        evidence: {
          debate_id: debate.id,
          judge_version: 'arena-panel-1.1',
          methodology: scores.result_metadata?.methodology,
          finalized_at: finalizedAt,
        },
      })));
      outcomes.forEach((outcome, index) => {
        if (outcome.status === 'rejected') credentialWarnings.push(`Credential issuance pending for ${winners[index].user_id}`);
      });
    }
    return { debate: completed, scores, winningSide, credentialWarnings };
  };

  const markTeamJudgingFailed = async (debateId, error) => {
    const publicError = cleanText(error?.message || 'The judge panel is temporarily unavailable', 240);
    await supabase.from('team_debates').update({ status: 'judging_failed', judging_error: publicError }).eq('id', debateId).eq('status', 'judging');
    return publicError;
  };

  const reviewAppeal = async (appeal, match) => {
    const original = match.ai_scores || {};
    const uncertainty = Number(original.result_metadata?.uncertainty) || 0;
    let resolution = {
      outcome: uncertainty >= 1.25 || !original.critic || !original.defender ? 'adjusted' : 'rejected',
      reason: uncertainty >= 1.25 ? 'The original panel disagreement exceeded the review threshold.' : 'The independent review found no material scoring error.',
      reviewed_dimensions: appeal.disputed_dimensions,
      original_preserved: true,
    };
    if (advancedAi && process.env.GEMINI_API_KEY && Array.isArray(match.transcript)) {
      try {
        const prompt = `You are an independent appeals judge. Review this blind debate result without seeing player identity. The original result must remain preserved. Decide only whether a material rubric error occurred. Return JSON: {"outcome":"upheld"|"adjusted"|"rejected","reason":"specific explanation","dimension_adjustments":{"logic":0},"confidence":0.0}. Adjustments must be integers from -2 to 2.\nAppeal: ${appeal.reason}\nDisputed dimensions: ${(appeal.disputed_dimensions || []).join(', ')}\nOriginal scores: ${JSON.stringify(original)}\nTranscript: ${match.transcript.slice(-40).map(turn => `${turn.speaker}: ${turn.text}`).join('\n')}`;
        const aiReview = await generateWithRetry(prompt, 3, true);
        if (['upheld', 'adjusted', 'rejected'].includes(aiReview?.outcome)) resolution = { ...resolution, ...aiReview, original_preserved: true };
      } catch (error) {
        console.warn('[Appeals] Independent AI review unavailable:', error.message);
      }
    }
    const status = ['upheld', 'adjusted', 'rejected'].includes(resolution.outcome) ? resolution.outcome : 'rejected';
    const judgeVersion = 'arena-appeals-1.0';
    await supabase.from('appeals').update({ status, resolution, judge_version_review: judgeVersion, resolved_at: new Date().toISOString() }).eq('id', appeal.id);
    await supabase.from('matches').update({ ai_scores: { ...original, appeal_review: resolution, result_metadata: { ...(original.result_metadata || {}), judge_version_review: judgeVersion, latest_appeal_status: status } } }).eq('id', match.id);
    return { status, resolution, judge_version_review: judgeVersion };
  };

  const advanceTournamentWinner = async (tournament, fixture) => {
    const totalRounds = Number(tournament.rules?.total_rounds) || Math.ceil(Math.log2(Number(tournament.rules?.bracket_size_actual || tournament.bracket_size) || 2));
    if (Number(fixture.round_number) >= totalRounds) {
      await supabase.from('tournaments').update({ status: 'completed', champion_user_id: fixture.winner_id, completed_at: new Date().toISOString() }).eq('id', tournament.id);
      if (fixture.winner_id) {
        await issueCredential({ userId: fixture.winner_id, key: `tournament:${tournament.id}:champion`, title: `${tournament.title} Champion`, level: 'champion', type: 'competition', evidence: { tournament_id: tournament.id, fixture_id: fixture.id } });
      }
      return;
    }
    const next = nextTournamentSlot(fixture);
    let target = (await safeRows(supabase.from('tournament_fixtures').select('*').eq('tournament_id', tournament.id).eq('round_number', next.roundNumber).eq('bracket_position', next.bracketPosition).limit(1)))[0];
    if (!target) {
      const payload = { tournament_id: tournament.id, round_number: next.roundNumber, bracket_position: next.bracketPosition, status: 'pending', [next.playerColumn]: fixture.winner_id };
      target = (await safeRows(supabase.from('tournament_fixtures').insert(payload).select(), []))[0];
    } else {
      const update = { [next.playerColumn]: fixture.winner_id };
      const otherColumn = next.playerColumn === 'player1_id' ? 'player2_id' : 'player1_id';
      if (target[otherColumn]) update.status = 'ready';
      target = (await safeRows(supabase.from('tournament_fixtures').update(update).eq('id', target.id).select(), []))[0] || { ...target, ...update };
    }
    const upstream = await safeRows(supabase.from('tournament_fixtures').select('status,winner_id').eq('tournament_id', tournament.id).eq('round_number', next.roundNumber - 1).in('bracket_position', [next.bracketPosition * 2 - 1, next.bracketPosition * 2]));
    if (upstream.length === 2 && upstream.every(item => ['completed', 'bye'].includes(item.status)) && Boolean(target.player1_id) !== Boolean(target.player2_id)) {
      const winnerId = target.player1_id || target.player2_id;
      const settled = (await safeRows(supabase.from('tournament_fixtures').update({ status: 'bye', winner_id: winnerId, completed_at: new Date().toISOString() }).eq('id', target.id).select(), []))[0];
      if (settled) await advanceTournamentWinner(tournament, settled);
    }
  };

  // Credential verification is intentionally public and reveals only the
  // credential/profile display identity, never email or private account data.
  router.get('/credentials/verify/:code', async (req, res) => {
    const rows = await safeRows(supabase.from('credentials').select('id,user_id,credential_key,title,level,credential_type,evidence,verification_code,issued_at,expires_at,revoked_at,signature').eq('verification_code', req.params.code).limit(1));
    const credential = rows[0];
    if (!credential) return res.status(404).json({ success: false, valid: false, message: 'Credential not found' });
    const profile = (await safeRows(supabase.from('profiles').select('username').eq('id', credential.user_id).limit(1)))[0];
    const expected = signCredential(credential, process.env.CREDENTIAL_SIGNING_SECRET || process.env.ADMIN_SECRET);
    const active = !credential.revoked_at && (!credential.expires_at || new Date(credential.expires_at) > new Date());
    return res.json({ success: true, valid: active && Boolean(expected) && expected === credential.signature, signature_verified: Boolean(expected) && expected === credential.signature, credential: { ...credential, username: profile?.username || 'Verified debater' } });
  });

  router.use(authenticate);
  router.use(createRateLimit({ name: 'product-api', max: 180, windowMs: 60_000 }));

  router.get('/bootstrap', async (req, res) => {
    const userId = req.user.id;
    try {
      const [profiles, matches, storedProfiles, cohortProfiles, formatRatings, clubs, memberships, tournaments, entries, classroomMemberships, teacherClassrooms, scenarios, credentials, appeals, practice, benchmarkRuns, moderationActions, moderationAppeals] = await Promise.all([
        safeRows(supabase.from('profiles').select('*').eq('id', userId).limit(1)),
        safeRows(supabase.from('matches').select('*').or(`critic_id.eq.${userId},defender_id.eq.${userId}`).order('created_at', { ascending: false }).limit(80)),
        safeRows(supabase.from('reasoning_profiles').select('*').eq('user_id', userId).limit(1)),
        safeRows(supabase.from('reasoning_profiles').select('overall').gt('match_count', 0)),
        safeRows(supabase.from('format_ratings').select('*').eq('user_id', userId).order('rating', { ascending: false })),
        safeRows(supabase.from('clubs').select('*').order('created_at', { ascending: false }).limit(20)),
        safeRows(supabase.from('club_members').select('*').eq('user_id', userId)),
        safeRows(supabase.from('tournaments').select('*').in('status', ['registration', 'live', 'completed']).order('starts_at', { ascending: false }).limit(20)),
        safeRows(supabase.from('tournament_entries').select('*').eq('user_id', userId)),
        safeRows(supabase.from('classroom_members').select('*').eq('user_id', userId)),
        safeRows(supabase.from('classrooms').select('*').eq('teacher_id', userId).order('created_at', { ascending: false })),
        safeRows(supabase.from('simulation_scenarios').select('*').eq('is_public', true).order('created_at', { ascending: true }), SCENARIO_FALLBACKS),
        safeRows(supabase.from('credentials').select('*').eq('user_id', userId).is('revoked_at', null).order('issued_at', { ascending: false })),
        safeRows(supabase.from('appeals').select('*').eq('appellant_id', userId).order('created_at', { ascending: false })),
        safeRows(supabase.from('practice_sessions').select('id,session_type,drill_id,scenario_key,scores,completed_at').eq('user_id', userId).order('completed_at', { ascending: false }).limit(20)),
        safeRows(supabase.from('judge_benchmark_runs').select('*').order('created_at', { ascending: false }).limit(1)),
        safeRows(supabase.from('moderation_actions').select('*').eq('user_id', userId).order('created_at', { ascending: false })),
        safeRows(supabase.from('moderation_appeals').select('*').eq('appellant_id', userId).order('created_at', { ascending: false })),
      ]);

      const classroomIds = [...new Set([...teacherClassrooms.map(item => item.id), ...classroomMemberships.map(item => item.classroom_id)])];
      const classrooms = classroomIds.length ? await safeRows(supabase.from('classrooms').select('*').in('id', classroomIds).order('created_at', { ascending: false })) : [];
      const assignments = classroomIds.length ? await safeRows(supabase.from('assignments').select('*').in('classroom_id', classroomIds).order('created_at', { ascending: false }).limit(50)) : [];
      const submissions = await safeRows(supabase.from('assignment_submissions').select('*').eq('student_id', userId).order('submitted_at', { ascending: false }));
      const profile = profiles[0] || { id: userId, username: req.user.user_metadata?.username || req.user.email?.split('@')[0], elo_rating: 1000 };
      const reasoningProfile = storedProfiles[0] || computeReasoningProfile(matches, userId);
      const cohort = computeCohortPercentile(reasoningProfile.overall, cohortProfiles.map(item => item.overall));
      reasoningProfile.percentile = cohort.percentile;
      reasoningProfile.cohort_size = cohort.cohortSize;
      const completedToday = practice.some(session => new Date(session.completed_at).toDateString() === new Date().toDateString());
      const dailyDrill = { ...(reasoningProfile.prescribed_drill || pickDrill(reasoningProfile.metrics)), completed: completedToday };
      const now = new Date();
      const endOfQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 1);
      const benchmark = benchmarkRuns[0] || null;
      const effectiveTournaments = tournaments.length ? tournaments : TOURNAMENT_FALLBACKS;
      const admin = await isAdmin(userId);
      const moderationQueue = admin ? {
        reports: await safeRows(supabase.from('moderation_reports').select('*').in('status', ['open', 'triaged']).order('created_at')),
        appeals: await safeRows(supabase.from('moderation_appeals').select('*').in('status', ['queued', 'reviewing']).order('created_at')),
      } : null;

      return res.json({ success: true, data: {
        profile,
        reasoningProfile,
        ratings: formatRatings.length ? formatRatings : defaultRatings(profile.elo_rating || 1000, matches),
        season: { name: 'Founders Season', division: (profile.elo_rating || 1000) >= 1500 ? 'Diamond' : (profile.elo_rating || 1000) >= 1200 ? 'Gold' : 'Silver', points: Math.max(0, (profile.elo_rating || 1000) - 900), progress: Math.max(3, Math.min(97, Math.round(100 - ((endOfQuarter - now) / (92 * 86400000)) * 100))), days_left: Math.max(1, Math.ceil((endOfQuarter - now) / 86400000)), placement_complete: matches.length >= 5 },
        dailyDrill,
        drills: DRILL_CATALOG,
        clubs: clubs.map(club => ({ ...club, joined: memberships.some(member => member.club_id === club.id) })),
        tournaments: effectiveTournaments.map(tournament => ({ ...tournament, joined: entries.some(entry => entry.tournament_id === tournament.id) })),
        classrooms: classrooms.map(classroom => ({ ...classroom, role: classroomMemberships.find(member => member.classroom_id === classroom.id)?.role || (classroom.teacher_id === userId ? 'teacher' : 'student') })),
        assignments: assignments.map(assignment => ({ ...assignment, submission: submissions.find(item => item.assignment_id === assignment.id) || null })),
        submissions,
        simulations: scenarios.length ? scenarios : SCENARIO_FALLBACKS,
        credentials,
        appeals,
        practice,
        moderation: { actions: moderationActions, appeals: moderationAppeals, active_action: req.moderationAction },
        admin: { is_admin: admin, moderation_queue: moderationQueue },
        trust: {
          judge_version: 'arena-panel-1.0',
          panel_size: 3,
          benchmark_status: benchmark ? (benchmark.passed ? 'Measured benchmark passed' : 'Measured benchmark needs review') : 'Benchmark runner ready — no published measurement',
          benchmark,
          fairness_checks: [
            { label: 'Language', measured: Boolean(benchmark), gap: benchmark?.language_parity_gap ?? null },
            { label: 'Accent proxy', measured: Boolean(benchmark), gap: benchmark?.accent_proxy_gap ?? null },
            { label: 'Ideology', measured: Boolean(benchmark), gap: benchmark?.ideology_parity_gap ?? null },
            { label: 'Speaking order', measured: Boolean(benchmark), gap: benchmark?.speaking_order_gap ?? null },
          ],
          identity_blinding: true,
        },
      } });
    } catch (error) {
      console.error('[Arena OS] Bootstrap failed:', error);
      return res.status(500).json({ success: false, message: 'Unable to load Arena OS' });
    }
  });

  router.post('/drills/:drillId/complete', async (req, res) => {
    const drill = DRILL_CATALOG.find(item => item.id === req.params.drillId);
    if (!drill) return res.status(404).json({ success: false, message: 'Drill not found' });
    const result = await safeRows(supabase.from('practice_sessions').insert({ user_id: req.user.id, session_type: 'drill', drill_id: drill.id, duration_seconds: Number(req.body.duration_seconds) || drill.duration * 60, scores: { completed: true, metric: drill.metric } }).select(), null);
    if (result === null) return res.status(503).json({ success: false, message: 'Arena OS practice storage is not configured.' });
    return res.status(201).json({ success: true, session: result[0], drill });
  });

  router.post('/appeals', createRateLimit({ name: 'appeals', max: 3, windowMs: 24 * 60 * 60_000 }), async (req, res) => {
    const { match_id, reason, disputed_dimensions = [] } = req.body;
    if (!isUuid(match_id) || !cleanText(reason)) return res.status(400).json({ success: false, message: 'A match and reason are required' });
    const match = (await safeRows(supabase.from('matches').select('*').eq('id', match_id).limit(1)))[0];
    if (!match || ![match.critic_id, match.defender_id].includes(req.user.id)) return res.status(403).json({ success: false, message: 'Only match participants can appeal' });
    const { data: appeal, error } = await supabase.from('appeals').insert({ match_id, appellant_id: req.user.id, reason: cleanText(reason), disputed_dimensions: disputed_dimensions.slice(0, 6), status: 'reviewing', judge_version_original: match.ai_scores?.result_metadata?.judge_version || 'legacy' }).select().single();
    if (error) return res.status(error.code === '23505' ? 409 : 503).json({ success: false, message: error.code === '23505' ? 'You already appealed this match' : 'Appeals storage is unavailable' });
    const review = await reviewAppeal(appeal, match);
    return res.status(201).json({ success: true, appeal: { ...appeal, ...review } });
  });

  router.post('/clubs', async (req, res) => {
    const { name, description = '', institution = '', city = '', visibility = 'public' } = req.body;
    if (!cleanText(name)) return res.status(400).json({ success: false, message: 'Club name is required' });
    const clubs = await safeRows(supabase.from('clubs').insert({ name: cleanText(name, 80), description: cleanText(description, 400), institution: cleanText(institution, 120), city: cleanText(city, 80), visibility, owner_id: req.user.id, slug: `${slugify(name)}-${shortCode().toLowerCase()}` }).select(), null);
    if (!clubs?.[0]) return res.status(503).json({ success: false, message: 'Club storage is unavailable' });
    await supabase.from('club_members').insert({ club_id: clubs[0].id, user_id: req.user.id, role: 'owner' });
    return res.status(201).json({ success: true, club: { ...clubs[0], joined: true } });
  });

  router.post('/clubs/:clubId/join', async (req, res) => {
    if (!isUuid(req.params.clubId)) return res.status(400).json({ success: false, message: 'This featured club is not accepting members yet' });
    const rows = await safeRows(supabase.from('club_members').upsert({ club_id: req.params.clubId, user_id: req.user.id, role: 'member' }).select(), null);
    return rows === null ? res.status(503).json({ success: false, message: 'Unable to join club' }) : res.status(201).json({ success: true, membership: rows[0] });
  });

  router.post('/tournaments', async (req, res) => {
    const title = cleanText(req.body.title, 120);
    if (!title) return res.status(400).json({ success: false, message: 'Tournament title is required' });
    const bracketSize = Math.min(64, Math.max(2, 2 ** Math.ceil(Math.log2(Number(req.body.bracket_size) || 8))));
    const { data, error } = await supabase.from('tournaments').insert({ owner_id: req.user.id, title, description: cleanText(req.body.description, 600), format: req.body.format || '1v1', domain: cleanText(req.body.domain, 80) || 'Open', bracket_size: bracketSize, starts_at: req.body.starts_at || new Date(Date.now() + 7 * 86400000).toISOString(), registration_ends_at: req.body.registration_ends_at || null, status: 'registration', rules: req.body.rules || {}, verified: false }).select().single();
    return error ? res.status(503).json({ success: false, message: 'Unable to create tournament' }) : res.status(201).json({ success: true, tournament: data });
  });

  router.post('/tournaments/:tournamentId/join', async (req, res) => {
    let tournamentId = req.params.tournamentId;
    if (!isUuid(tournamentId)) {
      const featured = TOURNAMENT_FALLBACKS.find(item => item.id === tournamentId);
      if (!featured) return res.status(404).json({ success: false, message: 'Tournament not found' });
      const existing = await safeRows(supabase.from('tournaments').select('id').eq('title', featured.title).limit(1));
      if (existing[0]) tournamentId = existing[0].id;
      else {
        const created = await safeRows(supabase.from('tournaments').insert({ owner_id: req.user.id, title: featured.title, description: featured.description, domain: featured.domain, format: featured.format, bracket_size: featured.bracket_size, starts_at: featured.starts_at, status: 'registration', verified: true }).select('id'), null);
        if (!created?.[0]) return res.status(503).json({ success: false, message: 'Tournament storage is unavailable' });
        tournamentId = created[0].id;
      }
    }
    const tournament = (await safeRows(supabase.from('tournaments').select('*').eq('id', tournamentId).limit(1)))[0];
    if (!tournament || tournament.status !== 'registration') return res.status(409).json({ success: false, message: 'Registration is closed' });
    const rows = await safeRows(supabase.from('tournament_entries').upsert({ tournament_id: tournamentId, user_id: req.user.id, club_id: isUuid(req.body.club_id) ? req.body.club_id : null, status: 'registered' }).select(), null);
    return rows === null ? res.status(503).json({ success: false, message: 'Unable to register' }) : res.status(201).json({ success: true, entry: rows[0], tournament_id: tournamentId });
  });

  router.post('/tournaments/:tournamentId/start', async (req, res) => {
    const tournament = (await safeRows(supabase.from('tournaments').select('*').eq('id', req.params.tournamentId).limit(1)))[0];
    if (!tournament) return res.status(404).json({ success: false, message: 'Tournament not found' });
    if (tournament.owner_id !== req.user.id && !(await isAdmin(req.user.id))) return res.status(403).json({ success: false, message: 'Only the tournament organizer can seed the bracket' });
    const entries = await safeRows(supabase.from('tournament_entries').select('*').eq('tournament_id', tournament.id).eq('status', 'registered'));
    if (entries.length < 2) return res.status(409).json({ success: false, message: 'At least two registered competitors are required' });
    const profiles = await safeRows(supabase.from('profiles').select('id,elo_rating').in('id', entries.map(entry => entry.user_id)));
    const seeded = seedTournamentEntries(entries.map(entry => ({ ...entry, elo_rating: profiles.find(profile => profile.id === entry.user_id)?.elo_rating || 1000 })), tournament.bracket_size);
    await supabase.from('tournament_fixtures').delete().eq('tournament_id', tournament.id);
    await Promise.all(seeded.entries.map(entry => supabase.from('tournament_entries').update({ seed: entry.seed, status: 'seeded' }).eq('tournament_id', tournament.id).eq('user_id', entry.user_id)));
    const fixtures = (await safeRows(supabase.from('tournament_fixtures').insert(seeded.fixtures.map(fixture => ({ ...fixture, tournament_id: tournament.id, completed_at: fixture.status === 'bye' ? new Date().toISOString() : null }))).select(), []));
    const updatedRules = { ...(tournament.rules || {}), bracket_size_actual: seeded.bracketSize, total_rounds: seeded.totalRounds, seeded_at: new Date().toISOString() };
    await supabase.from('tournaments').update({ status: 'live', rules: updatedRules }).eq('id', tournament.id);
    const liveTournament = { ...tournament, status: 'live', rules: updatedRules };
    for (const fixture of fixtures.filter(item => item.status === 'bye')) await advanceTournamentWinner(liveTournament, fixture);
    return res.json({ success: true, tournament: liveTournament, fixtures });
  });

  router.get('/tournaments/:tournamentId/bracket', async (req, res) => {
    const tournament = (await safeRows(supabase.from('tournaments').select('*').eq('id', req.params.tournamentId).limit(1)))[0];
    if (!tournament) return res.status(404).json({ success: false, message: 'Tournament not found' });
    const fixtures = await safeRows(supabase.from('tournament_fixtures').select('*').eq('tournament_id', tournament.id).order('round_number').order('bracket_position'));
    const userIds = [...new Set(fixtures.flatMap(item => [item.player1_id, item.player2_id, item.winner_id]).filter(Boolean))];
    const profiles = userIds.length ? await safeRows(supabase.from('profiles').select('id,username,elo_rating').in('id', userIds)) : [];
    return res.json({ success: true, tournament, fixtures, profiles });
  });

  router.post('/tournaments/:tournamentId/fixtures/:fixtureId/result', async (req, res) => {
    const tournament = (await safeRows(supabase.from('tournaments').select('*').eq('id', req.params.tournamentId).limit(1)))[0];
    const fixture = (await safeRows(supabase.from('tournament_fixtures').select('*').eq('id', req.params.fixtureId).eq('tournament_id', req.params.tournamentId).limit(1)))[0];
    if (!tournament || !fixture) return res.status(404).json({ success: false, message: 'Fixture not found' });
    if (tournament.owner_id !== req.user.id && !(await isAdmin(req.user.id))) return res.status(403).json({ success: false, message: 'Only the organizer can certify fixture results' });
    if (!isUuid(req.body.match_id)) return res.status(400).json({ success: false, message: 'A completed Socratic match ID is required for automatic verification' });
    const { data: match, error: matchError } = await supabase.from('matches')
      .select('id,status,critic_id,defender_id,winner_id,final_score_critic,final_score_defender,ai_scores')
      .eq('id', req.body.match_id)
      .single();
    if (matchError || !match) return res.status(404).json({ success: false, message: 'Linked match not found' });
    let verifiedResult;
    try {
      verifiedResult = buildVerifiedTournamentResult({ fixture, match, submittedWinnerId: req.body.winner_id });
    } catch (verificationError) {
      return res.status(verificationError.statusCode || 409).json({ success: false, message: verificationError.message });
    }
    const { data: settled, error } = await supabase.from('tournament_fixtures').update(verifiedResult).eq('id', fixture.id).in('status', ['ready', 'active']).select().single();
    if (error || !settled) return res.status(409).json({ success: false, message: 'Fixture is not ready or was already completed' });
    await advanceTournamentWinner(tournament, settled);
    return res.json({ success: true, fixture: settled });
  });

  router.post('/classrooms', async (req, res) => {
    const name = cleanText(req.body.name, 100);
    if (!name) return res.status(400).json({ success: false, message: 'Classroom name is required' });
    const rows = await safeRows(supabase.from('classrooms').insert({ teacher_id: req.user.id, name, term: cleanText(req.body.term, 60), ai_policy: req.body.ai_policy || 'disclose', join_code: shortCode('SA-'), default_rubric: req.body.default_rubric || undefined }).select(), null);
    if (!rows?.[0]) return res.status(503).json({ success: false, message: 'Classroom storage is unavailable' });
    await supabase.from('classroom_members').insert({ classroom_id: rows[0].id, user_id: req.user.id, role: 'teacher' });
    return res.status(201).json({ success: true, classroom: { ...rows[0], role: 'teacher' } });
  });

  router.post('/classrooms/join', async (req, res) => {
    const joinCode = cleanText(req.body.join_code, 24).toUpperCase();
    const classroom = (await safeRows(supabase.from('classrooms').select('*').eq('join_code', joinCode).limit(1)))[0];
    if (!classroom) return res.status(404).json({ success: false, message: 'Classroom join code not found' });
    const { data, error } = await supabase.from('classroom_members').upsert({ classroom_id: classroom.id, user_id: req.user.id, role: 'student' }).select().single();
    return error ? res.status(503).json({ success: false, message: 'Unable to join classroom' }) : res.status(201).json({ success: true, classroom: { ...classroom, role: 'student' }, membership: data });
  });

  router.post('/classrooms/:classroomId/assignments', async (req, res) => {
    const classroom = (await safeRows(supabase.from('classrooms').select('*').eq('id', req.params.classroomId).eq('teacher_id', req.user.id).limit(1)))[0];
    if (!classroom) return res.status(403).json({ success: false, message: 'Only the classroom teacher can assign work' });
    const title = cleanText(req.body.title, 120);
    const topic = cleanText(req.body.topic, 500);
    if (!title || !topic) return res.status(400).json({ success: false, message: 'Title and topic are required' });
    const rows = await safeRows(supabase.from('assignments').insert({ classroom_id: classroom.id, created_by: req.user.id, title, topic, due_at: req.body.due_at || null, duration_minutes: Number(req.body.duration_minutes) || 5, position_policy: req.body.position_policy || 'random', rubric: req.body.rubric || classroom.default_rubric, integrity_policy: req.body.integrity_policy || undefined }).select(), null);
    return rows?.[0] ? res.status(201).json({ success: true, assignment: rows[0] }) : res.status(503).json({ success: false, message: 'Assignment storage is unavailable' });
  });

  router.post('/assignments/:assignmentId/submit', createRateLimit({ name: 'assignment-submit', max: 10, windowMs: 60 * 60_000 }), async (req, res) => {
    const assignment = (await safeRows(supabase.from('assignments').select('*,classrooms(teacher_id,ai_policy)').eq('id', req.params.assignmentId).limit(1)))[0];
    if (!assignment || assignment.status !== 'published') return res.status(404).json({ success: false, message: 'Published assignment not found' });
    const membership = (await safeRows(supabase.from('classroom_members').select('role').eq('classroom_id', assignment.classroom_id).eq('user_id', req.user.id).limit(1)))[0];
    if (!membership || membership.role !== 'student') return res.status(403).json({ success: false, message: 'Join the classroom as a student before submitting' });
    const transcript = Array.isArray(req.body.transcript) && req.body.transcript.length ? req.body.transcript.slice(0, 40) : [{ role: 'user', text: cleanText(req.body.text, 8000) }];
    if (!transcript.some(turn => cleanText(turn.text))) return res.status(400).json({ success: false, message: 'A written or debate transcript submission is required' });
    const scores = deterministicPracticeScore(transcript);
    const integrityReport = await verifyEvidence(transcript.map(turn => turn.text).join('\n'));
    const { data, error } = await supabase.from('assignment_submissions').upsert({ assignment_id: assignment.id, student_id: req.user.id, transcript, scores, integrity_report: integrityReport, status: 'submitted', updated_at: new Date().toISOString() }, { onConflict: 'assignment_id,student_id' }).select().single();
    return error ? res.status(503).json({ success: false, message: 'Unable to save submission' }) : res.status(201).json({ success: true, submission: data });
  });

  router.patch('/assignments/:assignmentId/submissions/:submissionId/grade', async (req, res) => {
    const assignment = (await safeRows(supabase.from('assignments').select('*,classrooms!inner(teacher_id)').eq('id', req.params.assignmentId).limit(1)))[0];
    if (!assignment || assignment.classrooms?.teacher_id !== req.user.id) return res.status(403).json({ success: false, message: 'Only the classroom teacher can grade this work' });
    const grade = Math.min(100, Math.max(0, Number(req.body.grade)));
    if (!Number.isFinite(grade)) return res.status(400).json({ success: false, message: 'Grade must be between 0 and 100' });
    const { data, error } = await supabase.from('assignment_submissions').update({ grade, feedback: cleanText(req.body.feedback, 2000), status: 'graded', graded_by: req.user.id, graded_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', req.params.submissionId).eq('assignment_id', assignment.id).select().single();
    if (error || !data) return res.status(404).json({ success: false, message: 'Submission not found' });
    let credential = null;
    if (grade >= 70) credential = await issueCredential({ userId: data.student_id, key: `assignment:${assignment.id}`, title: `${assignment.title} — Verified Completion`, level: grade >= 90 ? 'distinction' : 'completed', type: 'education', evidence: { assignment_id: assignment.id, submission_id: data.id, grade }, issuerId: req.user.id });
    return res.json({ success: true, submission: data, credential });
  });

  router.get('/classrooms/:classroomId/analytics', async (req, res) => {
    const classroom = (await safeRows(supabase.from('classrooms').select('*').eq('id', req.params.classroomId).eq('teacher_id', req.user.id).limit(1)))[0];
    if (!classroom) return res.status(403).json({ success: false, message: 'Only the classroom teacher can view analytics' });
    const assignments = await safeRows(supabase.from('assignments').select('*').eq('classroom_id', classroom.id));
    const assignmentIds = assignments.map(item => item.id);
    const submissions = assignmentIds.length ? await safeRows(supabase.from('assignment_submissions').select('*').in('assignment_id', assignmentIds)) : [];
    const members = await safeRows(supabase.from('classroom_members').select('*').eq('classroom_id', classroom.id).eq('role', 'student'));
    const profiles = members.length ? await safeRows(supabase.from('profiles').select('id,username').in('id', members.map(item => item.user_id))) : [];
    const rows = submissions.map(submission => ({ id: submission.id, assignment_id: submission.assignment_id, student_id: submission.student_id, student: profiles.find(profile => profile.id === submission.student_id)?.username || submission.student_id, assignment: assignments.find(item => item.id === submission.assignment_id)?.title || submission.assignment_id, status: submission.status, grade: submission.grade, integrity_risk: submission.integrity_report?.risk || 'unknown', submitted_at: submission.submitted_at }));
    if (req.query.format === 'csv') {
      const csv = [['Student', 'Assignment', 'Status', 'Grade', 'Integrity risk', 'Submitted at'], ...rows.map(row => [row.student, row.assignment, row.status, row.grade, row.integrity_risk, row.submitted_at])].map(row => row.map(csvCell).join(',')).join('\n');
      res.type('text/csv').attachment(`${slugify(classroom.name)}-analytics.csv`);
      return res.send(csv);
    }
    const graded = rows.filter(row => Number.isFinite(Number(row.grade)));
    return res.json({ success: true, classroom, assignments, rows, summary: { students: members.length, assignments: assignments.length, submissions: submissions.length, completion_rate: assignments.length && members.length ? Math.round((submissions.length / (assignments.length * members.length)) * 100) : 0, average_grade: graded.length ? Math.round(graded.reduce((sum, row) => sum + Number(row.grade), 0) / graded.length) : null } });
  });

  router.post('/practice/respond', async (req, res) => {
    const { topic, stance = 'for', message, history = [], scenario_key, round = 1 } = req.body;
    if (!cleanText(message)) return res.status(400).json({ success: false, message: 'Your argument cannot be empty' });
    let response = '';
    if (advancedAi && process.env.GEMINI_API_KEY) {
      try {
        const prompt = `You are a rigorous but constructive sparring partner. The learner argues ${stance} "${topic}"${scenario_key ? ` in ${scenario_key}` : ''}. Give a direct 70-120 word counterargument, identify one unsupported assumption, and end with one probing question. No markdown.\n${history.slice(-6).map(turn => `${turn.role}: ${turn.text}`).join('\n')}\nLearner: ${message}`;
        response = cleanText(await generateWithRetry(prompt, 2, false), 1200);
      } catch (error) { console.warn('[Practice] AI fallback:', error.message); }
    }
    if (!response) response = buildLocalOpponent({ topic, stance, message, round });
    const wordCount = cleanText(message, 10000).split(/\s+/).length;
    const coachCue = wordCount < 35 ? 'Add the warrant: explain why your premise makes the conclusion more likely.' : wordCount > 180 ? 'Compress this to one claim, one proof point, and one direct rebuttal.' : 'Good working length. Quote the opponent’s strongest claim before answering it.';
    return res.json({ success: true, response, coachCue, round: Number(round) });
  });

  router.post('/practice/complete', async (req, res) => {
    const { topic, transcript = [], scenario_key = null, duration_seconds = 0 } = req.body;
    if (!Array.isArray(transcript) || !transcript.length) return res.status(400).json({ success: false, message: 'A transcript is required' });
    let result = null;
    if (advancedAi && process.env.GEMINI_API_KEY) {
      try {
        const prompt = `Score this practice 0-100. Return only JSON with metrics containing exactly ${REASONING_METRICS.join(', ')}, overall, feedback, strengths (2), improvements (2). Reward direct response, truthful calibration, reliable evidence, and emotional control.\nTopic: ${topic}\n${transcript.slice(-12).map(turn => `${turn.role}: ${turn.text}`).join('\n')}`;
        result = await generateWithRetry(prompt, 2, true);
      } catch (error) { console.warn('[Practice] Scoring fallback:', error.message); }
    }
    if (!result?.metrics) result = deterministicPracticeScore(transcript);
    result.metrics = Object.fromEntries(REASONING_METRICS.map(metric => [metric, Math.max(0, Math.min(100, Math.round(Number(result.metrics?.[metric]) || 0)))]));
    result.overall = Math.round(Number(result.overall) || Object.values(result.metrics).reduce((sum, value) => sum + value, 0) / REASONING_METRICS.length);
    result.recommended_drill = pickDrill(result.metrics);
    const rows = await safeRows(supabase.from('practice_sessions').insert({ user_id: req.user.id, session_type: scenario_key ? 'simulation' : 'ai_sparring', scenario_key, topic: cleanText(topic, 500), transcript: transcript.slice(-30), scores: result, duration_seconds: Number(duration_seconds) || 0 }).select(), []);
    return res.status(201).json({ success: true, result, session: rows[0] || null, persisted: Boolean(rows[0]) });
  });

  router.post('/moderation/reports', async (req, res) => {
    const category = cleanText(req.body.category, 80);
    if (!category) return res.status(400).json({ success: false, message: 'Report category is required' });
    const rows = await safeRows(supabase.from('moderation_reports').insert({ reporter_id: req.user.id, reported_user_id: isUuid(req.body.reported_user_id) ? req.body.reported_user_id : null, match_id: isUuid(req.body.match_id) ? req.body.match_id : null, category, details: cleanText(req.body.details, 1200), evidence: req.body.evidence || {} }).select(), null);
    return rows?.[0] ? res.status(201).json({ success: true, report: rows[0] }) : res.status(503).json({ success: false, message: 'Moderation storage is unavailable' });
  });

  router.get('/moderation/my-actions', async (req, res) => {
    const actions = await safeRows(supabase.from('moderation_actions').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }));
    const appeals = await safeRows(supabase.from('moderation_appeals').select('*').eq('appellant_id', req.user.id).order('created_at', { ascending: false }));
    return res.json({ success: true, actions, appeals });
  });

  router.post('/moderation/actions/:actionId/appeal', async (req, res) => {
    const action = (await safeRows(supabase.from('moderation_actions').select('*').eq('id', req.params.actionId).eq('user_id', req.user.id).limit(1)))[0];
    if (!action) return res.status(404).json({ success: false, message: 'Moderation action not found' });
    const reason = cleanText(req.body.reason, 2000);
    if (!reason) return res.status(400).json({ success: false, message: 'Appeal reason is required' });
    const { data, error } = await supabase.from('moderation_appeals').insert({ action_id: action.id, appellant_id: req.user.id, reason }).select().single();
    return error ? res.status(error.code === '23505' ? 409 : 503).json({ success: false, message: error.code === '23505' ? 'This action is already appealed' : 'Unable to file appeal' }) : res.status(201).json({ success: true, appeal: data });
  });

  router.get('/admin/moderation', requireAdmin, async (_req, res) => {
    const [reports, appeals] = await Promise.all([
      safeRows(supabase.from('moderation_reports').select('*').in('status', ['open', 'triaged']).order('created_at')),
      safeRows(supabase.from('moderation_appeals').select('*').in('status', ['queued', 'reviewing']).order('created_at')),
    ]);
    return res.json({ success: true, reports, appeals });
  });

  router.post('/admin/moderation/reports/:reportId/resolve', requireAdmin, async (req, res) => {
    const report = (await safeRows(supabase.from('moderation_reports').select('*').eq('id', req.params.reportId).limit(1)))[0];
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
    const outcome = req.body.outcome === 'dismissed' ? 'dismissed' : 'actioned';
    let action = null;
    if (outcome === 'actioned') {
      if (!report.reported_user_id || !['warning', 'suspension', 'ban'].includes(req.body.action_type)) return res.status(400).json({ success: false, message: 'A reported user and valid action are required' });
      const expiresAt = req.body.action_type === 'suspension' ? new Date(Date.now() + Math.min(90, Math.max(1, Number(req.body.duration_days) || 7)) * 86400000).toISOString() : null;
      const created = await safeRows(supabase.from('moderation_actions').insert({ report_id: report.id, user_id: report.reported_user_id, action_type: req.body.action_type, reason: cleanText(req.body.reason, 1200) || report.details || report.category, issued_by: req.user.id, expires_at: expiresAt }).select(), null);
      action = created?.[0] || null;
      if (!action) return res.status(503).json({ success: false, message: 'Unable to enforce moderation action' });
    }
    await supabase.from('moderation_reports').update({ status: outcome, resolved_at: new Date().toISOString() }).eq('id', report.id);
    return res.json({ success: true, report: { ...report, status: outcome }, action });
  });

  router.post('/admin/moderation/appeals/:appealId/resolve', requireAdmin, async (req, res) => {
    const appeal = (await safeRows(supabase.from('moderation_appeals').select('*').eq('id', req.params.appealId).limit(1)))[0];
    if (!appeal) return res.status(404).json({ success: false, message: 'Appeal not found' });
    const status = req.body.uphold_action ? 'rejected' : 'upheld';
    if (status === 'upheld') await supabase.from('moderation_actions').update({ revoked_at: new Date().toISOString() }).eq('id', appeal.action_id);
    const { data } = await supabase.from('moderation_appeals').update({ status, resolution: cleanText(req.body.resolution, 1600), reviewed_by: req.user.id, resolved_at: new Date().toISOString() }).eq('id', appeal.id).select().single();
    return res.json({ success: true, appeal: data });
  });

  router.post('/integrity/check', createRateLimit({ name: 'evidence-check', max: 20, windowMs: 60 * 60_000 }), async (req, res) => {
    const text = cleanText(req.body.text, 20_000);
    if (!text) return res.status(400).json({ success: false, message: 'Text is required' });
    const report = await verifyEvidence(text);
    const inputHash = crypto.createHash('sha256').update(text).digest('hex');
    await supabase.from('evidence_verifications').insert({ user_id: req.user.id, match_id: isUuid(req.body.match_id) ? req.body.match_id : null, input_hash: inputHash, claims: report.claims, sources: report.sources, risk: report.risk });
    return res.json({ success: true, report });
  });

  router.post('/matches/:matchId/vote', createRateLimit({ name: 'audience-vote', max: 20, windowMs: 60 * 60_000 }), async (req, res) => {
    if (!isUuid(req.params.matchId) || !isUuid(req.body.voted_for)) return res.status(400).json({ success: false, message: 'Valid match and candidate IDs are required' });
    const { data, error } = await supabase.rpc('cast_match_vote_service', { p_match_id: req.params.matchId, p_voted_for: req.body.voted_for, p_voter_id: req.user.id });
    if (error) return res.status(/already/i.test(error.message) ? 409 : /participant|closed|candidate/i.test(error.message) ? 400 : 503).json({ success: false, message: error.message });
    return res.status(201).json({ success: true, counts: data });
  });

  router.get('/matches/:matchId/vote', async (req, res) => {
    const [votes, matches] = await Promise.all([
      safeRows(supabase.from('votes').select('id,voted_for').eq('match_id', req.params.matchId).eq('voter_id', req.user.id).limit(1)),
      safeRows(supabase.from('matches').select('audience_votes_critic,audience_votes_defender,status').eq('id', req.params.matchId).limit(1)),
    ]);
    return matches[0] ? res.json({ success: true, has_voted: Boolean(votes[0]), vote: votes[0] || null, match: matches[0] }) : res.status(404).json({ success: false, message: 'Match not found' });
  });

  router.get('/matches/:matchId/export', async (req, res) => {
    const match = (await safeRows(supabase.from('matches').select('*').eq('id', req.params.matchId).limit(1)))[0];
    if (!match) return res.status(404).json({ success: false, message: 'Match not found' });
    const transcript = buildTranscriptText(match);
    const baseName = `socratic-arena-${String(match.id).slice(0, 8)}`;
    if (req.query.format === 'pdf') {
      res.type('application/pdf').attachment(`${baseName}.pdf`);
      const document = new PDFDocument({ margin: 54, info: { Title: `Socratic Arena — ${match.topic}`, Author: 'The Socratic Arena' } });
      document.pipe(res);
      document.fontSize(18).fillColor('#0f172a').text('The Socratic Arena', { align: 'center' });
      document.moveDown(0.5).fontSize(11).fillColor('#334155').text(transcript, { lineGap: 4 });
      document.end();
      return;
    }
    res.type('text/plain').attachment(`${baseName}.txt`);
    return res.send(transcript);
  });

  router.post('/credentials/issue/reasoning', async (req, res) => {
    const profile = (await safeRows(supabase.from('reasoning_profiles').select('*').eq('user_id', req.user.id).limit(1)))[0];
    if (!profile || profile.match_count < 5 || profile.confidence < 60) return res.status(409).json({ success: false, message: 'Complete at least five judged matches and reach 60% profile confidence first' });
    try {
      const credential = await issueCredential({ userId: req.user.id, key: `reasoning-profile:${Math.floor(profile.overall / 10) * 10}`, title: 'Verified Reasoning Profile', level: profile.overall >= 80 ? 'advanced' : profile.overall >= 65 ? 'proficient' : 'foundation', type: 'reasoning', evidence: { overall: profile.overall, match_count: profile.match_count, confidence: profile.confidence, cohort_percentile: profile.percentile, cohort_size: profile.cohort_size } });
      return res.status(201).json({ success: true, credential });
    } catch (error) {
      return res.status(503).json({ success: false, message: 'Unable to issue credential' });
    }
  });

  router.post('/team-debates', async (req, res) => {
    const topic = cleanText(req.body.topic, 500);
    if (!topic) return res.status(400).json({ success: false, message: 'Team debate topic is required' });
    const { data: debate, error } = await supabase.from('team_debates').insert({ arena_code: shortCode('TEAM-'), topic, created_by: req.user.id, max_rounds: Math.min(5, Math.max(1, Number(req.body.max_rounds) || 2)) }).select().single();
    if (error) return res.status(isMissingTable(error) ? 503 : 500).json({ success: false, message: 'Unable to create team debate' });
    const { data: membership } = await supabase.from('team_debate_members').insert({ debate_id: debate.id, user_id: req.user.id, side: req.body.side === 'negative' ? 'negative' : 'affirmative', position: 1 }).select().single();
    return res.status(201).json({ success: true, debate, membership });
  });

  router.post('/team-debates/join', async (req, res) => {
    const debate = (await safeRows(supabase.from('team_debates').select('*').eq('arena_code', cleanText(req.body.arena_code, 24).toUpperCase()).limit(1)))[0];
    if (!debate || debate.status !== 'waiting') return res.status(404).json({ success: false, message: 'Open team arena not found' });
    const members = await safeRows(supabase.from('team_debate_members').select('*').eq('debate_id', debate.id));
    if (members.some(member => member.user_id === req.user.id)) return res.json({ success: true, debate, membership: members.find(member => member.user_id === req.user.id) });
    const slot = pickTeamSlot(members, req.body.side);
    if (!slot) return res.status(409).json({ success: false, message: 'This 2v2 arena is full' });
    const { data: membership, error } = await supabase.from('team_debate_members').insert({ debate_id: debate.id, user_id: req.user.id, ...slot }).select().single();
    if (error) return res.status(409).json({ success: false, message: 'That team slot was just filled; retry' });
    if (members.length + 1 === 4) await supabase.from('team_debates').update({ status: 'active', started_at: new Date().toISOString() }).eq('id', debate.id);
    return res.status(201).json({ success: true, debate: { ...debate, status: members.length + 1 === 4 ? 'active' : 'waiting' }, membership });
  });

  router.get('/team-debates/:debateId', async (req, res) => {
    const debate = (await safeRows(supabase.from('team_debates').select('*').eq('id', req.params.debateId).limit(1)))[0];
    if (!debate) return res.status(404).json({ success: false, message: 'Team debate not found' });
    const members = await safeRows(supabase.from('team_debate_members').select('*').eq('debate_id', debate.id));
    if (!members.some(member => member.user_id === req.user.id)) return res.status(403).json({ success: false, message: 'Only team members can enter this arena' });
    const profiles = await safeRows(supabase.from('profiles').select('id,username,elo_rating').in('id', members.map(member => member.user_id)));
    const turns = await safeRows(supabase.from('team_debate_turns').select('*').eq('debate_id', debate.id).order('turn_number'));
    return res.json({ success: true, debate, members, profiles, turns, me: members.find(member => member.user_id === req.user.id) });
  });

  router.post('/team-debates/:debateId/turns', createRateLimit({ name: 'team-turn', max: 20, windowMs: 60_000 }), async (req, res) => {
    const debate = (await safeRows(supabase.from('team_debates').select('*').eq('id', req.params.debateId).limit(1)))[0];
    const member = (await safeRows(supabase.from('team_debate_members').select('*').eq('debate_id', req.params.debateId).eq('user_id', req.user.id).limit(1)))[0];
    if (!debate || !member) return res.status(404).json({ success: false, message: 'Team arena not found' });
    if (debate.status !== 'active') return res.status(409).json({ success: false, message: 'The debate starts when all four speakers join' });
    if (member.side !== debate.active_side || Number(member.position) !== Number(debate.active_position)) return res.status(409).json({ success: false, message: 'It is another teammate’s turn' });
    const text = cleanText(req.body.text, 4000);
    if (!text) return res.status(400).json({ success: false, message: 'Turn text is required' });
    const evidence = await verifyEvidence(text);
    const { data: turn, error } = await supabase.from('team_debate_turns').insert({ debate_id: debate.id, user_id: req.user.id, side: member.side, position: member.position, turn_number: debate.turn_number, text, evidence }).select().single();
    if (error) return res.status(409).json({ success: false, message: 'This turn was already submitted' });
    const next = nextTeamTurn(debate);
    if (next.completed) {
      const { data: judging, error: claimError } = await supabase.from('team_debates').update({
        status: 'judging',
        judging_started_at: new Date().toISOString(),
        judging_error: null,
      }).eq('id', debate.id).eq('status', 'active').eq('turn_number', debate.turn_number).select().single();
      if (claimError || !judging) return res.status(409).json({ success: false, message: 'The final turn is already being judged' });
      try {
        const result = await judgeTeamDebate(judging);
        return res.status(201).json({ success: true, turn, completed: true, winning_side: result.winningSide, scores: result.scores, credential_warnings: result.credentialWarnings });
      } catch (judgeError) {
        const judgingError = await markTeamJudgingFailed(debate.id, judgeError);
        return res.status(judgeError.statusCode || 503).json({ success: false, turn, completed: false, judging_failed: true, message: judgingError });
      }
    }
    await supabase.from('team_debates').update({ active_side: next.side, active_position: next.position, turn_number: next.turnNumber }).eq('id', debate.id).eq('turn_number', debate.turn_number);
    return res.status(201).json({ success: true, turn, completed: false, next });
  });

  router.post('/team-debates/:debateId/judge', createRateLimit({ name: 'team-judge-retry', max: 3, windowMs: 10 * 60_000 }), async (req, res) => {
    const debate = (await safeRows(supabase.from('team_debates').select('*').eq('id', req.params.debateId).limit(1)))[0];
    const member = (await safeRows(supabase.from('team_debate_members').select('user_id').eq('debate_id', req.params.debateId).eq('user_id', req.user.id).limit(1)))[0];
    if (!debate || !member) return res.status(404).json({ success: false, message: 'Team arena not found' });
    if (debate.status !== 'judging_failed') return res.status(409).json({ success: false, message: 'Only a failed panel judgment can be retried' });
    const { data: judging, error: claimError } = await supabase.from('team_debates').update({
      status: 'judging',
      judging_started_at: new Date().toISOString(),
      judging_error: null,
    }).eq('id', debate.id).eq('status', 'judging_failed').select().single();
    if (claimError || !judging) return res.status(409).json({ success: false, message: 'Another member already restarted the judge panel' });
    try {
      const result = await judgeTeamDebate(judging);
      return res.json({ success: true, completed: true, debate: result.debate, winning_side: result.winningSide, scores: result.scores, credential_warnings: result.credentialWarnings });
    } catch (judgeError) {
      const judgingError = await markTeamJudgingFailed(debate.id, judgeError);
      return res.status(judgeError.statusCode || 503).json({ success: false, judging_failed: true, message: judgingError });
    }
  });

  return router;
}
