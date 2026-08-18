const paddleApiBase = () => process.env.PADDLE_ENVIRONMENT === 'production'
  ? 'https://api.paddle.com'
  : 'https://sandbox-api.paddle.com';

const paddleFetch = async (path, options = {}, fetchImpl = fetch) => {
  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) throw Object.assign(new Error('Paddle billing is not configured.'), { statusCode: 503, code: 'BILLING_NOT_CONFIGURED' });
  const response = await fetchImpl(`${paddleApiBase()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(payload?.error?.detail || payload?.error?.type || 'Paddle request failed.'), {
      statusCode: response.status >= 500 ? 502 : 400,
      code: 'PADDLE_ERROR',
    });
  }
  return payload.data;
};

export const createPaddleCheckout = async ({ product, user, requestId }, fetchImpl = fetch) => ({
  provider: 'paddle',
  mode: process.env.PADDLE_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
  clientToken: process.env.PADDLE_CLIENT_TOKEN || null,
  priceId: product.externalPriceId,
  customer: { email: user.email || undefined },
  customData: {
    user_id: user.id,
    plan_code: product.planCode,
    billing_interval: product.interval,
    checkout_request_id: requestId,
  },
});

export const createPaddlePortalSession = async ({ customerId }, fetchImpl = fetch) => {
  const data = await paddleFetch(`/customers/${encodeURIComponent(customerId)}/portal-sessions`, { method: 'POST', body: '{}' }, fetchImpl);
  return {
    provider: 'paddle',
    url: data.urls?.general?.overview || data.urls?.general || null,
    urls: data.urls || {},
  };
};

export const cancelPaddleSubscription = async ({ subscriptionId, atPeriodEnd = true }, fetchImpl = fetch) => {
  const data = await paddleFetch(`/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify(atPeriodEnd ? { effective_from: 'next_billing_period' } : { effective_from: 'immediately' }),
  }, fetchImpl);
  return { provider: 'paddle', subscription: data };
};
