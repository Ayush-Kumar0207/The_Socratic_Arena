import express from 'express';
import crypto from 'crypto';
import { commercialModeEnabled, getPublicPlanCatalog, resolveCheckoutProduct } from '../lib/commercialConfig.js';
import { createCommercialService } from '../lib/commercialService.js';
import { createBillingService } from '../services/billing/index.js';
import { createRateLimit } from '../lib/rateLimit.js';
import { resolveTrustedRequestCountry } from '../lib/billingRegion.js';
import { unwrapMeasuredProviderResult } from '../lib/providerUsage.js';

const cleanText = (value, max = 2000) => String(value || '').trim().slice(0, max);
const slugify = value => cleanText(value, 80).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 63);
const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
const boundedNumber = (value, min, max) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : null;
const transcriptMetrics = (transcript, durationSeconds) => {
  const words = transcript.match(/[\p{L}\p{N}'’-]+/gu) || [];
  const fillers = transcript.match(/\b(?:um+|uh+|erm+|hmm+|like|you know|sort of|kind of)\b/gi) || [];
  const minutes = Math.max(1 / 60, durationSeconds / 60);
  return { wordCount: words.length, wordsPerMinute: Number((words.length / minutes).toFixed(1)), fillerCount: fillers.length, fillersPerMinute: Number((fillers.length / minutes).toFixed(1)) };
};
const sanitizeAcousticMetrics = (value, transcript, durationSeconds) => {
  if (!value || typeof value !== 'object' || value.version !== 'browser-acoustic-v1') return null;
  const metrics = {
    version: 'browser-acoustic-v1',
    durationSeconds: boundedNumber(value.durationSeconds, 1, 3600),
    sampleRate: boundedNumber(value.sampleRate, 8000, 192000),
    channelCount: boundedNumber(value.channelCount, 1, 8),
    analyzedFrames: boundedNumber(value.analyzedFrames, 1, 500000),
    voicedRatio: boundedNumber(value.voicedRatio, 0, 1),
    pauseCount: boundedNumber(value.pauseCount, 0, 10000),
    hesitationPauseCount: boundedNumber(value.hesitationPauseCount, 0, 10000),
    longPauseCount: boundedNumber(value.longPauseCount, 0, 10000),
    averagePauseSeconds: boundedNumber(value.averagePauseSeconds, 0, 3600),
    longestPauseSeconds: boundedNumber(value.longestPauseSeconds, 0, 3600),
    pitchMeanHz: boundedNumber(value.pitchMeanHz, 0, 1000),
    pitchVariationSemitones: boundedNumber(value.pitchVariationSemitones, 0, 48),
    pitchSamples: boundedNumber(value.pitchSamples, 0, 500000),
    volumeMeanRms: boundedNumber(value.volumeMeanRms, 0, 1),
    volumeVariation: boundedNumber(value.volumeVariation, 0, 20),
    dynamicRangeDb: boundedNumber(value.dynamicRangeDb, 0, 120),
    abruptCutoffIndicator: Boolean(value.abruptCutoffIndicator),
    pauses: Array.isArray(value.pauses) ? value.pauses.slice(0, 40).map(item => ({ startSeconds: boundedNumber(item?.startSeconds, 0, 3600), durationSeconds: boundedNumber(item?.durationSeconds, 0, 3600) })).filter(item => item.startSeconds !== null && item.durationSeconds !== null) : [],
  };
  if (!metrics.durationSeconds || !metrics.sampleRate || !metrics.analyzedFrames) return null;
  return { ...metrics, ...transcriptMetrics(transcript, durationSeconds) };
};

const jsonError = (res, error) => res.status(error.statusCode || 500).json({
  success: false,
  code: error.code || 'COMMERCIAL_ERROR',
  message: error.statusCode && error.statusCode < 500 ? error.message : 'The commercial service is temporarily unavailable.',
  requiredEntitlement: error.requiredEntitlement,
});

const rows = async builder => {
  const { data, error } = await builder;
  if (error) throw error;
  return data || [];
};

const authenticate = supabase => async (req, res, next) => {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ success: false, message: 'Session expired' });
  req.user = data.user;
  return next();
};

const getOwnedMatch = async (supabase, userId, matchId) => {
  if (!isUuid(matchId)) throw Object.assign(new Error('A valid match is required.'), { statusCode: 400, code: 'INVALID_MATCH' });
  const matches = await rows(supabase.from('matches').select('id,topic,transcript,ai_scores,highlights,status,critic_id,defender_id,created_at').eq('id', matchId).or(`critic_id.eq.${userId},defender_id.eq.${userId}`).limit(1));
  if (!matches[0]) throw Object.assign(new Error('Match not found or access denied.'), { statusCode: 404, code: 'MATCH_NOT_FOUND' });
  return matches[0];
};

