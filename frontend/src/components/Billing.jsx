import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowUpRight, Building2, CheckCircle2, CreditCard, Loader2, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import api from '../services/api';
import { beginCheckout, detectBillingCountry } from '../lib/commercial';

const featureLabel = value => value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

export default function Billing({ user }) {
  const [searchParams] = useSearchParams();
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [message, setMessage] = useState('');
  const [showSales, setShowSales] = useState(searchParams.get('contact') === 'business');
  const country = detectBillingCountry();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/commercial/me?country=${country}`);
      setSnapshot(data.data);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Billing details could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [country]);

  useEffect(() => { refresh(); }, [refresh]);

  const usageByFeature = useMemo(() => Object.fromEntries((snapshot?.usage || []).map(item => [item.feature_key, item])), [snapshot]);
  const limits = snapshot?.limits?.monthly || {};
  const subscriptionManageable = snapshot?.subscription && !['cancelled', 'expired'].includes(snapshot.subscription.status);

  const checkout = async planCode => {
    setWorking(planCode);
    setMessage('');
    try {
      await beginCheckout({ planCode, interval: 'annual', countryCode: country, onSuccess: () => { setMessage('Payment received. Confirming your subscription…'); setTimeout(refresh, 1800); } });
    } catch (error) {
      setMessage(error.response?.data?.message || error.message);
    } finally {
      setWorking('');
    }
  };

  const openPortal = async () => {
    setWorking('portal');
    try {
      const { data } = await api.post('/commercial/portal');
      if (data.portal?.url) window.location.assign(data.portal.url);
      else setMessage('Razorpay subscription changes are handled here. Use Cancel renewal below or contact support for payment changes.');
    } catch (error) {
      setMessage(error.response?.data?.message || 'The billing portal is unavailable.');
    } finally { setWorking(''); }
  };

  const cancel = async () => {
    if (!window.confirm('Stop renewal at the end of the current billing period? Your access remains active until then.')) return;
    setWorking('cancel');
    try {
      const { data } = await api.post('/commercial/cancel', { atPeriodEnd: true });
      setMessage(data.message);
      await refresh();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Cancellation could not be requested.');
    } finally { setWorking(''); }
  };

  if (loading) return <div className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-slate-950"><Loader2 className="h-8 w-8 animate-spin text-cyan-400" /></div>;

  return (
    <main className="min-h-[calc(100vh-64px)] bg-slate-950 px-4 py-10 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-cyan-400">Account</p>
            <h1 className="mt-2 text-4xl font-black">Plan & usage</h1>
            <p className="mt-2 text-slate-400">Your provider confirms payments; Socratic Arena enforces access and allowances server-side.</p>
          </div>
          <button onClick={refresh} className="flex items-center gap-2 self-start rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-bold text-slate-300"><RefreshCw className="h-4 w-4" /> Refresh</button>
        </div>

        {message && <div className="mt-6 flex items-start gap-3 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-cyan-100"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /> {message}</div>}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_1.9fr]">
          <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-300"><Sparkles className="h-6 w-6" /></div>
              <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${snapshot?.subscription ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>{snapshot?.subscription?.status || 'free'}</span>
            </div>
            <h2 className="mt-5 text-3xl font-black">{snapshot?.plan?.name || 'Starter'}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">{snapshot?.plan?.tagline}</p>
            {snapshot?.subscription && <div className="mt-5 space-y-2 rounded-2xl bg-slate-950/70 p-4 text-sm text-slate-400"><p>Provider <strong className="float-right capitalize text-slate-200">{snapshot.subscription.provider}</strong></p><p>Renewal <strong className="float-right text-slate-200">{snapshot.subscription.current_period_end ? new Date(snapshot.subscription.current_period_end).toLocaleDateString() : 'Pending'}</strong></p><p>Interval <strong className="float-right capitalize text-slate-200">{snapshot.subscription.billing_interval}</strong></p></div>}
            <div className="mt-6 space-y-3">
              {subscriptionManageable ? <>
                <button onClick={openPortal} disabled={working === 'portal'} className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 font-black text-slate-950 disabled:opacity-60">{working === 'portal' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} Manage payment</button>
                <button onClick={cancel} disabled={working === 'cancel' || snapshot.subscription.cancel_at_period_end} className="w-full rounded-xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-400 hover:text-white disabled:opacity-50">{snapshot.subscription.cancel_at_period_end ? 'Cancellation scheduled' : 'Cancel renewal'}</button>
              </> : <>
                <button onClick={() => checkout('plus')} disabled={Boolean(working)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 font-black text-slate-950">{working === 'plus' && <Loader2 className="h-4 w-4 animate-spin" />} Upgrade to Plus</button>
                <button onClick={() => checkout('premium')} disabled={Boolean(working)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 py-3 font-black text-white">{working === 'premium' && <Loader2 className="h-4 w-4 animate-spin" />} Choose Premium</button>
              </>}
              <Link to="/pricing" className="flex items-center justify-center gap-2 text-sm font-bold text-slate-400 hover:text-cyan-300">Compare every plan <ArrowUpRight className="h-4 w-4" /></Link>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-emerald-400" /><div><h2 className="text-xl font-black">Monthly AI allowance</h2><p className="text-sm text-slate-500">Reserved and settled atomically; failed requests are returned.</p></div></div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {Object.entries(limits).filter(([, limit]) => Number(limit) > 0).map(([feature, limit]) => {
                const used = Number(usageByFeature[feature]?.consumed_units || 0);
                const reserved = Number(usageByFeature[feature]?.reserved_units || 0);
                const percent = Math.min(100, Math.round(((used + reserved) / Number(limit)) * 100));
                return <div key={feature} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"><div className="flex justify-between gap-3 text-sm"><span className="font-bold text-slate-300">{featureLabel(feature)}</span><span className="text-slate-500">{used + reserved}/{Number(limit).toLocaleString()}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800"><div className={`h-full rounded-full ${percent >= 90 ? 'bg-rose-400' : percent >= 70 ? 'bg-amber-400' : 'bg-cyan-400'}`} style={{ width: `${percent}%` }} /></div></div>;
              })}
              {!Object.values(limits).some(limit => Number(limit) > 0) && <p className="text-sm text-slate-500">Usage will appear after commercial mode and your plan are active.</p>}
            </div>
            <p className="mt-5 text-xs leading-5 text-slate-600">Daily safety ceilings protect your account and the platform from automated abuse. They reset at 00:00 UTC and do not replace the monthly allowance.</p>
          </section>
        </div>

        <section className="mt-6 rounded-3xl border border-amber-500/20 bg-gradient-to-r from-amber-500/5 to-slate-900 p-6">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center"><div className="flex gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-300"><Building2 className="h-6 w-6" /></div><div><h2 className="text-xl font-black">Business & Education</h2><p className="mt-1 text-sm text-slate-400">Cohorts, pooled usage, custom rubrics, private vaults, audit logs, and reporting.</p></div></div><button onClick={() => setShowSales(!showSales)} className="rounded-xl border border-amber-500/30 px-5 py-3 text-sm font-black text-amber-200">{showSales ? 'Close form' : 'Contact sales'}</button></div>
          {showSales && <SalesForm user={user} country={country} onMessage={setMessage} />}
        </section>
      </div>
    </main>
  );
}

function SalesForm({ user, country, onMessage }) {
  const [form, setForm] = useState({ name: user?.user_metadata?.full_name || '', email: user?.email || '', organizationName: '', organizationSize: '11–50', useCase: '' });
  const [sending, setSending] = useState(false);
  const update = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  const submit = async event => {
    event.preventDefault(); setSending(true);
    try {
      const { data } = await api.post('/commercial/sales-leads', { ...form, countryCode: country });
      onMessage(data.message); setForm(current => ({ ...current, useCase: '' }));
    } catch (error) { onMessage(error.response?.data?.message || 'Your request could not be recorded.'); }
    finally { setSending(false); }
  };
  return <form onSubmit={submit} className="mt-6 grid gap-4 rounded-2xl border border-slate-800 bg-slate-950/50 p-5 md:grid-cols-2"><input name="name" value={form.name} onChange={update} required placeholder="Your name" className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 outline-none focus:border-cyan-500" /><input name="email" type="email" value={form.email} onChange={update} required placeholder="Work email" className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 outline-none focus:border-cyan-500" /><input name="organizationName" value={form.organizationName} onChange={update} placeholder="Organization" className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 outline-none focus:border-cyan-500" /><select name="organizationSize" value={form.organizationSize} onChange={update} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 outline-none"><option>1–10</option><option>11–50</option><option>51–250</option><option>251–1,000</option><option>1,000+</option></select><textarea name="useCase" value={form.useCase} onChange={update} placeholder="What are you trying to improve?" className="min-h-28 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 outline-none focus:border-cyan-500 md:col-span-2" /><button disabled={sending} className="flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3 font-black text-slate-950 md:col-span-2">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Send organization request</button></form>;
}
