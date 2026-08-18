import crypto from 'crypto';
import {
  commercialModeEnabled,
  getCommercialLimits,
  getPlan,
  getPublicPlanCatalog,
} from './commercialConfig.js';

const ACTIVE_STATUSES = ['active', 'trialing'];
const DEFAULT_COST_MICROS = {
  ai_practice_turn: 2500,
  ai_practice_score: 8000,
  evidence_session: 15000,
  ai_summary: 3000,
  ai_objection: 4000,
  tts_character: 2,
  deep_review: 20000,
  mentor_turn: 6000,
  adversarial_turn: 7000,
  replay_branch: 12000,
  voice_analysis_minute: 15000,
};

const monthWindow = (now = new Date()) => ({
  start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
  end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString(),
});

const friendlyUsageError = error => {
  const message = String(error?.message || '');
  if (message.includes('MONTHLY_ALLOWANCE_REACHED')) {
    return Object.assign(new Error('Your monthly AI allowance has been used. It resets with your next billing period.'), { statusCode: 429, code: 'MONTHLY_ALLOWANCE_REACHED' });
  }
  if (message.includes('DAILY_ABUSE_CEILING_REACHED')) {
    return Object.assign(new Error('Your AI safety limit for today has been reached. Please try again after 00:00 UTC.'), { statusCode: 429, code: 'DAILY_AI_LIMIT_REACHED' });
  }
  if (message.includes('ORGANIZATION_ALLOWANCE_REACHED')) {
    return Object.assign(new Error('Your organization has used its shared allowance for this billing period.'), { statusCode: 429, code: 'ORGANIZATION_ALLOWANCE_REACHED' });
  }
  return Object.assign(new Error('Usage could not be reserved. Please try again.'), { statusCode: 503, code: 'USAGE_METER_UNAVAILABLE' });
};

const safeRows = async builder => {
  const { data, error } = await builder;
  if (error) throw error;
  return data || [];
};

