const RAZORPAY_API = 'https://api.razorpay.com/v1';

const razorpayFetch = async (path, options = {}, fetchImpl = fetch) => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw Object.assign(new Error('Razorpay billing is not configured.'), { statusCode: 503, code: 'BILLING_NOT_CONFIGURED' });
  const response = await fetchImpl(`${RAZORPAY_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(payload?.error?.description || 'Razorpay request failed.'), {
      statusCode: response.status >= 500 ? 502 : 400,
      code: 'RAZORPAY_ERROR',
    });
  }
  return payload;
};

export const createRazorpayCheckout = async ({ product, user, requestId }, fetchImpl = fetch) => {
  const totalCount = product.interval === 'annual' ? 5 : 60;
  const subscription = await razorpayFetch('/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      plan_id: product.externalPriceId,
      total_count: totalCount,
      quantity: 1,
      customer_notify: true,
      notes: {
        user_id: user.id,
        plan_code: product.planCode,
        billing_interval: product.interval,
        checkout_request_id: requestId,
      },
    }),
  }, fetchImpl);
  return {
    provider: 'razorpay',
    keyId: process.env.RAZORPAY_KEY_ID,
    subscriptionId: subscription.id,
    name: 'Socratic Arena',
    description: `${product.planCode === 'premium' ? 'Premium' : 'Plus'} · ${product.interval}`,
    prefill: { email: user.email || '' },
    theme: { color: '#06b6d4' },
  };
};

export const cancelRazorpaySubscription = async ({ subscriptionId, atPeriodEnd = true }, fetchImpl = fetch) => {
  const data = await razorpayFetch(`/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ cancel_at_cycle_end: atPeriodEnd ? 1 : 0 }),
  }, fetchImpl);
  return { provider: 'razorpay', subscription: data };
};
