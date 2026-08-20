import api from '../services/api';

export const COMMERCIAL_UI_ENABLED = import.meta.env.VITE_COMMERCIAL_MODE_ENABLED === 'true';

export const detectBillingCountry = () => {
  const stored = localStorage.getItem('socratic-billing-country');
  if (stored) return stored;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const locale = navigator.language || '';
  return timezone === 'Asia/Calcutta' || timezone === 'Asia/Kolkata' || /-IN$/i.test(locale) ? 'IN' : 'US';
};

export const currencyLabel = (amount, currency) => {
  if (amount === null || amount === undefined) return 'Custom';
  if (amount === 0) return 'Free';
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'INR' ? 0 : 2,
  }).format(amount / 100);
};

const loadScript = (src, globalName) => new Promise((resolve, reject) => {
  if (window[globalName]) return resolve(window[globalName]);
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) {
    existing.addEventListener('load', () => resolve(window[globalName]), { once: true });
    existing.addEventListener('error', reject, { once: true });
    return;
  }
  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  script.onload = () => resolve(window[globalName]);
  script.onerror = () => reject(new Error('Secure checkout could not be loaded.'));
  document.head.appendChild(script);
});

export const beginCheckout = async ({ planCode, interval, onSuccess }) => {
  const storageKey = `socratic-checkout:${planCode}:${interval}`;
  const requestId = sessionStorage.getItem(storageKey) || crypto.randomUUID();
  sessionStorage.setItem(storageKey, requestId);
  const complete = event => {
    sessionStorage.removeItem(storageKey);
    onSuccess?.(event);
  };
  // The region selector previews prices only. Checkout country/provider is
  // resolved server-side from a provider-verified customer or trusted proxy.
  const { data } = await api.post('/commercial/checkout', { planCode, interval }, { headers: { 'Idempotency-Key': requestId } });
  const checkout = data.checkout;
  if (checkout.provider === 'paddle') {
    const Paddle = await loadScript('https://cdn.paddle.com/paddle/v2/paddle.js', 'Paddle');
    if (checkout.mode === 'sandbox') Paddle.Environment.set('sandbox');
    if (!checkout.clientToken) throw new Error('Global checkout is not configured.');
    window.__socraticPaddleOnSuccess = complete;
    if (!window.__socraticPaddleInitialized) {
      Paddle.Initialize({
        token: checkout.clientToken,
        eventCallback: event => {
          if (event.name === 'checkout.completed') window.__socraticPaddleOnSuccess?.(event);
        },
      });
      window.__socraticPaddleInitialized = true;
    }
    Paddle.Checkout.open({
      items: [{ priceId: checkout.priceId, quantity: 1 }],
      customer: checkout.customer,
      customData: checkout.customData,
      settings: { displayMode: 'overlay', theme: 'dark', locale: 'en' },
    });
    return;
  }

  const Razorpay = await loadScript('https://checkout.razorpay.com/v1/checkout.js', 'Razorpay');
  const instance = new Razorpay({
    key: checkout.keyId,
    subscription_id: checkout.subscriptionId,
    name: checkout.name,
    description: checkout.description,
    prefill: checkout.prefill,
    theme: checkout.theme,
    handler: async response => {
      await api.post('/commercial/checkout/razorpay/verify', response);
      complete(response);
    },
  });
  instance.open();
};
