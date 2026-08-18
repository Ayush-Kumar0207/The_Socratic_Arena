import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { readFile } from 'fs/promises';
import {
  getCommercialLimits,
  getPublicPlanCatalog,
  resolveBillingRegion,
  resolveCheckoutProduct,
} from '../lib/commercialConfig.js';
import { createCommercialService } from '../lib/commercialService.js';
import {
  verifyPaddleWebhookSignature,
  verifyRazorpayCheckoutSignature,
  verifyRazorpayWebhookSignature,
} from '../services/billing/signatures.js';
import { normalizeStatus, paddleEvent, razorpayEvent } from '../routes/commercialWebhookRoutes.js';

const withEnv = async (values, callback) => {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
  try { return await callback(); }
  finally {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
};

test('billing region deterministically routes India to Razorpay and global users to Paddle', () => {
  assert.deepEqual(resolveBillingRegion({ countryCode: 'IN' }), { provider: 'razorpay', currency: 'INR', countryCode: 'IN' });
  assert.deepEqual(resolveBillingRegion({ currency: 'INR' }), { provider: 'razorpay', currency: 'INR', countryCode: 'IN' });
  assert.deepEqual(resolveBillingRegion({ countryCode: 'GB' }), { provider: 'paddle', currency: 'USD', countryCode: 'GB' });
});

test('public catalog keeps human debate free and annual paid prices discounted', () => {
  const india = getPublicPlanCatalog({ countryCode: 'IN' });
  const starter = india.plans.find(plan => plan.code === 'starter');
  const plus = india.plans.find(plan => plan.code === 'plus');
  assert.equal(starter.prices.monthly, 0);
  assert.equal(starter.entitlements.human_debates, true);
  assert.equal(plus.prices.monthly, 29900);
  assert.ok(plus.prices.annual < plus.prices.monthly * 12);
  assert.equal(plus.provider, 'razorpay');
});

test('checkout products use only server-owned provider identifiers', async () => {
  await withEnv({ RAZORPAY_PLAN_PLUS_MONTHLY: 'plan_india_plus', PADDLE_PRICE_PREMIUM_ANNUAL: 'pri_global_premium' }, () => {
    assert.equal(resolveCheckoutProduct({ planCode: 'plus', interval: 'monthly', countryCode: 'IN' }).externalPriceId, 'plan_india_plus');
    assert.equal(resolveCheckoutProduct({ planCode: 'premium', interval: 'annual', countryCode: 'US' }).externalPriceId, 'pri_global_premium');
    assert.throws(() => resolveCheckoutProduct({ planCode: 'business', countryCode: 'IN' }), /self-serve/);
  });
});

test('Paddle and Razorpay signatures are verified from exact raw bytes', () => {
  const rawBody = Buffer.from('{"event":"subscription.charged"}');
  const razorSecret = 'razor-secret';
  const razorSignature = crypto.createHmac('sha256', razorSecret).update(rawBody).digest('hex');
  assert.equal(verifyRazorpayWebhookSignature({ rawBody, signature: razorSignature, secret: razorSecret }), true);
  assert.equal(verifyRazorpayWebhookSignature({ rawBody: Buffer.from('{}'), signature: razorSignature, secret: razorSecret }), false);

  const timestamp = 1_800_000_000;
  const paddleSecret = 'paddle-secret';
  const paddleSignature = crypto.createHmac('sha256', paddleSecret).update(`${timestamp}:${rawBody}`).digest('hex');
  assert.equal(verifyPaddleWebhookSignature({ rawBody, signatureHeader: `ts=${timestamp};h1=${paddleSignature}`, secret: paddleSecret, now: timestamp * 1000 }), true);
  assert.equal(verifyPaddleWebhookSignature({ rawBody, signatureHeader: `ts=${timestamp};h1=${paddleSignature}`, secret: paddleSecret, now: (timestamp + 301) * 1000 }), false);

  const checkout = crypto.createHmac('sha256', razorSecret).update('pay_1|sub_1').digest('hex');
  assert.equal(verifyRazorpayCheckoutSignature({ paymentId: 'pay_1', subscriptionId: 'sub_1', signature: checkout, secret: razorSecret }), true);
});

test('provider events normalize to one subscription state contract', async () => {
  await withEnv({ PADDLE_PRICE_PLUS_MONTHLY: 'pri_plus', RAZORPAY_PLAN_PREMIUM_ANNUAL: 'plan_premium' }, () => {
    const paddle = paddleEvent({ event_id: 'evt_1', event_type: 'subscription.updated', data: { id: 'sub_1', customer_id: 'ctm_1', status: 'active', currency_code: 'USD', custom_data: { user_id: '11111111-1111-4111-8111-111111111111' }, items: [{ price: { id: 'pri_plus' } }] } });
    assert.equal(paddle.planCode, 'plus');
    assert.equal(paddle.status, 'active');
    const razor = razorpayEvent({ event: 'subscription.cancelled', payload: { subscription: { entity: { id: 'sub_2', plan_id: 'plan_premium', status: 'cancelled', notes: { user_id: '11111111-1111-4111-8111-111111111111' } } } } });
    assert.equal(razor.planCode, 'premium');
    assert.equal(razor.interval, 'annual');
    assert.equal(normalizeStatus('razorpay', 'halted', ''), 'halted');
  });
});

test('commercial service is a database-free no-op while beta flag is disabled', async () => {
  await withEnv({ COMMERCIAL_MODE_ENABLED: 'false' }, async () => {
    const supabase = new Proxy({}, { get() { throw new Error('database should not be touched'); } });
    const service = createCommercialService({ supabase });
    const access = await service.resolveAccess('user');
    assert.equal(access.enabled, false);
    assert.equal(access.planCode, 'starter');
    const metered = await service.runMetered({ userId: 'user', feature: 'ai_practice_turn', entitlement: 'ai_sparring', action: async () => 'ok' });
    assert.equal(metered.result, 'ok');
  });
});

test('commercial allowances have monthly budgets plus daily abuse ceilings', () => {
  for (const plan of ['starter', 'plus', 'premium']) {
    const limits = getCommercialLimits(plan);
    for (const [feature, daily] of Object.entries(limits.daily)) {
      assert.ok(daily <= limits.monthly[feature], `${plan}.${feature} daily ceiling must fit monthly allowance`);
    }
  }
});

test('commercial migration provides atomic usage, signed-webhook audit, private premium data, and organizations', async () => {
  const sql = await readFile(new URL('../migrations/008_commercial_platform.sql', import.meta.url), 'utf8');
  for (const object of ['commercial_subscriptions', 'commercial_usage_reservations', 'billing_webhook_events', 'mentor_memories', 'deep_reviews', 'evidence_vault_collections', 'organizations', 'organization_audit_logs']) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${object}`, 'i'));
  }
  assert.match(sql, /create or replace function public\.reserve_commercial_usage/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /unique \(user_id, request_key\)/i);
  assert.match(sql, /revoke all on function public\.reserve_commercial_usage[\s\S]*from public, anon, authenticated/i);
});
