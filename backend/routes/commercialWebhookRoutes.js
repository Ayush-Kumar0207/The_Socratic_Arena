import express from 'express';
import crypto from 'crypto';
import { verifyPaddleWebhookSignature, verifyRazorpayWebhookSignature } from '../services/billing/signatures.js';
import { commercialModeEnabled } from '../lib/commercialConfig.js';
import { providerCountryMatchesAttempt } from '../lib/billingRegion.js';
import { fetchPaddleBillingCountry } from '../services/billing/paddle.js';

const validUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');

const pricePlanMap = () => {
  const result = {};
  for (const provider of ['PADDLE_PRICE', 'RAZORPAY_PLAN']) {
    for (const plan of ['PLUS', 'PREMIUM']) {
      for (const interval of ['MONTHLY', 'ANNUAL']) {
        const value = process.env[`${provider}_${plan}_${interval}`];
        if (value) result[value] = { planCode: plan.toLowerCase(), interval: interval.toLowerCase() };
      }
    }
  }
  return result;
};

const normalizeStatus = (provider, status, eventType) => {
  if (provider === 'paddle') {
    return ({ active: 'active', trialing: 'trialing', past_due: 'past_due', paused: 'paused', canceled: 'cancelled' })[status]
      || (eventType.includes('canceled') ? 'cancelled' : 'pending');
  }
  return ({ active: 'active', authenticated: 'authenticated', pending: 'pending', halted: 'halted', paused: 'paused', cancelled: 'cancelled', completed: 'expired', expired: 'expired' })[status]
    || (eventType.includes('cancelled') ? 'cancelled' : 'pending');
};

const paddleEvent = payload => {
  const data = payload.data || {};
  const custom = data.custom_data || {};
  const firstItem = data.items?.[0];
  const mapped = pricePlanMap()[firstItem?.price?.id || firstItem?.price_id];
  return {
    eventId: payload.event_id || data.id || crypto.randomUUID(),
    eventType: payload.event_type || 'unknown',
    userId: custom.user_id,
    customerId: data.customer_id,
    addressId: data.address_id || data.billing_details?.address_id || null,
    subscriptionId: data.id,
    priceId: firstItem?.price?.id || firstItem?.price_id || null,
    planCode: mapped?.planCode || null,
    interval: mapped?.interval || 'monthly',
    currency: data.currency_code,
    billingCountry: data.billing_details?.address?.country_code || data.address?.country_code || null,
    status: normalizeStatus('paddle', data.status, payload.event_type || ''),
    periodStart: data.current_billing_period?.starts_at,
    periodEnd: data.current_billing_period?.ends_at,
    cancelAtPeriodEnd: data.scheduled_change?.action === 'cancel',
    cancelledAt: data.canceled_at,
    raw: data,
    checkoutRequestId: custom.checkout_request_id,
  };
};

const razorpayEvent = payload => {
  const data = payload.payload?.subscription?.entity || {};
  const payment = payload.payload?.payment?.entity || {};
  const notes = data.notes || {};
  const mapped = pricePlanMap()[data.plan_id];
  return {
    eventId: payload.id || payload.event_id || crypto.randomUUID(),
    eventType: payload.event || 'unknown',
    userId: notes.user_id,
    customerId: data.customer_id || `subscription:${data.id}`,
    subscriptionId: data.id,
    priceId: data.plan_id,
    planCode: mapped?.planCode || null,
    interval: mapped?.interval || 'monthly',
    currency: payment.currency || 'INR',
    billingCountry: payment.currency === 'INR' && payment.card?.international !== true ? 'IN' : null,
    status: normalizeStatus('razorpay', data.status, payload.event || ''),
    periodStart: data.current_start ? new Date(data.current_start * 1000).toISOString() : null,
    periodEnd: data.current_end ? new Date(data.current_end * 1000).toISOString() : null,
    cancelAtPeriodEnd: Boolean(data.cancel_at_cycle_end),
    cancelledAt: data.ended_at ? new Date(data.ended_at * 1000).toISOString() : null,
    raw: data,
    checkoutRequestId: notes.checkout_request_id,
  };
};

