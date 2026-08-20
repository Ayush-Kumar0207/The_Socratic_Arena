import { config } from 'dotenv';
import { getPlan } from '../lib/commercialConfig.js';

config();

const failures = [];
const checks = [];
const required = name => {
  const value = String(process.env[name] || '').trim();
  if (!value) failures.push(`${name} is missing`);
  return value;
};
const check = (condition, message) => {
  checks.push({ ok: Boolean(condition), message });
  if (!condition) failures.push(message);
};

const paddleBase = process.env.PADDLE_ENVIRONMENT === 'production' ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com';
const paddleApiKey = required('PADDLE_API_KEY');
required('PADDLE_CLIENT_TOKEN');
required('PADDLE_WEBHOOK_SECRET');
const razorpayKeyId = required('RAZORPAY_KEY_ID');
const razorpaySecret = required('RAZORPAY_KEY_SECRET');
required('RAZORPAY_WEBHOOK_SECRET');
required('BILLING_TRUSTED_COUNTRY_HEADER');
check(process.env.NODE_ENV !== 'production' || !process.env.BILLING_COUNTRY_OVERRIDE, 'BILLING_COUNTRY_OVERRIDE must be empty in production');

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${payload?.error?.description || payload?.error?.detail || payload?.error?.type || 'provider request failed'}`);
  return payload;
};

for (const planCode of ['plus', 'premium']) {
  const plan = getPlan(planCode);
  for (const interval of ['monthly', 'annual']) {
    const suffix = `${planCode.toUpperCase()}_${interval.toUpperCase()}`;
    const paddlePriceId = required(`PADDLE_PRICE_${suffix}`);
    const razorpayPlanId = required(`RAZORPAY_PLAN_${suffix}`);
    if (paddlePriceId && paddleApiKey) {
      try {
        const payload = await fetchJson(`${paddleBase}/prices/${encodeURIComponent(paddlePriceId)}`, { headers: { Authorization: `Bearer ${paddleApiKey}` } });
        const price = payload.data || {};
        check(price.status === 'active', `Paddle ${suffix} price must be active`);
        check(price.unit_price?.currency_code === 'USD', `Paddle ${suffix} currency must be USD`);
        check(Number(price.unit_price?.amount) === plan.prices.USD[interval], `Paddle ${suffix} amount must equal ${plan.prices.USD[interval]} cents`);
        check(price.billing_cycle?.interval === (interval === 'annual' ? 'year' : 'month'), `Paddle ${suffix} billing interval is incorrect`);
      } catch (error) { failures.push(`Paddle ${suffix}: ${error.message}`); }
    }
    if (razorpayPlanId && razorpayKeyId && razorpaySecret) {
      try {
        const payload = await fetchJson(`https://api.razorpay.com/v1/plans/${encodeURIComponent(razorpayPlanId)}`, { headers: { Authorization: `Basic ${Buffer.from(`${razorpayKeyId}:${razorpaySecret}`).toString('base64')}` } });
        check(payload.item?.currency === 'INR', `Razorpay ${suffix} currency must be INR`);
        check(Number(payload.item?.amount) === plan.prices.INR[interval], `Razorpay ${suffix} amount must equal ${plan.prices.INR[interval]} paise`);
        check(payload.period === (interval === 'annual' ? 'yearly' : 'monthly'), `Razorpay ${suffix} billing period is incorrect`);
        check(Number(payload.interval) === 1, `Razorpay ${suffix} interval must be 1`);
      } catch (error) { failures.push(`Razorpay ${suffix}: ${error.message}`); }
    }
  }
}

const baseUrl = String(process.env.COMMERCIAL_BASE_URL || '').replace(/\/$/, '');
if (baseUrl) {
  try {
    const payload = await fetchJson(`${baseUrl}/api/commercial/catalog?country=US`);
    check(payload.commercialEnabled === true, 'Deployed backend commercial mode must be enabled');
    check(payload.region?.provider === 'paddle', 'Deployed international catalog must route to Paddle');
  } catch (error) { failures.push(`Hosted commercial catalog: ${error.message}`); }
}

console.log(JSON.stringify({ ok: failures.length === 0, environment: process.env.PADDLE_ENVIRONMENT || 'sandbox', checks, failures }, null, 2));
if (failures.length) process.exitCode = 1;
