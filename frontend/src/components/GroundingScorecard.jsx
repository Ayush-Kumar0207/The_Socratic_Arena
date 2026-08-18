import { AlertTriangle, CheckCircle2, Gauge, Sparkles } from 'lucide-react';

const metrics = [
  ['groundedness', 'Groundedness'],
  ['evidenceUsage', 'Evidence usage'],
  ['citationFidelity', 'Citation fidelity'],
  ['argumentQuality', 'Argument quality'],
  ['unsupportedClaimRisk', 'Unsupported-claim risk'],
];

const GroundingScorecard = ({ evaluation }) => (
  <section className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.08] to-cyan-500/[0.04] p-5 sm:p-6">
    <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">Grounding evaluation</p><h2 className="mt-2 text-xl font-black text-white">Evidence integrity scorecard</h2><p className="mt-2 text-sm leading-6 text-slate-400">{evaluation.summary}</p></div><Gauge className="h-6 w-6 shrink-0 text-cyan-400" /></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{metrics.map(([key, label]) => <div key={key} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><div className="text-2xl font-black text-white">{evaluation[key] ?? 0}<span className="text-xs text-slate-600">/100</span></div><div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div></div>)}</div>
    <div className="mt-5 grid gap-3 md:grid-cols-2"><div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4"><div className="flex items-center gap-2 text-xs font-black text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Strongest grounded point</div><p className="mt-2 text-sm leading-6 text-slate-300">{evaluation.strongestGroundedPoint}</p></div><div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4"><div className="flex items-center gap-2 text-xs font-black text-amber-300"><AlertTriangle className="h-4 w-4" /> Weakest support</div><p className="mt-2 text-sm leading-6 text-slate-300">{evaluation.weakestSupportedPoint}</p></div></div>
    <p className="mt-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-600"><Sparkles className="h-3.5 w-3.5" /> {evaluation.evaluationMode === 'deterministic-and-semantic' ? 'Deterministic citation checks + one semantic evaluator call' : 'Deterministic fallback evaluation'}</p>
  </section>
);

export default GroundingScorecard;
