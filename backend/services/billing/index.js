import crypto from 'crypto';
import { resolveCheckoutProduct } from '../../lib/commercialConfig.js';
import { createPaddleCheckout, createPaddlePortalSession, cancelPaddleSubscription } from './paddle.js';
import { createRazorpayCheckout, cancelRazorpaySubscription } from './razorpay.js';
import { verifyRazorpayCheckoutSignature } from './signatures.js';

export const createBillingService = ({ fetchImpl = fetch } = {}) => ({
  async createCheckout({ planCode, interval, countryCode, currency, user, requestId = crypto.randomUUID(), product: suppliedProduct }) {
    const product = suppliedProduct || resolveCheckoutProduct({ planCode, interval, countryCode, currency });
    return product.provider === 'razorpay'
      ? createRazorpayCheckout({ product, user, requestId }, fetchImpl)
      : createPaddleCheckout({ product, user, requestId }, fetchImpl);
  },

  verifyRazorpayCheckout(payload) {
    return verifyRazorpayCheckoutSignature({
      paymentId: payload.razorpay_payment_id,
      subscriptionId: payload.razorpay_subscription_id,
      signature: payload.razorpay_signature,
      secret: process.env.RAZORPAY_KEY_SECRET,
    });
  },

  async createPortal(subscription) {
    if (!subscription) throw Object.assign(new Error('No active subscription was found.'), { statusCode: 404, code: 'NO_SUBSCRIPTION' });
    if (subscription.provider === 'paddle') {
      return createPaddlePortalSession({ customerId: subscription.provider_customer_id }, fetchImpl);
    }
    return { provider: 'razorpay', action: 'cancel-or-contact-support', url: null };
  },

  async cancel(subscription, atPeriodEnd = true) {
    if (!subscription) throw Object.assign(new Error('No active subscription was found.'), { statusCode: 404, code: 'NO_SUBSCRIPTION' });
    return subscription.provider === 'paddle'
      ? cancelPaddleSubscription({ subscriptionId: subscription.provider_subscription_id, atPeriodEnd }, fetchImpl)
      : cancelRazorpaySubscription({ subscriptionId: subscription.provider_subscription_id, atPeriodEnd }, fetchImpl);
  },
});
