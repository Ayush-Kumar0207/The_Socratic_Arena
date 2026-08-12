import { useMemo, useState } from 'react';
import { BadgeCheck, Check, CircleAlert, FileSearch, Loader2, Scale, Share2, ShieldCheck, X } from 'lucide-react';
import api from '../services/api';

const dimensions = ['logic', 'evidence', 'rebuttal', 'clarity', 'persuasion', 'listening', 'calibration'];
const label = (value) => value.replace(/([A-Z])/g, ' $1').replace(/^./, char => char.toUpperCase());

const TrustResultPanel = ({ match, currentUser }) => {
  const [showAppeal, setShowAppeal] = useState(false);
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const metadata = match?.ai_scores?.result_metadata || {};
  const isParticipant = currentUser && [match?.critic_id, match?.defender_id].includes(currentUser.id);
  const flagged = metadata.flagged_claims || [];
  const uncertainty = Number(metadata.uncertainty ?? 0);
  const panelSize = Number(metadata.judge_count || 1);
  const isPanel = panelSize > 1;

  const winner = useMemo(() => {
    const average = side => dimensions.reduce((sum, metric) => sum + Number(match?.ai_scores?.[side]?.[metric] ?? (metric === 'evidence' ? match?.ai_scores?.[side]?.facts : metric === 'rebuttal' ? match?.ai_scores?.[side]?.relevance : 0)), 0) / dimensions.length;
    const critic = average('critic'); const defender = average('defender');
    return Math.abs(critic - defender) < 0.1 ? 'Tie' : critic > defender ? 'Critic' : 'Defender';
  }, [match]);

  const appeal = async (event) => {
    event.preventDefault(); setBusy(true); setStatus(null);
    try {
      await api.post('/product/appeals', { match_id: match.id, reason, disputed_dimensions: selected });
      setStatus({ type: 'success', text: 'Appeal queued. The original result remains visible during review.' });
      setReason(''); setSelected([]);
    } catch (error) {
      setStatus({ type: 'error', text: error.response?.data?.message || 'Appeal could not be filed.' });
    } finally { setBusy(false); }
  };

  const share = async () => {
    const text = `${winner} won my Socratic Arena debate. Judge agreement: ${metadata.agreement || 'legacy result'} · ${flagged.length} claims flagged for verification.`;
    try {
      if (navigator.share) await navigator.share({ title: 'Socratic Arena result', text, url: window.location.href });
      else { await navigator.clipboard.writeText(`${text} ${window.location.href}`); setStatus({ type: 'success', text: 'Share link copied.' }); }
    } catch { /* share cancelled */ }
  };

  return <section className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04]">
    <div className="flex flex-col justify-between gap-4 border-b border-slate-800 p-6 sm:flex-row sm:items-start">
      <div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-400"><ShieldCheck className="h-4 w-4" /> Judgment trust report</div><h3 className="mt-2 text-xl font-black text-white">{isPanel ? 'Blind independent panel' : 'Legacy single-judge result'}</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{isPanel ? 'Scores are median-aggregated across logic, evidence, and communication judges. Disagreement is shown as uncertainty instead of being hidden.' : 'This match predates calibrated panel judging. Its score remains available but carries lower evidential confidence.'}</p></div>
      <div className="flex gap-2"><button onClick={share} className="flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800"><Share2 className="h-4 w-4" /> Share</button>{isParticipant && metadata.appeals_enabled && <button onClick={() => setShowAppeal(true)} className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-300"><Scale className="h-4 w-4" /> Appeal</button>}</div>
    </div>
    <div className="grid gap-px bg-slate-800 sm:grid-cols-4">
      {[['Judge agreement', metadata.agreement || '1/1'], ['Confidence', `${metadata.confidence || (isPanel ? 70 : 40)}%`], ['Uncertainty', `± ${uncertainty.toFixed(1)}`], ['Claims to verify', flagged.length]].map(([name, value]) => <div key={name} className="bg-slate-950/80 p-4 text-center"><div className="text-xl font-black text-white">{value}</div><div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{name}</div></div>)}
    </div>
    <div className="flex flex-wrap items-center gap-2 p-5 text-xs text-slate-400"><BadgeCheck className="h-4 w-4 text-cyan-400" /><span>{metadata.rubric || 'Legacy reasoning rubric'}</span><span>·</span><span>{metadata.judge_version || 'legacy'}</span>{metadata.blind_scoring && <><span>·</span><span>Identities blinded</span></>}</div>
    {flagged.length > 0 && <div className="border-t border-slate-800 p-5"><div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-300"><FileSearch className="h-4 w-4" /> Factual claims requiring verification</div><div className="space-y-2">{flagged.slice(0, 4).map((item, index) => <div key={index} className="rounded-xl bg-slate-950/60 p-3 text-xs leading-5 text-slate-400"><span className="font-bold text-slate-200">{label(item.speaker || 'Claim')}:</span> {item.claim} {item.reason && <span className="text-slate-500">— {item.reason}</span>}</div>)}</div></div>}
    {status && <div className={`mx-5 mb-5 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${status.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}`}>{status.type === 'success' ? <Check className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}{status.text}</div>}

    {showAppeal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"><form onSubmit={appeal} className="w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h3 className="text-xl font-black text-white">Appeal this result</h3><p className="mt-1 text-sm text-slate-500">A new judge version reviews the disputed dimensions. The audit trail is preserved.</p></div><button type="button" onClick={() => setShowAppeal(false)} className="p-2 text-slate-500"><X className="h-5 w-5" /></button></div><div className="mt-5"><p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Disputed dimensions</p><div className="flex flex-wrap gap-2">{dimensions.map(dimension => <button type="button" key={dimension} onClick={() => setSelected(current => current.includes(dimension) ? current.filter(item => item !== dimension) : [...current, dimension])} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${selected.includes(dimension) ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' : 'border-slate-700 text-slate-400'}`}>{label(dimension)}</button>)}</div></div><label className="mt-5 block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Specific reason</span><textarea required minLength="20" value={reason} onChange={event => setReason(event.target.value)} rows="5" placeholder="Identify the argument, evidence, or rubric application you believe was assessed incorrectly…" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm leading-6 text-slate-100 outline-none focus:border-amber-500" /></label><button disabled={busy || reason.trim().length < 20} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 py-3 text-sm font-black text-slate-950 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />} Submit appeal</button></form></div>}
  </section>;
};

export default TrustResultPanel;
