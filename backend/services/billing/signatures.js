import crypto from 'crypto';

const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const verifyRazorpayWebhookSignature = ({ rawBody, signature, secret }) => {
  if (!secret || !signature || !Buffer.isBuffer(rawBody)) return false;
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqual(digest, signature);
};

export const verifyRazorpayCheckoutSignature = ({ paymentId, subscriptionId, signature, secret }) => {
  if (!paymentId || !subscriptionId || !signature || !secret) return false;
  const digest = crypto.createHmac('sha256', secret).update(`${paymentId}|${subscriptionId}`).digest('hex');
  return safeEqual(digest, signature);
};

const parsePaddleSignature = header => Object.fromEntries(
  String(header || '').split(';').map(part => part.trim().split('=')).filter(parts => parts.length === 2),
);

export const verifyPaddleWebhookSignature = ({ rawBody, signatureHeader, secret, toleranceSeconds = 300, now = Date.now() }) => {
  if (!secret || !signatureHeader || !Buffer.isBuffer(rawBody)) return false;
  const parsed = parsePaddleSignature(signatureHeader);
  const timestamp = Number(parsed.ts);
  if (!timestamp || !parsed.h1 || Math.abs(Math.floor(now / 1000) - timestamp) > toleranceSeconds) return false;
  const signedPayload = `${timestamp}:${rawBody.toString('utf8')}`;
  const digest = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  return safeEqual(digest, parsed.h1);
};
