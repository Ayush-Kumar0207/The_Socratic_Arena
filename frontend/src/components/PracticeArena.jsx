import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Bot, BrainCircuit, CheckCircle2, Clock3, Loader2,
  RotateCcw, Send, Share2, ShieldCheck, Sparkles, Target, Trophy,
} from 'lucide-react';
import api from '../services/api';
import { usePollySpeech } from '../hooks/usePollySpeech';
import PollyListenButton from './PollyListenButton';

const labels = {
  logic: 'Logic', evidence: 'Evidence', rebuttal: 'Rebuttal', clarity: 'Clarity',
  conciseness: 'Conciseness', persuasion: 'Persuasion', listening: 'Listening',
  calibration: 'Calibration', humility: 'Epistemic humility', sourceReliability: 'Source reliability',
  emotionalControl: 'Emotional control',
};

const PracticeArena = () => {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const mode = search.get('mode') || 'sparring';
  const scenario = search.get('scenario');
  const topic = search.get('topic') || 'Should AI systems be granted legal personhood?';
  const stance = search.get('stance') || 'for';
  const opening = search.get('opening') || `Take the ${stance === 'against' ? 'opposition' : 'proposition'} case on “${topic}.” State your strongest claim, evidence, and warrant.`;
  const [transcript, setTranscript] = useState([{ role: 'opponent', text: opening, round: 0 }]);
  const [message, setMessage] = useState('');
  const [round, setRound] = useState(1);
  const [busy, setBusy] = useState(false);
  const [coachCue, setCoachCue] = useState('Directly answer the prompt before introducing your own frame.');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(Date.now());
  const bottomRef = useRef(null);
  const speech = usePollySpeech();

  useEffect(() => {
    if (result) return undefined;
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [result]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [transcript, busy]);

  const userTurns = useMemo(() => transcript.filter(turn => turn.role === 'user').length, [transcript]);
  const canFinish = userTurns >= 3 && !busy;

  const sendTurn = async (event) => {
    event?.preventDefault();
    const text = message.trim();
    if (!text || busy || result) return;
    const nextHistory = [...transcript, { role: 'user', text, round }];
    setTranscript(nextHistory); setMessage(''); setBusy(true); setError('');
    try {
      const response = await api.post('/product/practice/respond', { topic, stance, message: text, history: nextHistory, scenario_key: scenario, round });
      setTranscript(current => [...current, { role: 'opponent', text: response.data.response, round }]);
      setCoachCue(response.data.coachCue);
      setRound(current => current + 1);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'The sparring partner is unavailable. Try again.');
    } finally { setBusy(false); }
  };

  const complete = async () => {
    if (!canFinish) return;
    setBusy(true); setError('');
    try {
      const response = await api.post('/product/practice/complete', { topic, transcript, scenario_key: scenario, duration_seconds: elapsed });
      setResult(response.data.result);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Scoring could not be completed.');
    } finally { setBusy(false); }
  };

  const restart = () => {
    speech.stop();
    setTranscript([{ role: 'opponent', text: opening, round: 0 }]); setMessage(''); setRound(1); setResult(null); setError(''); setElapsed(0); startedAt.current = Date.now();
  };

  const share = async () => {
    const text = `I scored ${result.overall}/100 in ${topic} on Socratic Arena. Train your thinking. Prove your reasoning.`;
    try {
      if (navigator.share) await navigator.share({ title: 'Socratic Arena practice result', text, url: window.location.origin });
      else await navigator.clipboard.writeText(`${text} ${window.location.origin}`);
    } catch { /* User cancelled share. */ }
  };

  return (
    <main className="min-h-[calc(100vh-64px)] bg-[#070b13] text-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col px-4 py-5 sm:px-6 lg:h-[calc(100vh-64px)] lg:flex-row lg:gap-5 lg:overflow-hidden lg:px-8">
        <aside className="mb-5 w-full shrink-0 space-y-4 lg:mb-0 lg:w-80 lg:overflow-y-auto">
          <button onClick={() => navigate('/arena-os')} className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-white"><ArrowLeft className="h-4 w-4" /> Arena OS</button>
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex items-center justify-between"><span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-violet-300">{mode === 'simulation' ? 'Simulation' : 'AI sparring'}</span><Bot className="h-5 w-5 text-cyan-400" /></div>
            <h1 className="mt-4 text-xl font-black leading-tight text-white">{topic}</h1>
            <p className="mt-3 text-xs leading-5 text-slate-500">Private, unranked practice. Coaching progress is recorded; competitive Elo is not affected.</p>
          </section>
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-cyan-400"><Target className="h-4 w-4" /> Live coach</div>
            <p className="mt-3 text-sm leading-6 text-slate-300">{coachCue}</p>
          </section>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-center"><div className="text-xl font-black text-white">{Math.min(userTurns, 3)}/3</div><div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Rounds</div></div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-center"><div className="flex items-center justify-center gap-1 text-xl font-black text-white"><Clock3 className="h-4 w-4 text-slate-500" />{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</div><div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Elapsed</div></div>
          </div>
          <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs leading-5 text-emerald-200/80"><ShieldCheck className="mr-2 inline h-4 w-4" />Scoring rewards direct reasoning, evidence, calibration, and listening—not aggression or vocabulary.</section>
        </aside>

        <section className="flex min-h-[650px] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 lg:min-h-0">
          {!result ? <>
            <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4"><div><h2 className="font-black text-white">Reasoning room</h2><p className="text-xs text-slate-500">Round {Math.min(round, 4)} · you argue {stance}</p></div><div className="text-right"><div className="flex items-center justify-end gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /><span className="text-xs font-bold text-emerald-400">Coach online</span></div>{speech.capabilities?.enabled && <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">Voice output · Amazon Polly</p>}</div></header>
            <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
              {transcript.map((turn, index) => <div key={`${turn.role}-${index}`} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[88%] rounded-2xl border p-4 sm:max-w-[72%] ${turn.role === 'user' ? 'border-cyan-500/30 bg-cyan-500/10' : 'border-slate-700 bg-slate-800/80'}`}><div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">{turn.role === 'user' ? <BrainCircuit className="h-3 w-3 text-cyan-400" /> : <Bot className="h-3 w-3 text-violet-400" />}{turn.role === 'user' ? 'You' : mode === 'simulation' ? 'Counterpart' : 'Socratic opponent'}{turn.round > 0 && <span>· Round {turn.round}</span>}</div><p className="whitespace-pre-wrap text-sm leading-7 text-slate-200">{turn.text}</p>{turn.role === 'opponent' && <PollyListenButton speech={speech} text={turn.text} speechId={`practice-${index}`} className="mt-3" />}</div></div>)}
              {busy && <div className="flex justify-start"><div className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin text-violet-400" /> Constructing the strongest counterargument…</div></div>}
              <div ref={bottomRef} />
            </div>
            {(error || speech.error) && <div className="mx-4 mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error || speech.error}</div>}
            <div className="border-t border-slate-800 p-4">
              {canFinish && <button onClick={complete} className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-black text-slate-950"><Sparkles className="h-4 w-4" /> Finish and score this session</button>}
              <form onSubmit={sendTurn} className="flex gap-3"><textarea value={message} onChange={event => setMessage(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendTurn(); } }} disabled={busy} rows="3" placeholder={userTurns >= 3 ? 'Add another round, or finish for your score…' : 'Answer the exact objection. Use evidence and state your confidence…'} className="min-h-[84px] flex-1 resize-none rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm leading-6 text-slate-100 outline-none focus:border-cyan-500 disabled:opacity-50" /><button disabled={!message.trim() || busy} className="flex w-14 items-center justify-center rounded-xl bg-cyan-500 text-slate-950 disabled:opacity-40"><Send className="h-5 w-5" /></button></form>
            </div>
          </> : <Result result={result} topic={topic} persisted={Boolean(result)} onRestart={restart} onShare={share} onDone={() => navigate('/arena-os')} />}
        </section>
      </div>
    </main>
  );
};

const Result = ({ result, topic, onRestart, onShare, onDone }) => {
  const sorted = Object.entries(result.metrics || {}).sort((a, b) => b[1] - a[1]);
  return <div className="flex-1 overflow-y-auto p-5 sm:p-8"><div className="mx-auto max-w-4xl"><div className="rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 via-slate-900 to-violet-500/10 p-6 text-center sm:p-10"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-500 text-slate-950"><Trophy className="h-8 w-8" /></div><p className="mt-5 text-xs font-black uppercase tracking-[0.25em] text-cyan-400">Practice complete</p><div className="mt-3 text-6xl font-black text-white">{result.overall}<span className="text-2xl text-slate-500">/100</span></div><h2 className="mt-3 text-xl font-black text-white">{topic}</h2><p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-400">{result.feedback}</p></div><div className="mt-5 grid gap-5 lg:grid-cols-3"><section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 lg:col-span-2"><h3 className="font-black text-white">Reasoning profile update</h3><div className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">{sorted.map(([metric, score]) => <div key={metric}><div className="mb-2 flex items-center justify-between text-xs"><span className="font-semibold text-slate-400">{labels[metric] || metric}</span><span className="font-black text-white">{score}</span></div><div className="h-2 rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400" style={{ width: `${score}%` }} /></div></div>)}</div></section><section className="space-y-5"><div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5"><div className="flex items-center gap-2 font-black text-emerald-300"><CheckCircle2 className="h-5 w-5" /> Strengths</div><ul className="mt-4 space-y-2 text-sm text-slate-300">{(result.strengths || sorted.slice(0, 2).map(([key]) => labels[key])).map(item => <li key={item}>• {labels[item] || item}</li>)}</ul></div><div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5"><div className="flex items-center gap-2 font-black text-violet-300"><Target className="h-5 w-5" /> Next drill</div><h4 className="mt-4 font-bold text-white">{result.recommended_drill?.title || 'Direct rebuttal sprint'}</h4><p className="mt-2 text-xs leading-5 text-slate-400">{result.recommended_drill?.description}</p></div></section></div><div className="mt-5 flex flex-col gap-3 sm:flex-row"><button onClick={onDone} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white py-3.5 text-sm font-black text-slate-950">View Arena OS <ArrowRight className="h-4 w-4" /></button><button onClick={onRestart} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 py-3.5 text-sm font-bold text-slate-200"><RotateCcw className="h-4 w-4" /> Practice again</button><button onClick={onShare} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 py-3.5 text-sm font-bold text-cyan-300"><Share2 className="h-4 w-4" /> Share result</button></div></div></div>;
};

export default PracticeArena;
