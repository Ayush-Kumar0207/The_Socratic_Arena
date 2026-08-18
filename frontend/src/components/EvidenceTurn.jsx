import { useState } from 'react';
import { Bot, ChevronDown, FileSearch, ShieldCheck } from 'lucide-react';
import PollyListenButton from './PollyListenButton';

const EvidenceText = ({ text, validIds, invalidIds }) => {
  const valid = new Set(validIds || []);
  const invalid = new Set(invalidIds || []);
  return `${text || ''}`.split(/(\[E\d+\])/g).map((part, index) => {
    const id = part.startsWith('[E') ? part.slice(1, -1) : '';
    if (valid.has(id)) return <mark key={`${part}-${index}`} className="rounded bg-cyan-500/15 px-1 text-cyan-200">{part}</mark>;
    if (invalid.has(id)) return <mark key={`${part}-${index}`} title="Citation was not retrieved for this turn" className="rounded bg-rose-500/20 px-1 text-rose-300 line-through">{part}</mark>;
    return part;
  });
};

const EvidenceTurn = ({ turn, index, speech }) => {
  const [expanded, setExpanded] = useState(false);
  const critic = turn.speaker === 'Critic';
  const evidence = turn.evidence || [];
  return (
    <article className={`rounded-2xl border p-5 ${critic ? 'border-rose-500/20 bg-rose-500/[0.04]' : 'border-cyan-500/20 bg-cyan-500/[0.04]'}`}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${critic ? 'bg-rose-500/15 text-rose-300' : 'bg-cyan-500/15 text-cyan-300'}`}>
            {critic ? <Bot className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
          </span>
          <div><h3 className="font-black text-white">{turn.speaker}</h3><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Round {turn.round || 1}</p></div>
        </div>
        <PollyListenButton speech={speech} text={turn.text} speechId={`evidence-${index}`} />
      </header>
      <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-200">
        <EvidenceText text={turn.text} validIds={turn.citedEvidenceIds} invalidIds={turn.invalidCitationIds} />
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {(turn.citedEvidenceIds || []).map((id) => <span key={id} className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-black text-cyan-300">{id}</span>)}
        {(turn.invalidCitationIds || []).map((id) => <span key={id} title="Invalid citation" className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[10px] font-black text-rose-300">{id} invalid</span>)}
      </div>
      <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white">
        <FileSearch className="h-4 w-4" /> {expanded ? 'Hide evidence' : `View evidence (${evidence.length})`}
        <ChevronDown className={`h-4 w-4 transition ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && <div className="mt-3 grid gap-3 sm:grid-cols-2">{evidence.map((item) => <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><div className="flex items-center justify-between"><span className="text-xs font-black text-cyan-300">{item.id}</span>{Number.isFinite(item.similarity) && <span className="text-[10px] text-slate-600">{Math.round(item.similarity * 100)}% match</span>}</div><p className="mt-2 text-xs leading-5 text-slate-400">{item.excerpt}</p></div>)}</div>}
    </article>
  );
};

export default EvidenceTurn;
