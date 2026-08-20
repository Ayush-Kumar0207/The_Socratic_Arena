import { normalizeCountry, resolveBillingRegion } from './commercialConfig.js';

const unavailableCountry = value => !value || ['XX', 'T1', 'A1', 'A2'].includes(value);

export const trustedCountryHeaderName = () => String(
  process.env.BILLING_TRUSTED_COUNTRY_HEADER || '',
).trim().toLowerCase();

export const resolveTrustedRequestCountry = ({ req, storedCountry } = {}) => {
  const verified = normalizeCountry(storedCountry);
  if (!unavailableCountry(verified)) {
    return { ...resolveBillingRegion({ countryCode: verified }), source: 'provider_verified_customer' };
  }

  const headerName = trustedCountryHeaderName();
  const fromProxy = headerName ? normalizeCountry(req?.get?.(headerName)) : '';
  if (!unavailableCountry(fromProxy)) {
    return { ...resolveBillingRegion({ countryCode: fromProxy }), source: `trusted_proxy:${headerName}` };
  }

  const localOverride = process.env.NODE_ENV === 'production'
    ? ''
    : normalizeCountry(process.env.BILLING_COUNTRY_OVERRIDE);
  if (!unavailableCountry(localOverride)) {
    return { ...resolveBillingRegion({ countryCode: localOverride }), source: 'non_production_override' };
  }

  throw Object.assign(new Error('We could not securely verify your billing region. Please retry after regional checkout is configured, or contact support.'), {
    statusCode: 409,
    code: 'BILLING_REGION_UNVERIFIED',
  });
};

export const providerCountryMatchesAttempt = ({ provider, providerCountry, attemptedCountry }) => {
  const confirmed = normalizeCountry(providerCountry);
  const attempted = normalizeCountry(attemptedCountry);
  if (!confirmed) return true;
  if (provider === 'razorpay') return confirmed === 'IN' && attempted === 'IN';
  return confirmed !== 'IN' && attempted !== 'IN';
};