export default function createCommercialRoutes({ supabase, generateWithRetry }) {
  const router = express.Router();
  const commercial = createCommercialService({ supabase });
  const billing = createBillingService();
  const requirePlatformAdmin = async (req, res, next) => {
    try {
      const admins = await rows(supabase.from('platform_admins').select('role').eq('user_id', req.user.id).limit(1));
      return admins[0] ? next() : res.status(403).json({ success: false, message: 'Platform administrator access required.' });
    } catch (error) {
      return jsonError(res, error);
    }
  };

  router.get('/catalog', (req, res) => res.json({
    success: true,
    ...getPublicPlanCatalog({ countryCode: req.query.country, currency: req.query.currency }),
  }));

  // Catalog is deliberately public and database-free. Every other commercial
  // route fails closed while the feature is disabled, before auth or DB access.
  router.use((req, res, next) => commercialModeEnabled()
    ? next()
    : res.status(404).json({ success: false, code: 'COMMERCIAL_MODE_DISABLED', message: 'Commercial features are not enabled in this environment.' }));

  router.use(authenticate(supabase));
  router.use(createRateLimit({ name: 'commercial-user', max: 180, windowMs: 10 * 60_000, key: req => req.user.id }));

  router.get('/me', async (req, res) => {
    try {
      const data = await commercial.snapshot(req.user.id, { countryCode: req.query.country, currency: req.query.currency });
      return res.json({ success: true, data });
    } catch (error) {
      return jsonError(res, error);
    }
  });

  router.post('/checkout', async (req, res) => {
    try {
      const existing = await rows(supabase.from('commercial_subscriptions').select('id,status,provider,plan_code').eq('user_id', req.user.id).in('status', ['pending', 'authenticated', 'trialing', 'active', 'past_due', 'halted']).order('updated_at', { ascending: false }).limit(1));
      if (existing[0]) {
        return res.status(409).json({ success: false, code: 'SUBSCRIPTION_ALREADY_EXISTS', message: 'You already have an active or pending subscription. Manage it from Billing instead of creating a duplicate.' });
      }
      await supabase.from('billing_checkout_attempts').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('user_id', req.user.id).eq('status', 'initiated').lt('expires_at', new Date().toISOString());
      const requestId = isUuid(req.get('idempotency-key')) ? req.get('idempotency-key') : crypto.randomUUID();
      const priorAttempts = await rows(supabase.from('billing_checkout_attempts').select('*').eq('id', requestId).eq('user_id', req.user.id).limit(1));
      if (priorAttempts[0]?.status === 'initiated' && priorAttempts[0].checkout_payload) {
        return res.status(200).json({ success: true, checkout: priorAttempts[0].checkout_payload, reused: true });
      }
      const customers = await rows(supabase.from('billing_customers').select('billing_country,updated_at').eq('user_id', req.user.id).not('billing_country', 'is', null).order('updated_at', { ascending: false }).limit(1));
      const trustedRegion = resolveTrustedRequestCountry({ req, storedCountry: customers[0]?.billing_country });
      const product = resolveCheckoutProduct({ planCode: req.body.planCode, interval: req.body.interval, countryCode: trustedRegion.countryCode });
      const { error: attemptError } = await supabase.from('billing_checkout_attempts').insert({ id: requestId, user_id: req.user.id, provider: product.provider, plan_code: product.planCode, billing_interval: product.interval, billing_country: trustedRegion.countryCode, country_source: trustedRegion.source });
      if (attemptError?.code === '23505') return res.status(409).json({ success: false, code: 'CHECKOUT_ALREADY_IN_PROGRESS', message: 'A checkout is already open for this account. Complete it or wait 30 minutes before starting another.' });
      if (attemptError) throw attemptError;
      let checkout;
      try {
        checkout = await billing.createCheckout({
        planCode: req.body.planCode,
        interval: req.body.interval,
        user: req.user,
          requestId,
          product,
        });
        checkout = { ...checkout, billingCountry: trustedRegion.countryCode, countrySource: trustedRegion.source };
        await supabase.from('billing_checkout_attempts').update({ checkout_payload: checkout, updated_at: new Date().toISOString() }).eq('id', requestId);
      } catch (checkoutError) {
        await supabase.from('billing_checkout_attempts').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', requestId);
        throw checkoutError;
      }
      return res.status(201).json({ success: true, checkout });
    } catch (error) {
      return jsonError(res, error);
    }
  });

  router.post('/checkout/razorpay/verify', (req, res) => {
    if (!billing.verifyRazorpayCheckout(req.body || {})) {
      return res.status(400).json({ success: false, code: 'INVALID_CHECKOUT_SIGNATURE', message: 'Payment confirmation could not be verified.' });
    }
    return res.json({ success: true, message: 'Payment verified. Your plan will activate when the signed subscription webhook arrives.' });
  });

  router.post('/portal', async (req, res) => {
    try {
      const access = await commercial.resolveAccess(req.user.id);
      return res.json({ success: true, portal: await billing.createPortal(access.subscription) });
    } catch (error) {
      return jsonError(res, error);
    }
  });

  router.post('/cancel', async (req, res) => {
    try {
      const access = await commercial.resolveAccess(req.user.id);
      await billing.cancel(access.subscription, req.body?.atPeriodEnd !== false);
      return res.json({ success: true, message: 'Cancellation requested. Access remains until the provider confirms the change.' });
    } catch (error) {
      return jsonError(res, error);
    }
  });

  router.get('/studio', async (req, res) => {
    try {
      const access = await commercial.requireEntitlement(req.user.id, 'advanced_analytics');
      const [progress, memories, replays, reviews, voice, vaults, memberships] = await Promise.all([
        rows(supabase.from('reasoning_progress_snapshots').select('*').eq('user_id', req.user.id).order('captured_at', { ascending: false }).limit(60)),
        rows(supabase.from('mentor_memories').select('*').eq('user_id', req.user.id).eq('active', true).order('updated_at', { ascending: false }).limit(30)),
        rows(supabase.from('replay_branches').select('id,match_id,branch_from_turn,alternate_response,analysis,created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(30)),
        rows(supabase.from('deep_reviews').select('id,match_id,review,judge_version,created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(30)),
        rows(supabase.from('voice_analyses').select('id,match_id,duration_seconds,analysis_mode,acoustic_metrics,analysis,created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(30)),
        rows(supabase.from('evidence_vault_collections').select('id,name,description,retention_days,created_at,updated_at').eq('user_id', req.user.id).order('updated_at', { ascending: false })),
        rows(supabase.from('organization_members').select('organization_id,role,status').eq('user_id', req.user.id).eq('status', 'active')),
      ]);
      return res.json({ success: true, data: { planCode: access.planCode, entitlements: access.entitlements, progress, memories, replays, reviews, voice, vaults, memberships } });
    } catch (error) {
      return jsonError(res, error);
    }
  });

  router.post('/progress/capture', async (req, res) => {
    try {
      await commercial.requireEntitlement(req.user.id, 'advanced_analytics');
      const profiles = await rows(supabase.from('reasoning_profiles').select('*').eq('user_id', req.user.id).limit(1));
      if (!profiles[0]) return res.status(409).json({ success: false, code: 'PROFILE_NOT_READY', message: 'Complete judged matches before capturing progression.' });
      const profile = profiles[0];
      const inserted = await rows(supabase.from('reasoning_progress_snapshots').insert({
        user_id: req.user.id,
        source_match_id: isUuid(req.body?.matchId) ? req.body.matchId : null,
        overall: Number(profile.overall || 0),
        metrics: profile.metrics || {},
        percentile: Number(profile.percentile || 0),
        confidence: Number(profile.confidence || 0),
      }).select());
      return res.status(201).json({ success: true, snapshot: inserted[0] });
    } catch (error) {
      return jsonError(res, error);
    }
  });

  router.post('/mentor/respond', async (req, res) => {
    const message = cleanText(req.body?.message, 2400);
    if (!message) return res.status(400).json({ success: false, message: 'Ask your mentor a question.' });
    try {
      const metered = await commercial.runMetered({
        userId: req.user.id,
        feature: 'mentor_turn',
        entitlement: 'mentor_twin',
        requestKey: req.get('idempotency-key') || `mentor:${crypto.randomUUID()}`,
        action: async () => {
          const [profiles, memories, recentMatches] = await Promise.all([
            rows(supabase.from('reasoning_profiles').select('*').eq('user_id', req.user.id).limit(1)),
            rows(supabase.from('mentor_memories').select('memory_type,content,evidence').eq('user_id', req.user.id).eq('active', true).order('updated_at', { ascending: false }).limit(12)),
            rows(supabase.from('matches').select('id,topic,ai_scores,created_at').or(`critic_id.eq.${req.user.id},defender_id.eq.${req.user.id}`).eq('status', 'completed').order('created_at', { ascending: false }).limit(8)),
          ]);
          const generated = await generateWithRetry(`You are the user's private Socratic Mentor. Use their measured profile and history, do not flatter, and never invent evidence. Return JSON with keys answer (under 220 words), probing_question, observed_pattern, next_drill, and memory (a concise durable preference/goal/weakness worth remembering, or null).\n\nProfile: ${JSON.stringify(profiles[0] || {})}\nMemories: ${JSON.stringify(memories)}\nRecent matches: ${JSON.stringify(recentMatches)}\nUser: ${message}`, 3, true, { includeUsage: true });
          const response = unwrapMeasuredProviderResult(generated).value;
          if (response.memory) {
            await supabase.from('mentor_memories').insert({ user_id: req.user.id, memory_type: 'session_summary', content: cleanText(response.memory, 1000), evidence: { source: 'mentor_session' } });
          }
          return generated;
        },
      });
      return res.json({ success: true, response: metered.result, remaining: metered.remaining });
    } catch (error) {
      return jsonError(res, error);
    }
  });

  router.post('/adversarial/respond', async (req, res) => {
    const topic = cleanText(req.body?.topic, 500);
    const argument = cleanText(req.body?.argument, 5000);
    const position = req.body?.position === 'against' ? 'against' : 'for';
    const difficulty = ['hard', 'extreme'].includes(req.body?.difficulty) ? req.body.difficulty : 'hard';
    if (!topic || !argument) return res.status(400).json({ success: false, message: 'Topic and argument are required.' });
    try {
      const metered = await commercial.runMetered({
        userId: req.user.id,
        feature: 'adversarial_turn',
        entitlement: 'adversarial_training',
        requestKey: req.get('idempotency-key') || `adversarial:${crypto.randomUUID()}`,
        action: async () => generateWithRetry(`Act as an ${difficulty} but intellectually honest adversarial trainer. The learner argues ${position} the topic. Steelman the strongest opposing case; identify the most vulnerable premise; present one counterexample; ask one cross-examination question; and provide a hidden coach_note explaining what skill is being tested. Return JSON with steelman, vulnerable_premise, counterexample, cross_examination_question, coach_note, and difficulty. Never invent citations.\n\nTopic: ${topic}\nLearner argument: ${argument}`, 3, true, { includeUsage: true }),
      });
      return res.json({ success: true, response: metered.result, remaining: metered.remaining });
    } catch (error) {
      return jsonError(res, error);
    }
  });

  router.post('/deep-reviews', async (req, res) => {
    try {
      const match = await getOwnedMatch(supabase, req.user.id, req.body?.matchId);
      const metered = await commercial.runMetered({
        userId: req.user.id,
        feature: 'deep_review',
        entitlement: 'deep_review',
        requestKey: req.get('idempotency-key') || `deep-review:${match.id}`,
        action: async () => generateWithRetry(`Perform a private, non-ranking Deep Review of this completed debate. Return JSON with executive_summary, strongest_move, missed_opportunity, claim_audit (array), rebuttal_map (array), reasoning_metrics, three_drills (array), and a concise next_match_plan. Do not alter or second-guess the official result.\n\nMatch: ${JSON.stringify(match)}`, 3, true, { includeUsage: true }),
      });
      const saved = await rows(supabase.from('deep_reviews').upsert({ user_id: req.user.id, match_id: match.id, review: metered.result }, { onConflict: 'user_id,match_id' }).select());
      return res.status(201).json({ success: true, review: saved[0], remaining: metered.remaining });
    } catch (error) {
      return jsonError(res, error);
    }
  });

  router.post('/replays', async (req, res) => {
    const alternate = cleanText(req.body?.alternateResponse, 5000);
    if (!alternate) return res.status(400).json({ success: false, message: 'Add an alternate response to replay.' });
    try {
      const match = await getOwnedMatch(supabase, req.user.id, req.body?.matchId);
      const branch = Math.max(0, Number(req.body?.branchFromTurn) || 0);
      const metered = await commercial.runMetered({
        userId: req.user.id,
        feature: 'replay_branch',
        entitlement: 'replay_lab',
        requestKey: req.get('idempotency-key') || `replay:${match.id}:${crypto.createHash('sha256').update(`${branch}:${alternate}`).digest('hex').slice(0, 24)}`,
        action: async () => generateWithRetry(`Analyze an alternate-reality replay of a debate turn. Return JSON with likely_opponent_reply, outcome_delta (not a ranking change), strengths, risks, improved_version, and lesson. Be calibrated about counterfactual uncertainty.\n\nOriginal match: ${JSON.stringify(match)}\nBranch turn: ${branch}\nAlternate response: ${alternate}`, 3, true, { includeUsage: true }),
      });
      const saved = await rows(supabase.from('replay_branches').insert({ user_id: req.user.id, match_id: match.id, branch_from_turn: branch, alternate_response: alternate, analysis: metered.result }).select());
      return res.status(201).json({ success: true, replay: saved[0], remaining: metered.remaining });
    } catch (error) {
      return jsonError(res, error);
    }
  });

  router.post('/voice-analyses', async (req, res) => {
    const transcript = cleanText(req.body?.transcript, 12000);
    const durationSeconds = Math.min(3600, Math.max(1, Math.ceil(Number(req.body?.durationSeconds) || 60)));
    if (!transcript) return res.status(400).json({ success: false, message: 'A speech transcript is required.' });
    const acousticMetrics = sanitizeAcousticMetrics(req.body?.acousticMetrics, transcript, durationSeconds);
    const analysisMode = acousticMetrics ? 'acoustic' : 'transcript';
    const minutes = Math.max(1, Math.ceil(durationSeconds / 60));
    try {
      const metered = await commercial.runMetered({
        userId: req.user.id,
        feature: 'voice_analysis_minute',
        units: minutes,
        entitlement: 'voice_pro',
        requestKey: req.get('idempotency-key') || `voice:${crypto.randomUUID()}`,
        action: async () => generateWithRetry(`You are a precise speaking coach. Return JSON with analysis_mode, pacing, pause_control, pitch_variation, volume_dynamics, clarity, concision, filler_timing, emotional_control, cutoff_or_interruption_risk, emphasis_suggestions, rewritten_opening, and three_delivery_drills. Use only the supplied measurements. If acoustic metrics are absent, explicitly mark acoustic fields as not_measured; never infer pitch, pauses, or volume from text. An abruptCutoffIndicator is only an ending-energy signal, not proof another speaker interrupted.\n\nAnalysis mode: ${analysisMode}\nDuration seconds: ${durationSeconds}\nServer-derived transcript metrics: ${JSON.stringify(transcriptMetrics(transcript, durationSeconds))}\nOn-device acoustic metrics: ${JSON.stringify(acousticMetrics)}\nTranscript: ${transcript}`, 3, true, { includeUsage: true }),
      });
      const saved = await rows(supabase.from('voice_analyses').insert({ user_id: req.user.id, match_id: isUuid(req.body?.matchId) ? req.body.matchId : null, duration_seconds: durationSeconds, analysis_mode: analysisMode, acoustic_metrics: acousticMetrics, analysis: metered.result }).select());
      return res.status(201).json({ success: true, analysis: saved[0], remaining: metered.remaining });
    } catch (error) {
      return jsonError(res, error);
    }
  });

  router.post('/vaults', async (req, res) => {
    const name = cleanText(req.body?.name, 120);
    if (!name) return res.status(400).json({ success: false, message: 'Collection name is required.' });
    try {
      await commercial.requireEntitlement(req.user.id, 'evidence_vault');
      const saved = await rows(supabase.from('evidence_vault_collections').insert({
        user_id: req.user.id,
        name,
        description: cleanText(req.body?.description, 800) || null,
        retention_days: Math.min(3650, Math.max(1, Number(req.body?.retentionDays) || 365)),
      }).select());
      return res.status(201).json({ success: true, vault: saved[0] });
    } catch (error) {
      return jsonError(res, error);
    }
  });

  router.delete('/vaults/:id', async (req, res) => {
    try {
      await commercial.requireEntitlement(req.user.id, 'evidence_vault');
      if (!isUuid(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid collection.' });
      const { error } = await supabase.from('evidence_vault_collections').delete().eq('id', req.params.id).eq('user_id', req.user.id);
      if (error) throw error;
      return res.status(204).send();
    } catch (error) {
      return jsonError(res, error);
    }
  });

  router.post('/organizations', async (req, res) => {
    const name = cleanText(req.body?.name, 160);
    try {
      await commercial.requireEntitlement(req.user.id, 'organization_admin');
      const organization = (await rows(supabase.from('organizations').insert({ name, slug: `${slugify(name)}-${crypto.randomBytes(2).toString('hex')}`, owner_id: req.user.id, settings: req.body?.settings || {} }).select()))[0];
      await supabase.from('organization_members').insert({ organization_id: organization.id, user_id: req.user.id, role: 'owner', status: 'active' });
      await supabase.from('organization_audit_logs').insert({ organization_id: organization.id, actor_id: req.user.id, action: 'organization.created', target_type: 'organization', target_id: organization.id });
      return res.status(201).json({ success: true, organization });
    } catch (error) {
      return jsonError(res, error);
    }
  });

  const requireOrgAdmin = async (userId, organizationId) => {
    const membership = (await rows(supabase.from('organization_members').select('*').eq('organization_id', organizationId).eq('user_id', userId).eq('status', 'active').in('role', ['owner', 'admin']).limit(1)))[0];
    if (!membership) throw Object.assign(new Error('Organization administrator access required.'), { statusCode: 403, code: 'ORG_ADMIN_REQUIRED' });
    return membership;
  };

  router.get('/organizations/:id', async (req, res) => {
    try {
      await requireOrgAdmin(req.user.id, req.params.id);
      const [organization, members, usage, audit] = await Promise.all([
        rows(supabase.from('organizations').select('*').eq('id', req.params.id).limit(1)),
        rows(supabase.from('organization_members').select('*').eq('organization_id', req.params.id).order('joined_at')),
        rows(supabase.from('organization_usage_pools').select('*').eq('organization_id', req.params.id).gte('period_end', new Date().toISOString())),
        rows(supabase.from('organization_audit_logs').select('*').eq('organization_id', req.params.id).order('created_at', { ascending: false }).limit(100)),
      ]);
      return res.json({ success: true, data: { organization: organization[0], members, usage, audit } });
    } catch (error) {
      return jsonError(res, error);
    }
  });

  router.patch('/organizations/:id/settings', async (req, res) => {
    try {
      await requireOrgAdmin(req.user.id, req.params.id);
      const settings = req.body?.settings && typeof req.body.settings === 'object' ? req.body.settings : {};
      const updated = await rows(supabase.from('organizations').update({ settings, updated_at: new Date().toISOString() }).eq('id', req.params.id).select());
      await supabase.from('organization_audit_logs').insert({ organization_id: req.params.id, actor_id: req.user.id, action: 'organization.settings_updated', target_type: 'organization', target_id: req.params.id, metadata: { keys: Object.keys(settings) } });
      return res.json({ success: true, organization: updated[0] });
    } catch (error) {
      return jsonError(res, error);
    }
  });

  router.post('/organizations/:id/assets', async (req, res) => {
    try {
      await requireOrgAdmin(req.user.id, req.params.id);
      const allowedTypes = ['rubric', 'scenario', 'evidence_policy', 'retention_policy', 'credential_template'];
      const assetType = allowedTypes.includes(req.body?.assetType) ? req.body.assetType : null;
      const name = cleanText(req.body?.name, 160);
      if (!assetType || !name) return res.status(400).json({ success: false, message: 'A valid asset type and name are required.' });
      const asset = await rows(supabase.from('organization_assets').insert({ organization_id: req.params.id, asset_type: assetType, name, content: req.body?.content || {}, version: Math.max(1, Number(req.body?.version) || 1), created_by: req.user.id }).select());
      await supabase.from('organization_audit_logs').insert({ organization_id: req.params.id, actor_id: req.user.id, action: 'asset.created', target_type: assetType, target_id: asset[0].id, metadata: { name } });
      return res.status(201).json({ success: true, asset: asset[0] });
    } catch (error) {
      return jsonError(res, error);
    }
  });

  router.post('/organizations/:id/members', async (req, res) => {
    try {
      await requireOrgAdmin(req.user.id, req.params.id);
      if (!isUuid(req.body?.userId)) return res.status(400).json({ success: false, message: 'A valid user ID is required.' });
      const allowedRoles = ['admin', 'coach', 'teacher', 'member', 'student'];
      const role = allowedRoles.includes(req.body?.role) ? req.body.role : 'member';
      const member = await rows(supabase.from('organization_members').upsert({ organization_id: req.params.id, user_id: req.body.userId, role, status: 'active' }, { onConflict: 'organization_id,user_id' }).select());
      await supabase.from('organization_audit_logs').insert({ organization_id: req.params.id, actor_id: req.user.id, action: 'member.added', target_type: 'user', target_id: req.body.userId, metadata: { role } });
      return res.status(201).json({ success: true, member: member[0] });
    } catch (error) {
      return jsonError(res, error);
    }
  });

  router.post('/organizations/:id/usage-pools', async (req, res) => {
    try {
      await requireOrgAdmin(req.user.id, req.params.id);
      const featureKey = cleanText(req.body?.featureKey, 120);
      const allowanceUnits = Math.max(0, Math.floor(Number(req.body?.allowanceUnits) || 0));
      if (!featureKey || allowanceUnits <= 0) return res.status(400).json({ success: false, message: 'Feature and a positive allowance are required.' });
      const now = new Date();
      const periodStart = req.body?.periodStart || new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      const periodEnd = req.body?.periodEnd || new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
      const pool = await rows(supabase.from('organization_usage_pools').upsert({ organization_id: req.params.id, feature_key: featureKey, period_start: periodStart, period_end: periodEnd, allowance_units: allowanceUnits }, { onConflict: 'organization_id,feature_key,period_start' }).select());
      await supabase.from('organization_audit_logs').insert({ organization_id: req.params.id, actor_id: req.user.id, action: 'usage_pool.updated', target_type: 'usage_pool', target_id: featureKey, metadata: { allowanceUnits, periodStart, periodEnd } });
      return res.status(201).json({ success: true, pool: pool[0] });
    } catch (error) {
      return jsonError(res, error);
    }
  });

  router.post('/sales-leads', async (req, res) => {
    const email = cleanText(req.body?.email || req.user.email, 320);
    const name = cleanText(req.body?.name || req.user.user_metadata?.full_name || req.user.email, 160);
    if (!email || !name) return res.status(400).json({ success: false, message: 'Name and email are required.' });
    try {
      const saved = await rows(supabase.from('sales_leads').insert({
        user_id: req.user.id,
        name,
        email,
        organization_name: cleanText(req.body?.organizationName, 200) || null,
        organization_size: cleanText(req.body?.organizationSize, 80) || null,
        use_case: cleanText(req.body?.useCase, 1600) || null,
        country_code: cleanText(req.body?.countryCode, 2).toUpperCase() || null,
      }).select('id,created_at'));
      return res.status(201).json({ success: true, lead: saved[0], message: 'Thanks — your organization request is recorded.' });
    } catch (error) {
      return jsonError(res, error);
    }
  });

  router.get('/export', async (req, res) => {
    try {
      await commercial.requireEntitlement(req.user.id, 'exports');
      const [profile, progress, reviews, replays, vaults] = await Promise.all([
        rows(supabase.from('reasoning_profiles').select('*').eq('user_id', req.user.id).limit(1)),
        rows(supabase.from('reasoning_progress_snapshots').select('*').eq('user_id', req.user.id).order('captured_at')),
        rows(supabase.from('deep_reviews').select('*').eq('user_id', req.user.id).order('created_at')),
        rows(supabase.from('replay_branches').select('*').eq('user_id', req.user.id).order('created_at')),
        rows(supabase.from('evidence_vault_collections').select('id,name,description,retention_days,created_at,updated_at').eq('user_id', req.user.id).order('created_at')),
      ]);
      res.set('Content-Disposition', `attachment; filename="socratic-arena-export-${new Date().toISOString().slice(0, 10)}.json"`);
      return res.json({ exportedAt: new Date().toISOString(), userId: req.user.id, profile: profile[0] || null, progress, deepReviews: reviews, replayBranches: replays, evidenceVaultCollections: vaults });
    } catch (error) {
      return jsonError(res, error);
    }
  });

  router.post('/internal/subscriptions', requirePlatformAdmin, async (req, res) => {
    try {
      if (!isUuid(req.body?.userId) || !['plus', 'premium', 'business'].includes(req.body?.planCode)) return res.status(400).json({ success: false, message: 'A valid user and paid plan are required.' });
      const periodStart = new Date().toISOString();
      const periodEnd = req.body?.periodEnd || new Date(Date.now() + 365 * 86400000).toISOString();
      const providerSubscriptionId = `manual:${req.body.userId}:${req.body.planCode}`;
      const subscriptions = await rows(supabase.from('commercial_subscriptions').upsert({
        user_id: req.body.userId,
        provider: 'manual',
        provider_subscription_id: providerSubscriptionId,
        plan_code: req.body.planCode,
        billing_interval: 'custom',
        status: req.body?.status === 'trialing' ? 'trialing' : 'active',
        current_period_start: periodStart,
        current_period_end: periodEnd,
        provider_metadata: { provisioned_by: req.user.id, reason: cleanText(req.body?.reason, 500) },
        updated_at: periodStart,
      }, { onConflict: 'provider,provider_subscription_id' }).select());
      return res.status(201).json({ success: true, subscription: subscriptions[0] });
    } catch (error) {
      return jsonError(res, error);
    }
  });

  router.get('/internal/sales-leads', requirePlatformAdmin, async (_req, res) => {
    try {
      const leads = await rows(supabase.from('sales_leads').select('*').order('created_at', { ascending: false }).limit(500));
      return res.json({ success: true, leads });
    } catch (error) {
      return jsonError(res, error);
    }
  });

  router.get('/internal/costs', requirePlatformAdmin, async (req, res) => {
    try {
      const since = new Date(Date.now() - 31 * 86400000).toISOString();
      const [events, reconciliations] = await Promise.all([
        rows(supabase.from('commercial_usage_events').select('user_id,feature_key,units,cost_micros,metadata,created_at').eq('event_type', 'settled').gte('created_at', since).limit(10000)),
        rows(supabase.from('provider_cost_reconciliations').select('*').gte('period_end', since).order('period_start', { ascending: false }).limit(100)),
      ]);
      const reconciliationFor = event => reconciliations.find(item => item.provider === event.metadata?.provider && new Date(event.created_at) >= new Date(item.period_start) && new Date(event.created_at) < new Date(item.period_end));
      const byFeature = Object.values(events.reduce((acc, event) => {
        acc[event.feature_key] ||= { feature: event.feature_key, units: 0, measuredCostMicros: 0, reconciledCostMicros: 0, unreconciledMeasuredCostMicros: 0, measuredCalls: 0, reconciledCalls: 0, unmeasuredCalls: 0 };
        acc[event.feature_key].units += Number(event.units || 0);
        acc[event.feature_key].measuredCostMicros += Number(event.cost_micros || 0);
        const reconciliation = reconciliationFor(event);
        if (reconciliation) {
          acc[event.feature_key].reconciledCostMicros += Math.round(Number(event.cost_micros || 0) * Number(reconciliation.allocation_ratio));
          acc[event.feature_key].reconciledCalls += 1;
        } else {
          acc[event.feature_key].unreconciledMeasuredCostMicros += Number(event.cost_micros || 0);
        }
        if (event.metadata?.costSource === 'unmeasured') acc[event.feature_key].unmeasuredCalls += 1;
        else acc[event.feature_key].measuredCalls += 1;
        return acc;
      }, {}));
      const byUser = Object.values(events.reduce((acc, event) => {
        acc[event.user_id] ||= { userId: event.user_id, measuredCostMicros: 0, reconciledCostMicros: 0, unreconciledMeasuredCostMicros: 0, calls: 0 };
        acc[event.user_id].measuredCostMicros += Number(event.cost_micros || 0);
        const reconciliation = reconciliationFor(event);
        if (reconciliation) acc[event.user_id].reconciledCostMicros += Math.round(Number(event.cost_micros || 0) * Number(reconciliation.allocation_ratio));
        else acc[event.user_id].unreconciledMeasuredCostMicros += Number(event.cost_micros || 0);
        acc[event.user_id].calls += 1;
        return acc;
      }, {}));
      return res.json({
        success: true,
        since,
        measuredCostMicros: byFeature.reduce((sum, item) => sum + item.measuredCostMicros, 0),
        reconciledCostMicros: byFeature.reduce((sum, item) => sum + item.reconciledCostMicros, 0),
        unreconciledMeasuredCostMicros: byFeature.reduce((sum, item) => sum + item.unreconciledMeasuredCostMicros, 0),
        byFeature,
        byUser,
        reconciliations,
      });
    } catch (error) {
      return jsonError(res, error);
    }
  });

  router.post('/internal/costs/reconcile', requirePlatformAdmin, async (req, res) => {
    try {
      const provider = ['google-gemini', 'amazon-polly'].includes(req.body?.provider) ? req.body.provider : null;
      const periodStart = new Date(req.body?.periodStart);
      const periodEnd = new Date(req.body?.periodEnd);
      const invoiceTotalMicros = Math.max(0, Math.floor(Number(req.body?.invoiceTotalMicros)));
      if (!provider || !Number.isFinite(periodStart.getTime()) || !Number.isFinite(periodEnd.getTime()) || periodEnd <= periodStart || !Number.isFinite(invoiceTotalMicros)) {
        return res.status(400).json({ success: false, message: 'Provider, valid invoice period, and invoiceTotalMicros are required.' });
      }
      const events = await rows(supabase.from('commercial_usage_events').select('cost_micros,metadata').eq('event_type', 'settled').eq('metadata->>provider', provider).gte('created_at', periodStart.toISOString()).lt('created_at', periodEnd.toISOString()).limit(50000));
      const measuredCostMicros = events.reduce((sum, event) => sum + Number(event.cost_micros || 0), 0);
      if (!measuredCostMicros && invoiceTotalMicros) return res.status(409).json({ success: false, code: 'NO_MEASURED_USAGE', message: 'No measured usage exists for this invoice period.' });
      const allocationRatio = measuredCostMicros ? invoiceTotalMicros / measuredCostMicros : 0;
      const saved = await rows(supabase.from('provider_cost_reconciliations').upsert({
        provider,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        currency: 'USD',
        invoice_total_micros: invoiceTotalMicros,
        measured_cost_micros: measuredCostMicros,
        allocation_ratio: allocationRatio,
        invoice_reference: cleanText(req.body?.invoiceReference, 300) || null,
        created_by: req.user.id,
      }, { onConflict: 'provider,period_start,period_end' }).select());
      return res.status(201).json({ success: true, reconciliation: saved[0] });
    } catch (error) {
      return jsonError(res, error);
    }
  });

  return router;
}
