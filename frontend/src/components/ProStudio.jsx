import { createElement, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Bot, BrainCircuit, BriefcaseBusiness, Building2, Clock3, Download, FileSearch, FolderLock, Loader2, Mic2, Plus, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react';
import api from '../services/api';

const tabs = [
  ['progress', 'Progress', BarChart3],
  ['mentor', 'Mentor', Bot],
  ['adversarial', 'Adversarial', ShieldAlert],
  ['review', 'Deep Review', FileSearch],
  ['replay', 'Replay Lab', RefreshCw],
  ['vault', 'Evidence Vault', FolderLock],
  ['voice', 'Voice Pro', Mic2],
  ['career', 'Career', BriefcaseBusiness],
  ['organization', 'Organization', Building2],
];

const pretty = value => JSON.stringify(value, null, 2);

export default function ProStudio() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('progress');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { const response = await api.get('/commercial/studio'); setData(response.data.data); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Pro Studio could not be loaded.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading) return <div className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-slate-950"><Loader2 className="h-8 w-8 animate-spin text-violet-400" /></div>;
  if (error) return <UpgradeState message={error} />;

  const Component = {
    progress: ProgressPanel,
    mentor: MentorPanel,
    adversarial: AdversarialPanel,
    review: DeepReviewPanel,
    replay: ReplayPanel,
    vault: VaultPanel,
    voice: VoicePanel,
    career: CareerPanel,
    organization: OrganizationPanel,
  }[tab];

  return (
    <main className="min-h-[calc(100vh-64px)] bg-slate-950 px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <header className="overflow-hidden rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 via-slate-900 to-cyan-500/5 p-7">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-violet-300"><Sparkles className="h-4 w-4" /> {data.planCode} workspace</div><h1 className="mt-3 text-4xl font-black">Pro Studio</h1><p className="mt-2 max-w-2xl text-slate-400">Private tools that learn from your history without altering competitive Elo or the official judge result.</p></div><Link to="/billing" className="self-start rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2 text-sm font-bold text-slate-300">Plan & usage</Link></div>
        </header>
        <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
          {tabs.map(([key, label, icon]) => <button key={key} onClick={() => setTab(key)} className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition ${tab === key ? 'bg-violet-500 text-white' : 'border border-slate-800 bg-slate-900 text-slate-400 hover:text-white'}`}>{createElement(icon, { className: 'h-4 w-4' })} {label}</button>)}
        </div>
        <section className="mt-4 rounded-3xl border border-slate-800 bg-slate-900/65 p-5 sm:p-7"><Component data={data} reload={load} /></section>
      </div>
    </main>
  );
}

function UpgradeState({ message }) {
  return <main className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-slate-950 px-4 text-center text-slate-100"><div className="max-w-lg rounded-3xl border border-violet-500/30 bg-slate-900 p-8"><BrainCircuit className="mx-auto h-12 w-12 text-violet-400" /><h1 className="mt-5 text-3xl font-black">Pro Studio is ready when you are</h1><p className="mt-3 text-slate-400">{message}</p><Link to="/pricing" className="mt-6 inline-flex rounded-xl bg-violet-500 px-5 py-3 font-black text-white">Compare plans</Link></div></main>;
}

function ProgressPanel({ data, reload }) {
  const points = [...(data.progress || [])].reverse();
  const max = Math.max(100, ...points.map(item => Number(item.overall || 0)));
  const capture = async () => { await api.post('/commercial/progress/capture'); await reload(); };
  const exportData = async () => { const response = await api.get('/commercial/export', { responseType: 'blob' }); const url = URL.createObjectURL(response.data); const link = document.createElement('a'); link.href = url; link.download = `socratic-arena-export-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url); };
  return <div><PanelTitle icon={BarChart3} title="Reasoning progression" description="Snapshots preserve trends across rubric changes instead of overwriting history." action={<div className="flex gap-2"><button onClick={exportData} className="flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-sm font-black text-slate-300"><Download className="h-4 w-4" /> Export</button><button onClick={capture} className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-black text-slate-950">Capture today</button></div>} />
    {points.length ? <><div className="mt-8 flex h-52 items-end gap-2 rounded-2xl border border-slate-800 bg-slate-950/60 p-5">{points.slice(-20).map(item => <div key={item.id} title={`${new Date(item.captured_at).toLocaleDateString()}: ${item.overall}`} className="min-w-2 flex-1 rounded-t bg-gradient-to-t from-cyan-600 to-violet-400" style={{ height: `${Math.max(5, Number(item.overall) / max * 100)}%` }} />)}</div><div className="mt-5 grid gap-3 sm:grid-cols-3"><Stat label="Latest overall" value={points.at(-1)?.overall} /><Stat label="Percentile" value={`${points.at(-1)?.percentile || 0}%`} /><Stat label="Confidence" value={`${points.at(-1)?.confidence || 0}%`} /></div></> : <Empty text="Complete judged matches, then capture your first progression point." />}
  </div>;
}

function MentorPanel({ data, reload }) {
  const [message, setMessage] = useState(''); const [response, setResponse] = useState(null); const [working, setWorking] = useState(false); const [error, setError] = useState('');
  const submit = async event => { event.preventDefault(); setWorking(true); setError(''); try { const { data: result } = await api.post('/commercial/mentor/respond', { message }, { headers: { 'Idempotency-Key': crypto.randomUUID() } }); setResponse(result.response); setMessage(''); await reload(); } catch (e) { setError(e.response?.data?.message || 'Mentor is unavailable.'); } finally { setWorking(false); } };
  return <div><PanelTitle icon={Bot} title="Socratic Mentor & reasoning twin" description="A private coach grounded in your measured patterns, goals, and completed matches." />
    {!data.entitlements?.mentor_twin ? <Locked feature="Socratic Mentor" plan="Premium" /> : <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]"><div><form onSubmit={submit}><textarea value={message} onChange={event => setMessage(event.target.value)} required placeholder="What pattern should I fix before my next debate?" className="min-h-36 w-full rounded-2xl border border-slate-700 bg-slate-950 p-4 outline-none focus:border-violet-500" /><button disabled={working} className="mt-3 flex items-center gap-2 rounded-xl bg-violet-500 px-5 py-3 font-black text-white">{working && <Loader2 className="h-4 w-4 animate-spin" />} Ask my mentor</button></form>{error && <ErrorText text={error} />}{response && <Result value={response} />}</div><div><h3 className="text-sm font-black uppercase tracking-wider text-slate-500">Active memories</h3><div className="mt-3 space-y-2">{(data.memories || []).slice(0, 8).map(memory => <div key={memory.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><span className="text-xs font-bold uppercase text-violet-400">{memory.memory_type}</span><p className="mt-1 text-sm text-slate-300">{memory.content}</p></div>)}{!data.memories?.length && <p className="text-sm text-slate-500">Your mentor will build memories only from useful durable patterns.</p>}</div></div></div>}
  </div>;
}

function AdversarialPanel({ data }) {
  const [topic, setTopic] = useState(''); const [argument, setArgument] = useState(''); const [difficulty, setDifficulty] = useState('hard'); const [response, setResponse] = useState(null); const [working, setWorking] = useState(false); const [error, setError] = useState('');
  const submit = async event => { event.preventDefault(); setWorking(true); setError(''); try { const result = await api.post('/commercial/adversarial/respond', { topic, argument, difficulty }, { headers: { 'Idempotency-Key': crypto.randomUUID() } }); setResponse(result.data.response); } catch (e) { setError(e.response?.data?.message || 'Adversarial trainer is unavailable.'); } finally { setWorking(false); } };
  return <div><PanelTitle icon={ShieldAlert} title="Adversarial training" description="A deliberately difficult steelman and cross-examination, calibrated to expose weak premises." />{!data.entitlements?.adversarial_training ? <Locked feature="Adversarial training" plan="Premium" /> : <form onSubmit={submit} className="mt-6 space-y-3"><input value={topic} onChange={e => setTopic(e.target.value)} required placeholder="Topic or motion" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" /><textarea value={argument} onChange={e => setArgument(e.target.value)} required placeholder="Your current argument…" className="min-h-36 w-full rounded-xl border border-slate-700 bg-slate-950 p-4" /><select value={difficulty} onChange={e => setDifficulty(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"><option value="hard">Hard</option><option value="extreme">Extreme</option></select><button disabled={working} className="ml-3 rounded-xl bg-rose-500 px-5 py-3 font-black">{working ? 'Pressure testing…' : 'Challenge me'}</button>{error && <ErrorText text={error} />}{response && <Result value={response} />}</form>}</div>;
}

function DeepReviewPanel({ data, reload }) {
  const [matchId, setMatchId] = useState(''); const [working, setWorking] = useState(false); const [result, setResult] = useState(null); const [error, setError] = useState('');
  const submit = async event => { event.preventDefault(); setWorking(true); setError(''); try { const response = await api.post('/commercial/deep-reviews', { matchId }, { headers: { 'Idempotency-Key': `deep-review:${matchId}` } }); setResult(response.data.review); await reload(); } catch (e) { setError(e.response?.data?.message || 'Review failed.'); } finally { setWorking(false); } };
  return <div><PanelTitle icon={FileSearch} title="Deep Review" description="Claim audit, rebuttal map, missed moves, and targeted drills. Official rankings remain untouched." /><ActionForm label="Completed match ID" value={matchId} setValue={setMatchId} button="Generate Deep Review" working={working} onSubmit={submit} />{error && <ErrorText text={error} />}{result && <Result value={result.review || result} />}<History items={data.reviews} render={item => item.review?.executive_summary || `Review for ${item.match_id}`} /></div>;
}

function ReplayPanel({ data, reload }) {
  const [matchId, setMatchId] = useState(''); const [alternate, setAlternate] = useState(''); const [result, setResult] = useState(null); const [working, setWorking] = useState(false); const [error, setError] = useState('');
  const submit = async event => { event.preventDefault(); setWorking(true); setError(''); try { const response = await api.post('/commercial/replays', { matchId, branchFromTurn: 0, alternateResponse: alternate }, { headers: { 'Idempotency-Key': crypto.randomUUID() } }); setResult(response.data.replay); setAlternate(''); await reload(); } catch (e) { setError(e.response?.data?.message || 'Replay failed.'); } finally { setWorking(false); } };
  return <div><PanelTitle icon={RefreshCw} title="Alternate-reality Replay Lab" description="Test a different response and study the likely counterfactual—never presented as certainty." /><form onSubmit={submit} className="mt-6 space-y-3"><input value={matchId} onChange={e => setMatchId(e.target.value)} required placeholder="Completed match ID" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-violet-500" /><textarea value={alternate} onChange={e => setAlternate(e.target.value)} required placeholder="The response you wish you had made…" className="min-h-32 w-full rounded-xl border border-slate-700 bg-slate-950 p-4 outline-none focus:border-violet-500" /><button disabled={working} className="rounded-xl bg-violet-500 px-5 py-3 font-black">{working ? 'Simulating…' : 'Create branch'}</button></form>{error && <ErrorText text={error} />}{result && <Result value={result.analysis || result} />}<History items={data.replays} render={item => item.analysis?.lesson || `Replay for ${item.match_id}`} /></div>;
}

function VaultPanel({ data, reload }) {
  const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [error, setError] = useState('');
  const submit = async event => { event.preventDefault(); try { await api.post('/commercial/vaults', { name, description, retentionDays: 365 }); setName(''); setDescription(''); await reload(); } catch (e) { setError(e.response?.data?.message || 'Vault could not be created.'); } };
  const remove = async id => { if (!window.confirm('Delete this collection? Retained evidence follows its existing deletion date unless deleted from Evidence Arena.')) return; await api.delete(`/commercial/vaults/${id}`); await reload(); };
  return <div><PanelTitle icon={FolderLock} title="Evidence Vault" description="Organize private evidence collections with explicit retention. Raw PDFs are not exposed to other users." />{!data.entitlements?.evidence_vault ? <Locked feature="Evidence Vault" plan="Plus" /> : <><form onSubmit={submit} className="mt-6 grid gap-3 md:grid-cols-[0.7fr_1.3fr_auto]"><input value={name} onChange={e => setName(e.target.value)} required placeholder="Collection name" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none" /><input value={description} onChange={e => setDescription(e.target.value)} placeholder="Purpose or topic" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none" /><button className="flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 font-black text-slate-950"><Plus className="h-4 w-4" /> Create</button></form>{error && <ErrorText text={error} />}<div className="mt-6 grid gap-3 md:grid-cols-2">{data.vaults?.map(vault => <div key={vault.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5"><div className="flex justify-between gap-3"><h3 className="font-black">{vault.name}</h3><div className="flex items-center gap-3"><span className="text-xs text-slate-500">{vault.retention_days} days</span><button onClick={() => remove(vault.id)} className="text-xs font-bold text-rose-400 hover:text-rose-300">Delete</button></div></div><p className="mt-2 text-sm text-slate-400">{vault.description || 'Private collection'}</p></div>)}</div></>}</div>;
}

function VoicePanel({ data, reload }) {
  const [transcript, setTranscript] = useState(''); const [seconds, setSeconds] = useState(60); const [result, setResult] = useState(null); const [working, setWorking] = useState(false); const [error, setError] = useState('');
  const submit = async event => { event.preventDefault(); setWorking(true); setError(''); try { const response = await api.post('/commercial/voice-analyses', { transcript, durationSeconds: seconds }, { headers: { 'Idempotency-Key': crypto.randomUUID() } }); setResult(response.data.analysis); await reload(); } catch (e) { setError(e.response?.data?.message || 'Analysis failed.'); } finally { setWorking(false); } };
  return <div><PanelTitle icon={Mic2} title="Voice Pro" description="Pacing and delivery coaching from transcript plus timing; acoustic traits are never invented." />{!data.entitlements?.voice_pro ? <Locked feature="Voice Pro" plan="Premium" /> : <form onSubmit={submit} className="mt-6 space-y-3"><textarea value={transcript} onChange={e => setTranscript(e.target.value)} required placeholder="Paste the speech transcript…" className="min-h-40 w-full rounded-xl border border-slate-700 bg-slate-950 p-4 outline-none" /><label className="flex items-center gap-3 text-sm text-slate-400"><Clock3 className="h-4 w-4" /> Duration in seconds <input type="number" min="1" max="3600" value={seconds} onChange={e => setSeconds(e.target.value)} className="w-28 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" /></label><button disabled={working} className="rounded-xl bg-violet-500 px-5 py-3 font-black">{working ? 'Analyzing…' : 'Analyze delivery'}</button>{error && <ErrorText text={error} />}{result && <Result value={result.analysis || result} />}</form>}</div>;
}

function CareerPanel({ data }) {
  const scenarios = [{ title: 'Executive stakeholder challenge', topic: 'Defend a high-risk recommendation to a skeptical executive committee.' }, { title: 'Salary negotiation', topic: 'Negotiate compensation using scope, evidence, and calibrated alternatives.' }, { title: 'Investor moat defense', topic: 'Defend a startup moat against fast-following competitors.' }, { title: 'Technical design review', topic: 'Defend an architecture against reliability, security, and cost objections.' }];
  return <div><PanelTitle icon={BriefcaseBusiness} title="Career Simulator" description="Private, unranked scenarios for high-stakes professional conversations." />{!data.entitlements?.career_simulator ? <Locked feature="Career Simulator" plan="Plus" /> : <div className="mt-6 grid gap-4 md:grid-cols-2">{scenarios.map(item => <Link key={item.title} to={`/practice?topic=${encodeURIComponent(item.topic)}&stance=for&mode=simulation`} className="group rounded-2xl border border-slate-800 bg-slate-950/60 p-5 transition hover:border-cyan-500/40"><h3 className="font-black group-hover:text-cyan-300">{item.title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{item.topic}</p><span className="mt-4 inline-block text-sm font-bold text-cyan-400">Start simulation →</span></Link>)}</div>}</div>;
}

function OrganizationPanel({ data, reload }) {
  const [name, setName] = useState(''); const [orgData, setOrgData] = useState(null); const [error, setError] = useState('');
  useEffect(() => { if (data.memberships?.[0]?.organization_id) api.get(`/commercial/organizations/${data.memberships[0].organization_id}`).then(response => setOrgData(response.data.data)).catch(() => {}); }, [data.memberships]);
  const submit = async event => { event.preventDefault(); try { await api.post('/commercial/organizations', { name }); setName(''); await reload(); } catch (e) { setError(e.response?.data?.message || 'Organization could not be created.'); } };
  return <div><PanelTitle icon={Building2} title="Organization workspace" description="Roles, pooled usage, custom policies, and immutable administrative audit events." />{!data.entitlements?.organization_admin ? <Locked feature="Organization administration" plan="Business & Education" /> : <>{!data.memberships?.length && <form onSubmit={submit} className="mt-6 flex gap-3"><input value={name} onChange={e => setName(e.target.value)} required placeholder="Organization name" className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" /><button className="rounded-xl bg-amber-400 px-5 py-3 font-black text-slate-950">Create workspace</button></form>}{error && <ErrorText text={error} />}{orgData && <div className="mt-6 grid gap-4 sm:grid-cols-3"><Stat label="Members" value={orgData.members?.length || 0} /><Stat label="Usage pools" value={orgData.usage?.length || 0} /><Stat label="Audit events" value={orgData.audit?.length || 0} /></div>}</>}</div>;
}

function PanelTitle({ icon, title, description, action }) { return <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="flex gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">{createElement(icon, { className: 'h-5 w-5' })}</div><div><h2 className="text-2xl font-black">{title}</h2><p className="mt-1 text-sm text-slate-400">{description}</p></div></div>{action}</div>; }
function Locked({ feature, plan }) { return <div className="mt-6 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-6 text-center"><Sparkles className="mx-auto h-8 w-8 text-violet-400" /><h3 className="mt-3 font-black">{feature} is in {plan}</h3><Link to="/pricing" className="mt-4 inline-block rounded-xl bg-violet-500 px-4 py-2 text-sm font-black">View plans</Link></div>; }
function Result({ value }) { return <pre className="mt-5 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 font-sans text-sm leading-6 text-slate-200">{pretty(value)}</pre>; }
function ErrorText({ text }) { return <p className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">{text}</p>; }
function Empty({ text }) { return <div className="mt-6 rounded-2xl border border-dashed border-slate-700 p-8 text-center text-slate-500">{text}</div>; }
function Stat({ label, value }) { return <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"><span className="text-xs font-black uppercase tracking-wider text-slate-500">{label}</span><strong className="mt-2 block text-2xl">{value ?? '—'}</strong></div>; }
function ActionForm({ label, value, setValue, button, working, onSubmit }) { return <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3 sm:flex-row"><input value={value} onChange={e => setValue(e.target.value)} required placeholder={label} className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-violet-500" /><button disabled={working} className="rounded-xl bg-violet-500 px-5 py-3 font-black">{working ? 'Working…' : button}</button></form>; }
function History({ items = [], render }) { return items.length ? <div className="mt-7"><h3 className="text-sm font-black uppercase tracking-wider text-slate-500">Recent work</h3><div className="mt-3 space-y-2">{items.slice(0, 6).map(item => <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">{render(item)}</div>)}</div></div> : null; }
