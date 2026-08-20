const asBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
};

const asPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
};

const PLAN_ORDER = ['starter', 'plus', 'premium', 'business'];

const PLAN_DEFINITIONS = {
  starter: {
    name: 'Starter',
    tagline: 'The complete human debate network, free.',
    prices: { INR: { monthly: 0, annual: 0 }, USD: { monthly: 0, annual: 0 } },
    features: [
      'Unlimited human debates and public Arenas',
      'Core reasoning profile and match history',
      'Daily AI practice allowance',
      'Community tournaments and classrooms',
    ],
    entitlements: {
      human_debates: true,
      core_reasoning_profile: true,
      ai_sparring: true,
      advanced_analytics: false,
      deep_review: false,
      mentor_twin: false,
      adversarial_training: false,
      replay_lab: false,
      evidence_vault: false,
      career_simulator: false,
      voice_pro: false,
      exports: false,
      organization_admin: false,
    },
    monthlyAllowances: {
      ai_practice_turn: 60,
      ai_practice_score: 8,
      evidence_session: 3,
      ai_summary: 10,
      ai_objection: 10,
      tts_character: 12000,
      deep_review: 0,
      mentor_turn: 0,
      replay_branch: 0,
      voice_analysis_minute: 0,
    },
    dailyCeilings: {
      ai_practice_turn: 20,
      ai_practice_score: 5,
      evidence_session: 3,
      ai_summary: 10,
      ai_objection: 10,
      tts_character: 4000,
    },
  },
  plus: {
    name: 'Plus',
    tagline: 'Build a measurable reasoning practice.',
    prices: {
      INR: { monthly: 29900, annual: 287000 },
      USD: { monthly: 599, annual: 5750 },
    },
    features: [
      '10× larger AI coaching allowance',
      'Reasoning progression and advanced analytics',
      'Targeted drills and expanded simulations',
      'More Evidence Arena, voice, exports, and comparisons',
    ],
    entitlements: {
      human_debates: true,
      core_reasoning_profile: true,
      ai_sparring: true,
      advanced_analytics: true,
      deep_review: true,
      mentor_twin: false,
      adversarial_training: false,
      replay_lab: true,
      evidence_vault: true,
      career_simulator: true,
      voice_pro: false,
      exports: true,
      organization_admin: false,
    },
    monthlyAllowances: {
      ai_practice_turn: 600,
      ai_practice_score: 80,
      evidence_session: 30,
      ai_summary: 100,
      ai_objection: 100,
      tts_character: 150000,
      deep_review: 8,
      mentor_turn: 0,
      replay_branch: 20,
      voice_analysis_minute: 0,
    },
    dailyCeilings: {
      ai_practice_turn: 80,
      ai_practice_score: 20,
      evidence_session: 10,
      ai_summary: 30,
      ai_objection: 30,
      tts_character: 30000,
      deep_review: 3,
      replay_branch: 8,
    },
  },
  premium: {
    name: 'Premium',
    tagline: 'A private Socratic mentor built from your history.',
    prices: {
      INR: { monthly: 79900, annual: 767000 },
      USD: { monthly: 1499, annual: 14390 },
    },
    features: [
      'Socratic Mentor and reasoning twin',
      'Adversarial training and alternate-reality replay',
      'Persistent Evidence Vault and Deep Review',
      'Career simulations, Voice Pro, and full exports',
    ],
    entitlements: {
      human_debates: true,
      core_reasoning_profile: true,
      ai_sparring: true,
      advanced_analytics: true,
      deep_review: true,
      mentor_twin: true,
      adversarial_training: true,
      replay_lab: true,
      evidence_vault: true,
      career_simulator: true,
      voice_pro: true,
      exports: true,
      organization_admin: false,
    },
    monthlyAllowances: {
      ai_practice_turn: 2500,
      ai_practice_score: 300,
      evidence_session: 120,
      ai_summary: 500,
      ai_objection: 500,
      tts_character: 750000,
      deep_review: 40,
      mentor_turn: 500,
      adversarial_turn: 300,
      replay_branch: 100,
      voice_analysis_minute: 300,
    },
    dailyCeilings: {
      ai_practice_turn: 250,
      ai_practice_score: 50,
      evidence_session: 25,
      ai_summary: 80,
      ai_objection: 80,
      tts_character: 100000,
      deep_review: 10,
      mentor_turn: 100,
      adversarial_turn: 60,
      replay_branch: 25,
      voice_analysis_minute: 60,
    },
  },
  business: {
    name: 'Business & Education',
    tagline: 'Private reasoning infrastructure for teams and cohorts.',
    prices: { INR: { monthly: null, annual: null }, USD: { monthly: null, annual: null } },
    features: [
      'Organization workspace, roles, cohorts, and pooled usage',
      'Custom rubrics, scenarios, evidence vaults, and tournaments',
      'Assignments, credentials, audit logs, and reports',
      'Custom retention, onboarding, and future SSO/LMS/API options',
    ],
    entitlements: {
      human_debates: true,
      core_reasoning_profile: true,
      ai_sparring: true,
      advanced_analytics: true,
      deep_review: true,
      mentor_twin: true,
      adversarial_training: true,
      replay_lab: true,
      evidence_vault: true,
      career_simulator: true,
      voice_pro: true,
      exports: true,
      organization_admin: true,
    },
    monthlyAllowances: {
      ai_practice_turn: 10000,
      ai_practice_score: 1200,
      evidence_session: 500,
      ai_summary: 2000,
      ai_objection: 2000,
      tts_character: 3000000,
      deep_review: 200,
      mentor_turn: 3000,
      adversarial_turn: 2000,
      replay_branch: 600,
      voice_analysis_minute: 1500,
    },
    dailyCeilings: {
      ai_practice_turn: 500,
      ai_practice_score: 100,
      evidence_session: 60,
      ai_summary: 150,
      ai_objection: 150,
      tts_character: 250000,
      deep_review: 30,
      mentor_turn: 250,
      adversarial_turn: 150,
      replay_branch: 60,
      voice_analysis_minute: 180,
    },
  },
};