const processEvent = async ({ supabase, provider, parsed, payload }) => {
  const { error: eventError } = await supabase.from('billing_webhook_events').insert({
    provider,
    provider_event_id: parsed.eventId,
    event_type: parsed.eventType,
    payload,
  });
  if (eventError?.code === '23505') {
    const { data: prior, error: priorError } = await supabase.from('billing_webhook_events').select('status').eq('provider', provider).eq('provider_event_id', parsed.eventId).limit(1);
    if (priorError) throw priorError;
    if (prior?.[0]?.status !== 'failed') return { duplicate: true };
    const { error: retryError } = await supabase.from('billing_webhook_events').update({ status: 'received', error_message: null, processed_at: null }).eq('provider', provider).eq('provider_event_id', parsed.eventId);
    if (retryError) throw retryError;
  } else if (eventError) {
    throw eventError;
  }

  try {
    let trustedIdentity = null;
    if (parsed.checkoutRequestId) {
      const { data: attempts, error: attemptError } = await supabase
        .from('billing_checkout_attempts')
        .select('id,user_id,provider,plan_code,billing_interval,billing_country,country_source,status,expires_at')
        .eq('id', parsed.checkoutRequestId)
        .eq('provider', provider)
        .eq('status', 'initiated')
        .gt('expires_at', new Date().toISOString())
        .limit(1);
      if (attemptError) throw attemptError;
      if (attempts?.[0]) {
        const productMismatch = !parsed.planCode || (
          parsed.planCode !== attempts[0].plan_code || parsed.interval !== attempts[0].billing_interval
        );
        if (productMismatch) {
          await supabase.from('billing_webhook_events').update({ status: 'ignored', error_message: 'Provider product did not match the server-created checkout attempt.', processed_at: new Date().toISOString() }).eq('provider', provider).eq('provider_event_id', parsed.eventId);
          return { ignored: true, reason: 'product_mismatch' };
        }
        if (!providerCountryMatchesAttempt({ provider, providerCountry: parsed.billingCountry, attemptedCountry: attempts[0].billing_country })) {
          await supabase.from('billing_webhook_events').update({ status: 'ignored', error_message: 'Provider-confirmed billing country did not match the trusted checkout region.', processed_at: new Date().toISOString() }).eq('provider', provider).eq('provider_event_id', parsed.eventId);
          return { ignored: true, reason: 'billing_country_mismatch' };
        }
        if (!parsed.billingCountry) {
          await supabase.from('billing_webhook_events').update({ status: 'ignored', error_message: 'Provider did not confirm a billing country for first-time activation.', processed_at: new Date().toISOString() }).eq('provider', provider).eq('provider_event_id', parsed.eventId);
          return { ignored: true, reason: 'billing_country_unverified' };
        }
        trustedIdentity = attempts[0];
      }
    }
    if (!trustedIdentity && parsed.subscriptionId) {
      const { data: existing, error: existingError } = await supabase
        .from('commercial_subscriptions')
        .select('user_id,provider,provider_customer_id,plan_code,billing_interval')
        .eq('provider', provider)
        .eq('provider_subscription_id', parsed.subscriptionId)
        .limit(1);
      if (existingError) throw existingError;
      if (existing?.[0]) {
        const customerMismatch = parsed.customerId && existing[0].provider_customer_id && parsed.customerId !== existing[0].provider_customer_id;
        const productMismatch = parsed.planCode && (parsed.planCode !== existing[0].plan_code || parsed.interval !== existing[0].billing_interval);
        if (customerMismatch || productMismatch) {
          await supabase.from('billing_webhook_events').update({ status: 'ignored', error_message: customerMismatch ? 'Provider customer did not match the trusted subscription.' : 'Provider product change was not initiated by the server.', processed_at: new Date().toISOString() }).eq('provider', provider).eq('provider_event_id', parsed.eventId);
          return { ignored: true, reason: customerMismatch ? 'customer_mismatch' : 'untrusted_product_change' };
        }
        trustedIdentity = existing[0];
      }
    }
    if (trustedIdentity) {
      parsed.userId = trustedIdentity.user_id;
      parsed.planCode = trustedIdentity.plan_code;
      parsed.interval = trustedIdentity.billing_interval;
    }
    if (!trustedIdentity) {
      await supabase.from('billing_webhook_events').update({ status: 'ignored', error_message: 'First-time activation requires a valid server-created checkout attempt; existing subscriptions must match provider subscription ID.', processed_at: new Date().toISOString() }).eq('provider', provider).eq('provider_event_id', parsed.eventId);
      return { ignored: true, reason: 'untrusted_subscription_ownership' };
    }
    if (!parsed.subscriptionId || !validUuid(parsed.userId) || !['plus', 'premium', 'business'].includes(parsed.planCode)) {
      await supabase.from('billing_webhook_events').update({ status: 'ignored', processed_at: new Date().toISOString() }).eq('provider', provider).eq('provider_event_id', parsed.eventId);
      return { ignored: true };
    }

    if (parsed.customerId) {
      const customerRecord = {
        user_id: parsed.userId,
        provider,
        provider_customer_id: parsed.customerId,
        currency: parsed.currency || null,
        updated_at: new Date().toISOString(),
      };
      const confirmedCountry = parsed.billingCountry || trustedIdentity.billing_country;
      if (confirmedCountry) customerRecord.billing_country = confirmedCountry;
      const { error } = await supabase.from('billing_customers').upsert(customerRecord, { onConflict: 'provider,provider_customer_id' });
      if (error) throw error;
    }

    const { error: subscriptionError } = await supabase.from('commercial_subscriptions').upsert({
      user_id: parsed.userId,
      provider,
      provider_customer_id: parsed.customerId || null,
      provider_subscription_id: parsed.subscriptionId,
      provider_price_id: parsed.priceId || null,
      plan_code: parsed.planCode,
      billing_interval: parsed.interval,
      currency: parsed.currency || null,
      status: parsed.status,
      current_period_start: parsed.periodStart || null,
      current_period_end: parsed.periodEnd || null,
      cancel_at_period_end: parsed.cancelAtPeriodEnd,
      cancelled_at: parsed.cancelledAt || null,
      provider_metadata: parsed.raw,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'provider,provider_subscription_id' });
    if (subscriptionError) throw subscriptionError;

    await supabase.from('billing_webhook_events').update({ status: 'processed', processed_at: new Date().toISOString() }).eq('provider', provider).eq('provider_event_id', parsed.eventId);
    if (parsed.checkoutRequestId) {
      await supabase.from('billing_checkout_attempts').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', parsed.checkoutRequestId).eq('user_id', parsed.userId);
    }
    return { processed: true };
  } catch (error) {
    await supabase.from('billing_webhook_events').update({ status: 'failed', error_message: String(error.message || error).slice(0, 1000), processed_at: new Date().toISOString() }).eq('provider', provider).eq('provider_event_id', parsed.eventId);
    throw error;
  }
};

