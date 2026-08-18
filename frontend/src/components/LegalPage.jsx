import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, LockKeyhole, RotateCcw } from 'lucide-react';

const policies = {
  terms: {
    title: 'Terms of Service',
    icon: FileText,
    intro: 'These terms govern access to Socratic Arena, including free debate features, paid coaching tools, and organization workspaces.',
    sections: [
      ['The service', 'Socratic Arena provides structured debate, practice, coaching, evidence, and simulation tools. AI feedback is advisory. It is not professional, legal, medical, academic, or factual certification, and it must not be represented as proof.'],
      ['Accounts and acceptable use', 'You are responsible for your account and activity. Do not harass, impersonate, manipulate rankings, upload content you cannot lawfully use, evade usage limits, scrape the service, automate abuse, compromise another account, or use the service to cause harm.'],
      ['Competitive integrity', 'Official results use the published Arena judging method. Private Pro analysis, replay, and mentor output do not alter Elo, official scores, or the original audit trail. We may invalidate activity produced through abuse or technical exploitation.'],
      ['Subscriptions', 'Paid plans renew for the selected interval until cancelled. Price, currency, tax treatment, provider, allowance, and renewal timing are shown before checkout. India checkout may be handled by Razorpay; international checkout may be handled by Paddle. Provider confirmation is authoritative.'],
      ['AI allowances', 'Plans include stated monthly allowances and daily safety ceilings. Failed requests should be released when processing fails, but network interruptions may delay reconciliation. Allowances have no cash value and do not roll over unless expressly stated.'],
      ['Content and privacy', 'You keep ownership of content you submit. You grant the limited rights needed to host, process, moderate, and deliver the requested service. Private evidence and organization content are handled according to the Privacy Policy and chosen retention controls.'],
      ['Availability and changes', 'We may improve, secure, suspend, or discontinue features. We aim to give reasonable notice for material paid-plan changes. The service is provided without a guarantee of uninterrupted availability or a particular outcome.'],
      ['Suspension and termination', 'We may restrict accounts for abuse, fraud, safety threats, legal requirements, or repeated policy violations. Appeals are available where shown in the product. You may stop using the free service or cancel a subscription at any time.'],
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    icon: LockKeyhole,
    intro: 'This policy explains the information Socratic Arena uses to operate debates, coaching, billing, safety, and organization workspaces.',
    sections: [
      ['Information collected', 'We process account identifiers, profile information, debates and practice content, evidence you choose to upload, coaching history, usage and device diagnostics, safety reports, organization membership, and billing status. Payment credentials are collected by the checkout provider, not stored by Socratic Arena.'],
      ['How information is used', 'Information is used to authenticate users, run debates, produce requested AI coaching, calculate profiles and rankings, prevent abuse, enforce allowances, support customers, improve reliability, meet legal obligations, and administer subscriptions.'],
      ['AI processing', 'When you invoke an AI feature, the necessary prompt and context may be sent to the configured AI provider. We minimize context to the requested task. Organization administrators should configure policies before members submit sensitive or regulated information.'],
      ['Evidence and mentor data', 'Evidence Vault collections are private and have explicit retention settings. Raw Evidence Arena PDFs are not retained by the current ingestion flow; extracted private chunks may be retained when a vault is enabled. Mentor memories are visible in Pro Studio and can be deactivated or deleted through future account controls or a support request.'],
      ['Service providers', 'Infrastructure, database, cache, AI, speech, monitoring, email, and payment providers process data only to deliver their contracted function. Paddle may act as merchant of record for international purchases; Razorpay may process Indian purchases.'],
      ['Retention and deletion', 'We retain information for the account lifetime, the selected evidence or organization retention period, and any additional period required for security, billing, disputes, or law. Request account export or deletion through the support channel shown in your account.'],
      ['Security and choices', 'We use access controls, signed webhooks, server-side entitlements, rate limits, audit logs, and encrypted transport. No system is perfectly secure. You can avoid AI features, delete eligible content, cancel paid service, and request applicable privacy rights.'],
    ],
  },
  refunds: {
    title: 'Cancellation & Refund Policy',
    icon: RotateCcw,
    intro: 'We want billing to be understandable before you pay and reversible without contacting a salesperson.',
    sections: [
      ['Cancellation', 'You can request cancellation from Plan & Usage. Unless immediate cancellation is explicitly selected and confirmed, access continues through the paid period and renewal stops at its end. Provider webhook confirmation determines final subscription state.'],
      ['Refund requests', 'If you were charged incorrectly, experienced duplicate billing, or could not access a paid service because of a verified platform failure, submit a request with the account email, date, provider, and transaction reference. Requests are reviewed under applicable consumer law and provider rules.'],
      ['Usage and change of mind', 'Consumed AI allowances and completed billing periods are generally not refundable merely because they were not fully used or because you changed your mind, except where law or the payment provider requires otherwise. This does not limit mandatory consumer rights.'],
      ['Provider process', 'International refunds may be issued through Paddle; Indian refunds may be issued through Razorpay. Processing and bank posting times are controlled by the provider and payment method. Never send card, UPI PIN, OTP, or full bank credentials to support.'],
      ['Disputes', 'Contact support first so billing mistakes can be investigated quickly. Fraudulent disputes or chargeback abuse may lead to account restriction, while good-faith disputes do not remove any legal rights.'],
    ],
  },
};

export default function LegalPage({ type }) {
  const params = useParams();
  const policy = policies[type || params.type] || policies.terms;
  const Icon = policy.icon;
  return <main className="min-h-[calc(100vh-64px)] bg-slate-950 px-4 py-10 text-slate-100 sm:px-6"><article className="mx-auto max-w-4xl"><Link to="/pricing" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-cyan-300"><ArrowLeft className="h-4 w-4" /> Back to pricing</Link><header className="mt-7 rounded-3xl border border-slate-800 bg-slate-900/70 p-7"><Icon className="h-10 w-10 text-cyan-400" /><h1 className="mt-5 text-4xl font-black">{policy.title}</h1><p className="mt-3 max-w-3xl leading-7 text-slate-400">{policy.intro}</p><p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-600">Draft effective date: August 18, 2026 · Review before commercial activation</p></header><div className="mt-6 space-y-4">{policy.sections.map(([title, body]) => <section key={title} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6"><h2 className="text-xl font-black">{title}</h2><p className="mt-3 leading-7 text-slate-400">{body}</p></section>)}</div><p className="mt-8 text-sm leading-6 text-amber-300/80">These documents are implementation-ready product drafts, not a substitute for review by qualified counsel in the jurisdictions where the commercial service will operate.</p></article></main>;
}
