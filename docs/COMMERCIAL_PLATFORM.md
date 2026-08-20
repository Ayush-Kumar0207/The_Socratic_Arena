# Socratic Arena commercial platform

This work is intentionally isolated from the Product Hunt beta. The production
beta remains on `main`; the commercial implementation lives on
`codex/pro-market` and is disabled unless both commercial flags are explicitly
enabled.

## Product contract

| Plan | India | International | Core value |
|---|---:|---:|---|
| Starter | Free | Free | Human debates, public Arenas, core profile, limited AI practice |
| Plus | ₹299/month | $5.99/month | Larger AI allowance, progression, analytics, replay, vault, career simulations |
| Premium | ₹799/month | $14.99/month | Mentor/Twin, adversarial coaching, Deep Review, Voice Pro, full replay/vault |
| Business & Education | Custom | Custom | Organization roles, cohorts, pooled usage, policies, audit, reporting |

Annual self-serve prices are approximately 20% below twelve monthly payments.
The server catalog is the source of truth; amounts displayed by the browser are
never accepted back as checkout input.

Human-to-human competitive participation stays free. Paid tools cannot change
official scores, Elo, or the original judge audit trail.

## Regional payment decision

Socratic Arena uses one internal subscription model with two adapters:

- **India / INR — Razorpay.** Use Subscriptions with UPI Autopay, cards, and
  eMandate. This produces a familiar Indian checkout and INR settlement.
- **International / USD — Paddle.** Paddle is the Merchant of Record and handles
  checkout, invoices, sales tax, VAT, and supported-country tax obligations.
- **No Stripe at initial commercial release.** A third provider would add
  reconciliation and support risk without improving the initial regional fit.

The country selector is a pricing preview only. Checkout sends only plan and
interval. The backend selects the provider from a previously provider-verified
billing country or `BILLING_TRUSTED_COUNTRY_HEADER`, which must be overwritten
by a trusted edge that clients cannot bypass. Production checkout returns
`BILLING_REGION_UNVERIFIED` when neither source exists. The non-production-only
`BILLING_COUNTRY_OVERRIDE` supports local and staging acceptance tests.

## Isolation and merge safety

1. `main` remains the public beta and is not modified or deployed by this work.
2. `codex/pro-market` starts at the exact production commit and contains only
   additive routes, tables, pages, and feature-flagged integrations.
3. `COMMERCIAL_MODE_ENABLED=false` leaves only the database-free public catalog;
   every other `/api/commercial` route and both webhook endpoints return 404
   before authentication, raw-body parsing, provider calls, or database access.
4. `VITE_COMMERCIAL_MODE_ENABLED=false` hides commercial navigation.
5. Migration `008_commercial_platform.sql` creates new tables/functions and only
   adds nullable Evidence Vault columns to `evidence_documents`.
6. The later merge should first merge current `main` into `codex/pro-market`,
   resolve and validate there, and only then open the final production PR.

## Subscription authority

The client is never subscription authority. Entitlements are derived from:

1. a verified provider webhook;
2. an active/trialing provider-neutral subscription row;
3. an optional time-bounded server-side entitlement override; or
4. active organization membership and its Business plan.

Paddle signatures use the exact raw body plus `Paddle-Signature` timestamp/HMAC.
Razorpay signatures use the exact raw body plus `X-Razorpay-Signature` HMAC.
`billing_webhook_events` provides a unique provider event ID, private payload
audit, status, and error record. Duplicate delivery is acknowledged without
reapplying state, while a previously failed delivery may safely retry.

A first-time subscription is never linked from Paddle `custom_data` or Razorpay
notes alone. It must match an unexpired, server-created checkout attempt with the
same provider, mapped price, interval, and billing region. Later events must
match an already trusted provider subscription ID. Paddle billing country is
read from the provider address API; Razorpay activation requires a confirmed INR
payment. A mismatch is audited and ignored without granting entitlements.

## Usage and abuse protection

Each metered operation follows reserve → provider call → settle. A failed call
releases the reservation. The PostgreSQL reservation function locks the balance
row, so concurrent tabs cannot overspend a monthly allowance. The request key is
unique per user and makes retries idempotent.

Every plan has both:

- a durable monthly allowance tied to the billing period; and
- a smaller UTC daily ceiling to prevent scripts or a stolen session from
  consuming an entire month at once.

Global launch capacity limits remain active even for paid users. “Unlimited AI”
is not advertised.

### Measured cost accounting

Settled usage records actual Gemini input, cached-input, output, and thinking
tokens from provider response metadata. Polly records the exact synthesized
character count, engine, and AWS request ID. The rate used for every call is
stored with that event, so later rate changes do not rewrite history. Missing
measurement is explicitly marked `unmeasured` and costs zero rather than using a
fictional feature estimate.