export const commercialModeEnabled = () => asBoolean(process.env.COMMERCIAL_MODE_ENABLED, false);

export const normalizeCountry = value => String(value || '').trim().toUpperCase().slice(0, 2);

export const resolveBillingRegion = ({ countryCode, currency } = {}) => {
  const country = normalizeCountry(countryCode);
  const requestedCurrency = String(currency || '').trim().toUpperCase();
  if (country === 'IN' || requestedCurrency === 'INR') {
    return { provider: 'razorpay', currency: 'INR', countryCode: country || 'IN' };
  }
  return { provider: 'paddle', currency: 'USD', countryCode: country || null };
};

export const getPlan = planCode => {
  const code = String(planCode || 'starter').toLowerCase();
  return { code: PLAN_DEFINITIONS[code] ? code : 'starter', ...(PLAN_DEFINITIONS[code] || PLAN_DEFINITIONS.starter) };
};

export const planSatisfies = (actualPlan, requiredPlan) => (
  PLAN_ORDER.indexOf(getPlan(actualPlan).code) >= PLAN_ORDER.indexOf(getPlan(requiredPlan).code)
);

const providerPriceId = ({ planCode, interval, provider }) => {
  const upperPlan = planCode.toUpperCase();
  const upperInterval = interval.toUpperCase();
  const prefix = provider === 'razorpay' ? 'RAZORPAY_PLAN' : 'PADDLE_PRICE';
  return process.env[`${prefix}_${upperPlan}_${upperInterval}`] || null;
};

export const getPublicPlanCatalog = ({ countryCode, currency } = {}) => {
  const region = resolveBillingRegion({ countryCode, currency });
  return {
    commercialEnabled: commercialModeEnabled(),
    region,
    annualSavingsPercent: 20,
    plans: PLAN_ORDER.map(code => {
      const plan = getPlan(code);
      return {
        code,
        name: plan.name,
        tagline: plan.tagline,
        prices: plan.prices[region.currency],
        currency: region.currency,
        provider: code === 'starter' || code === 'business' ? null : region.provider,
        selfServe: !['starter', 'business'].includes(code),
        features: plan.features,
        entitlements: plan.entitlements,
      };
    }),
  };
};

export const resolveCheckoutProduct = ({ planCode, interval = 'monthly', countryCode, currency } = {}) => {
  const plan = getPlan(planCode);
  const normalizedInterval = interval === 'annual' ? 'annual' : 'monthly';
  if (!['plus', 'premium'].includes(plan.code)) {
    throw Object.assign(new Error('Only Plus and Premium are available through self-serve checkout.'), { statusCode: 400, code: 'INVALID_PLAN' });
  }
  const region = resolveBillingRegion({ countryCode, currency });
  const externalPriceId = providerPriceId({ planCode: plan.code, interval: normalizedInterval, provider: region.provider });
  if (!externalPriceId) {
    throw Object.assign(new Error(`${region.provider === 'razorpay' ? 'Indian' : 'Global'} checkout is not configured yet.`), { statusCode: 503, code: 'BILLING_NOT_CONFIGURED' });
  }
  return {
    planCode: plan.code,
    interval: normalizedInterval,
    provider: region.provider,
    currency: region.currency,
    amount: plan.prices[region.currency][normalizedInterval],
    externalPriceId,
  };
};

export const getCommercialLimits = planCode => {
  const plan = getPlan(planCode);
  return {
    monthly: Object.fromEntries(Object.entries(plan.monthlyAllowances).map(([feature, fallback]) => [
      feature,
      asPositiveInt(process.env[`COMMERCIAL_${plan.code.toUpperCase()}_${feature.toUpperCase()}_MONTHLY`], fallback),
    ])),
    daily: Object.fromEntries(Object.entries(plan.dailyCeilings).map(([feature, fallback]) => [
      feature,
      asPositiveInt(process.env[`COMMERCIAL_${plan.code.toUpperCase()}_${feature.toUpperCase()}_DAILY`], fallback),
    ])),
  };
};

export const commercialPlanCodes = Object.freeze([...PLAN_ORDER]);