export default function createCommercialWebhookRoutes({ supabase }) {
  const router = express.Router();
  const rawJson = express.raw({ type: 'application/json', limit: '1mb' });

  router.use((req, res, next) => commercialModeEnabled()
    ? next()
    : res.status(404).json({ success: false, code: 'COMMERCIAL_MODE_DISABLED' }));

  router.post('/paddle', rawJson, async (req, res) => {
    if (!verifyPaddleWebhookSignature({ rawBody: req.body, signatureHeader: req.get('paddle-signature'), secret: process.env.PADDLE_WEBHOOK_SECRET })) {
      return res.status(401).json({ success: false, message: 'Invalid Paddle signature' });
    }
    try {
      const payload = JSON.parse(req.body.toString('utf8'));
      const parsed = paddleEvent(payload);
      if (!String(parsed.eventType).startsWith('subscription.')) return res.status(200).json({ success: true, ignored: true, reason: 'unsupported_event' });
      if (!parsed.billingCountry && parsed.customerId && parsed.addressId) {
        parsed.billingCountry = await fetchPaddleBillingCountry({ customerId: parsed.customerId, addressId: parsed.addressId });
      }
      const result = await processEvent({ supabase, provider: 'paddle', parsed, payload });
      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      console.error('[Billing] Paddle webhook failed:', error.message);
      return res.status(500).json({ success: false });
    }
  });

  router.post('/razorpay', rawJson, async (req, res) => {
    if (!verifyRazorpayWebhookSignature({ rawBody: req.body, signature: req.get('x-razorpay-signature'), secret: process.env.RAZORPAY_WEBHOOK_SECRET })) {
      return res.status(401).json({ success: false, message: 'Invalid Razorpay signature' });
    }
    try {
      const payload = JSON.parse(req.body.toString('utf8'));
      payload.id = req.get('x-razorpay-event-id') || payload.id;
      const parsed = razorpayEvent(payload);
      if (!String(parsed.eventType).startsWith('subscription.')) return res.status(200).json({ success: true, ignored: true, reason: 'unsupported_event' });
      const result = await processEvent({ supabase, provider: 'razorpay', parsed, payload });
      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      console.error('[Billing] Razorpay webhook failed:', error.message);
      return res.status(500).json({ success: false });
    }
  });

  return router;
}

export { normalizeStatus, paddleEvent, razorpayEvent, processEvent };
