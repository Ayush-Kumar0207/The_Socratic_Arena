import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Globe2, GraduationCap, Loader2, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import api from '../services/api';
import { beginCheckout, currencyLabel, detectBillingCountry } from '../lib/commercial';

const planAccent = {
  starter: 'border-slate-800',
  plus: 'border-cyan-500/40 shadow-cyan-500/10',
  premium: 'border-violet-500/50 shadow-violet-500/10',
  business: 'border-amber-500/30',
};

export default function Pricing({ user }) {
  const navigate = useNavigate();
  const [country, setCountry] = useState(detectBillingCountry);
  const [interval, setInterval] = useState('annual');
  const [catalog, setCatalog] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    localStorage.setItem('socratic-billing-country', country);
    api.get(`/commercial/catalog?country=${country}`).then(({ data }) => setCatalog(data)).catch(() => setMessage('Pricing is temporarily unavailable.'));
  }, [country]);

  const choosePlan = async plan => {
    if (plan.code === 'starter') return navigate(user ? '/dashboard' : '/');
    if (plan.code === 'business') return navigate(user ? '/billing?contact=business' : '/');
    if (!user) return navigate('/');
    setLoadingPlan(plan.code);
    setMessage('');
    try {
      await beginCheckout({
        planCode: plan.code,
        interval,
        countryCode: country,
        onSuccess: () => {
          setMessage('Payment received. We are securely confirming your subscription.');
          setTimeout(() => navigate('/billing'), 1200);
        },
      });
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Checkout could not start.');
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <main className="min-h-[calc(100vh-64px)] bg-slate-950 px-4 py-12 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-bold text-cyan-300">
            <ShieldCheck className="h-4 w-4" /> Human debate stays free
          </div>
          <h1 className="text-4xl font-black tracking-tight sm:text-6xl">Practice reasoning, not just answers.</h1>
          <p className="mt-5 text-lg leading-8 text-slate-400">Start with the full human Arena. Upgrade only when you want deeper AI coaching, persistent evidence, and professional simulations.</p>
        </div>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <label className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-300">
            <Globe2 className="h-4 w-4 text-cyan-400" /> Billing region
            <select value={country} onChange={event => setCountry(event.target.value)} className="bg-transparent text-slate-100 outline-none">
              <option value="IN" className="bg-slate-900">India · INR</option>
              <option value="US" className="bg-slate-900">International · USD</option>
            </select>
          </label>
          <div className="flex rounded-xl border border-slate-800 bg-slate-900 p-1">
            {['monthly', 'annual'].map(value => (
              <button key={value} onClick={() => setInterval(value)} className={`rounded-lg px-4 py-2 text-sm font-bold capitalize transition ${interval === value ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}>
                {value} {value === 'annual' && <span className="ml-1 text-xs">save 20%</span>}
              </button>
            ))}
          </div>
        </div>

        {message && <div role="status" className="mx-auto mt-6 max-w-2xl rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-center text-sm text-cyan-200">{message}</div>}

        <div className="mt-10 grid gap-5 lg:grid-cols-4">
          {(catalog?.plans || []).map(plan => (
            <article key={plan.code} className={`relative flex flex-col rounded-3xl border bg-slate-900/70 p-6 shadow-2xl ${planAccent[plan.code]}`}>
              {plan.code === 'plus' && <span className="absolute -top-3 left-6 rounded-full bg-cyan-400 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950">Best start</span>}
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800 text-cyan-300">
                {plan.code === 'premium' ? <Sparkles className="h-5 w-5" /> : plan.code === 'business' ? <GraduationCap className="h-5 w-5" /> : <Zap className="h-5 w-5" />}
              </div>
              <h2 className="mt-5 text-2xl font-black">{plan.name}</h2>
              <p className="mt-2 min-h-12 text-sm leading-6 text-slate-400">{plan.tagline}</p>
              <div className="mt-6">
                <span className="text-3xl font-black">{currencyLabel(plan.prices?.[interval], plan.currency)}</span>
                {plan.prices?.[interval] > 0 && <span className="ml-1 text-sm text-slate-500">/{interval === 'annual' ? 'year' : 'month'}</span>}
              </div>
              <ul className="mt-7 flex-1 space-y-3">
                {plan.features.map(feature => <li key={feature} className="flex gap-2 text-sm leading-5 text-slate-300"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> {feature}</li>)}
              </ul>
              <button onClick={() => choosePlan(plan)} disabled={loadingPlan === plan.code} className={`mt-8 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition disabled:opacity-60 ${plan.code === 'premium' ? 'bg-violet-500 text-white hover:bg-violet-400' : plan.code === 'plus' ? 'bg-cyan-400 text-slate-950 hover:bg-cyan-300' : 'border border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-600'}`}>
                {loadingPlan === plan.code ? <Loader2 className="h-4 w-4 animate-spin" /> : plan.code === 'business' ? 'Contact sales' : plan.code === 'starter' ? 'Start free' : `Choose ${plan.name}`}
                {!loadingPlan && <ArrowRight className="h-4 w-4" />}
              </button>
            </article>
          ))}
        </div>

        <div className="mt-12 grid gap-5 rounded-3xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-400 md:grid-cols-3">
          <div><strong className="block text-slate-100">No “unlimited AI” trap</strong><span>Every plan shows durable monthly allowances and a daily safety ceiling.</span></div>
          <div><strong className="block text-slate-100">Regional checkout</strong><span>Razorpay serves India in INR; Paddle serves international customers.</span></div>
          <div><strong className="block text-slate-100">Cancel transparently</strong><span>Manage renewal and usage from Billing. Provider confirmation is always authoritative.</span></div>
        </div>
        <div className="mt-8 text-center text-xs text-slate-600">
          <Link to="/legal/terms" className="hover:text-slate-300">Terms</Link> · <Link to="/legal/privacy" className="hover:text-slate-300">Privacy</Link> · <Link to="/legal/refunds" className="hover:text-slate-300">Refund policy</Link>
        </div>
      </div>
    </main>
  );
}