`GET /api/commercial/internal/costs` returns measured cost by feature and user,
including measured/unmeasured coverage. After an actual Google or AWS invoice
arrives, a platform administrator posts its period and total to
`POST /api/commercial/internal/costs/reconcile`. The stored allocation ratio
turns measured list cost into invoice-reconciled cost without losing the raw
token/character ledger. Provider prices are configurable in the environment and
recorded in `provider_cost_rates` with source URLs and effective dates.

### Voice Pro privacy and measurements

Voice Pro can record directly in Pro Studio. Web Audio calculates frame-level
RMS, voiced ratio, pauses and hesitation timing, pitch and pitch variation,
volume dynamics, speaking rate, filler frequency, and an abrupt-cutoff indicator
inside the browser. Only bounded measurements and the user-approved transcript
are uploaded; raw audio remains local and can be replayed only in that browser
session. Transcript-only analysis remains available and must label acoustic
traits `not_measured`.

### Whose Gemini quota is used?

All current web users call the Socratic Arena backend, so requests use the
backend project's Gemini API key, quota, and billing—not the user's Gemini app,
Google AI Pro, or browser session. Gemini API keys inherit quota and billing
from their Google Cloud/AI Studio project.

Bring-your-own-key is technically possible, but it is deliberately not part of
the first commercial release: it would require encrypted secret storage,
rotation/revocation controls, provider-specific consent, clear data-processing
terms, and a reliable way to distinguish a consumer Gemini subscription from a
Gemini Developer API project. The plan ledger and global caps are the safer
initial abuse boundary.

## Provider dashboard setup

### Paddle sandbox

1. Create monthly and annual recurring prices for Plus and Premium.
2. Put their `pri_...` identifiers in the four `PADDLE_PRICE_*` variables.
3. Create a client-side token and set `PADDLE_CLIENT_TOKEN`.
4. Set `PADDLE_API_KEY` and the endpoint secret in `PADDLE_WEBHOOK_SECRET`.
5. Register `POST /api/commercial/webhooks/paddle`.
6. Subscribe to subscription created, updated, activated, paused, resumed,
   canceled, and past-due events.
7. Keep `PADDLE_ENVIRONMENT=sandbox` through acceptance testing.

### Razorpay test mode

1. Create four Subscription Plans in INR. Annual products should have annual
   billing periods; do not model an annual discount as twelve monthly charges.
2. Put their `plan_...` identifiers in the four `RAZORPAY_PLAN_*` variables.
3. Set the test key ID/secret and a separate webhook secret.
4. Register `POST /api/commercial/webhooks/razorpay`.
5. Subscribe to authenticated, activated, charged, pending, halted, paused,
   resumed, cancelled, completed, and expired subscription events.
6. Test cards and the available UPI Autopay test flow before requesting live
   activation.

Never commit credentials, copy a live provider secret into a preview, or reuse a
webhook secret as an API key.

After adding test credentials, run `npm run verify:commercial` in `backend`.
It fetches every Paddle price and Razorpay plan from the provider, verifies
currency, amount, interval, active state, regional-header configuration, and an
optional deployed catalog. It prints no secrets. This is a configuration gate,
not a substitute for completing the interactive provider checkout scenarios.

## Activation checklist

1. Merge the latest `main` into `codex/pro-market` and run the full suite.
2. Back up Supabase and apply migration 008 to a preview/staging project.
3. Add sandbox/test provider IDs and secrets to the backend preview only.
4. Build the frontend preview with `VITE_COMMERCIAL_MODE_ENABLED=true`; keep the
   backend flag false and verify pricing/legal pages remain safe.
5. Enable `COMMERCIAL_MODE_ENABLED=true` in preview.
6. Complete Plus and Premium purchases through both providers.
7. Replay webhook deliveries and confirm one subscription/one event application,
   then tamper with checkout custom data and confirm no entitlement is granted.
8. Test renew, past due, halt, cancel at period end, immediate cancellation,
   refund, and chargeback states.
9. Run concurrency tests against the reserve/settle ledger and verify daily and
   monthly friendly-limit messages. Confirm token/character metadata appears in
   the cost dashboard and reconcile it to a provider test invoice/export.
10. Obtain legal/tax review of the draft Terms, Privacy, and Refund pages.
11. Create a database restore point, switch provider credentials to live, and
    deploy backend before the frontend flag.
12. Enable the frontend flag only after backend health and webhook probes pass.

## Rollback

Turn off `VITE_COMMERCIAL_MODE_ENABLED` to remove entry points, then turn off
`COMMERCIAL_MODE_ENABLED` to restore beta allowances without dropping data.
Do not delete subscription or webhook records during rollback. Existing provider
renewals must be paused/cancelled in their dashboards if checkout was already
live. Database objects are additive and should remain for audit and a safe retry.

## What still requires owner/provider action

Code cannot create verified live merchant accounts, complete KYC, accept provider
terms, choose the legal seller name, obtain live secrets, manufacture a real
provider invoice, or provide jurisdiction-specific legal approval. Those actions
must be completed by the owner/providers/counsel before commercial activation.
The implementation deliberately fails closed instead of falling back to an
unsafe region, user-supplied price, or unverified entitlement.