export const createCommercialService = ({ supabase }) => {
  const resolveAccess = async userId => {
    if (!commercialModeEnabled()) {
      const plan = getPlan('starter');
      return {
        enabled: false,
        planCode: 'starter',
        plan,
        subscription: null,
        organization: null,
        entitlements: plan.entitlements,
        limits: getCommercialLimits('starter'),
      };
    }

    const [subscriptions, memberships, userOverrides] = await Promise.all([
      safeRows(supabase.from('commercial_subscriptions').select('*').eq('user_id', userId).order('updated_at', { ascending: false }).limit(1)),
      safeRows(supabase.from('organization_members').select('organization_id,role,status').eq('user_id', userId).eq('status', 'active').limit(1)),
      safeRows(supabase.from('entitlement_overrides').select('*').eq('user_id', userId).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)),
    ]);

    const subscription = subscriptions[0] || null;
    let organization = null;
    if (memberships[0]) {
      const organizations = await safeRows(supabase.from('organizations').select('*').eq('id', memberships[0].organization_id).limit(1));
      organization = organizations[0] ? { ...organizations[0], role: memberships[0].role } : null;
    }
    const organizationOverrides = organization
      ? await safeRows(supabase.from('entitlement_overrides').select('*').eq('organization_id', organization.id).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`))
      : [];
    const overrides = [...organizationOverrides, ...userOverrides];
    const subscriptionHasAccess = subscription
      && ACTIVE_STATUSES.includes(subscription.status)
      && (!subscription.current_period_end || new Date(subscription.current_period_end) > new Date());
    const planCode = organization?.plan_code || (subscriptionHasAccess ? subscription.plan_code : 'starter');
    const plan = getPlan(planCode);
    const entitlements = { ...plan.entitlements };
    for (const override of overrides) entitlements[override.entitlement_key] = override.enabled;
    const limits = getCommercialLimits(plan.code);
    for (const override of overrides) {
      if (override.allowance_override !== null && override.allowance_override !== undefined) {
        const allowance = Math.max(0, Number(override.allowance_override) || 0);
        limits.monthly[override.entitlement_key] = allowance;
        limits.daily[override.entitlement_key] = Math.min(allowance, limits.daily[override.entitlement_key] ?? allowance);
      }
    }
    return {
      enabled: true,
      planCode: plan.code,
      plan,
      subscription,
      organization,
      entitlements,
      limits,
    };
  };

  const snapshot = async (userId, region = {}) => {
    const access = await resolveAccess(userId);
    const catalog = getPublicPlanCatalog(region);
    const publicSubscription = access.subscription ? {
      id: access.subscription.id,
      provider: access.subscription.provider,
      plan_code: access.subscription.plan_code,
      billing_interval: access.subscription.billing_interval,
      currency: access.subscription.currency,
      status: access.subscription.status,
      current_period_start: access.subscription.current_period_start,
      current_period_end: access.subscription.current_period_end,
      cancel_at_period_end: access.subscription.cancel_at_period_end,
      cancelled_at: access.subscription.cancelled_at,
    } : null;
    const publicAccess = { ...access, subscription: publicSubscription };
    if (!access.enabled) return { ...publicAccess, catalog, usage: [] };
    const window = access.subscription?.current_period_start && access.subscription?.current_period_end
      ? { start: access.subscription.current_period_start, end: access.subscription.current_period_end }
      : monthWindow();
    const usage = await safeRows(
      supabase.from('commercial_usage_balances').select('feature_key,period_start,period_end,reserved_units,consumed_units').eq('user_id', userId).gte('period_end', new Date().toISOString()).order('feature_key'),
    );
    return { ...publicAccess, catalog, usage, period: window };
  };

  const requireEntitlement = async (userId, entitlement) => {
    const access = await resolveAccess(userId);
    if (!access.enabled) {
      throw Object.assign(new Error('Commercial features are disabled in this environment.'), { statusCode: 404, code: 'COMMERCIAL_MODE_DISABLED' });
    }
    if (!access.entitlements[entitlement]) {
      throw Object.assign(new Error(`Upgrade your plan to use ${entitlement.replaceAll('_', ' ')}.`), { statusCode: 402, code: 'UPGRADE_REQUIRED', requiredEntitlement: entitlement });
    }
    return access;
  };

  const reserve = async ({ userId, feature, units = 1, requestKey = crypto.randomUUID(), entitlement }) => {
    const access = await resolveAccess(userId);
    if (!access.enabled) return { disabled: true, id: null, access, requestKey };
    if (entitlement && !access.entitlements[entitlement]) {
      throw Object.assign(new Error(`Upgrade your plan to use ${entitlement.replaceAll('_', ' ')}.`), { statusCode: 402, code: 'UPGRADE_REQUIRED', requiredEntitlement: entitlement });
    }
    const limit = Number(access.limits.monthly[feature] || 0);
    const daily = Number(access.limits.daily[feature] || limit);
    if (limit <= 0 || daily <= 0) {
      throw Object.assign(new Error('This AI capability is not included in your current plan.'), { statusCode: 402, code: 'UPGRADE_REQUIRED', feature });
    }
    const period = access.subscription?.current_period_start && access.subscription?.current_period_end
      ? { start: access.subscription.current_period_start, end: access.subscription.current_period_end }
      : monthWindow();
    const { data, error } = await supabase.rpc('reserve_commercial_usage', {
      p_user_id: userId,
      p_feature_key: feature,
      p_units: Math.max(1, Math.ceil(units)),
      p_request_key: requestKey,
      p_period_start: period.start,
      p_period_end: period.end,
      p_monthly_limit: limit,
      p_daily_limit: daily,
      p_organization_id: access.organization?.id || null,
    });
    if (error) throw friendlyUsageError(error);
    const result = Array.isArray(data) ? data[0] : data;
    return { id: result?.reservation_id, remaining: result?.remaining_units, reused: result?.reused, access, requestKey };
  };

  const settle = async ({ userId, reservation, actualUnits = 1, costMicros }) => {
    if (!reservation?.id) return true;
    const cost = costMicros ?? Math.ceil(actualUnits * (DEFAULT_COST_MICROS[reservation.feature] || 0));
    const { error } = await supabase.rpc('settle_commercial_usage', {
      p_user_id: userId,
      p_reservation_id: reservation.id,
      p_actual_units: Math.max(0, Math.ceil(actualUnits)),
      p_cost_micros: Math.max(0, Math.ceil(cost)),
    });
    if (error) throw error;
    return true;
  };

  const release = async ({ userId, reservation }) => {
    if (!reservation?.id) return true;
    await supabase.rpc('release_commercial_usage', { p_user_id: userId, p_reservation_id: reservation.id });
    return true;
  };

  const runMetered = async ({ userId, feature, units = 1, requestKey, entitlement, action, actualUnits }) => {
    const reservation = await reserve({ userId, feature, units, requestKey, entitlement });
    reservation.feature = feature;
    try {
      const result = await action({ access: reservation.access, reservation });
      await settle({ userId, reservation, actualUnits: actualUnits?.(result) ?? units });
      return { result, remaining: reservation.remaining };
    } catch (error) {
      await release({ userId, reservation });
      throw error;
    }
  };

  return { resolveAccess, snapshot, requireEntitlement, reserve, settle, release, runMetered };
};

export { monthWindow };
