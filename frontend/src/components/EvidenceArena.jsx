import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BookOpenCheck, Database, FileSearch, Loader2, RotateCcw,
  ShieldCheck, Square, Trash2, WifiOff,
} from 'lucide-react';
import api from '../services/api';
import { COMMERCIAL_UI_ENABLED } from '../lib/commercial';
import { usePollySpeech } from '../hooks/usePollySpeech';
import FileUploader from './FileUploader';
import EvidenceTurn from './EvidenceTurn';
import GroundingScorecard from './GroundingScorecard';

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const ACTIVE_STATES = new Set(['uploading', 'parsing', 'indexing', 'retrieving', 'debating', 'evaluating', 'cancelling']);
const statusCopy = {
  idle: 'Ready for a source',
  uploading: 'Uploading securely',
  parsing: 'Extracting PDF text',
  indexing: 'Chunking and embedding source',
  retrieving: 'Retrieving relevant evidence',
  debating: 'Cross-examination in progress',
  evaluating: 'Evaluating grounding',
  cancelling: 'Stopping before the next model call',
  completed: 'Cross-examination complete',
  cancelled: 'Session stopped',
  failed: 'Session failed',
};

const EvidenceArena = ({ socket }) => {
  const navigate = useNavigate();
  const speech = usePollySpeech();
  const [file, setFile] = useState(null);
  const [topic, setTopic] = useState('');
  const [rounds, setRounds] = useState(2);
  const [status, setStatus] = useState('idle');
  const [turns, setTurns] = useState([]);
  const [evaluation, setEvaluation] = useState(null);
  const [error, setError] = useState('');
  const [documentId, setDocumentId] = useState(null);
  const [vaults, setVaults] = useState([]);
  const [vaultCollectionId, setVaultCollectionId] = useState('');
  const [vectorBackend, setVectorBackend] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const sessionIdRef = useRef(null);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!COMMERCIAL_UI_ENABLED) return;
    api.get('/commercial/studio')
      .then(({ data }) => setVaults(data.data?.vaults || []))
      .catch(() => setVaults([]));
  }, []);

  useEffect(() => {
    const belongsToCurrentSession = (payload) => payload?.sessionId === sessionIdRef.current;
    const onStatus = (payload) => {
      if (!belongsToCurrentSession(payload)) return;
      setStatus(payload.status);
      if (payload.vectorBackend) setVectorBackend(payload.vectorBackend);
      if (payload.documentId) setDocumentId(payload.documentId);
    };
    const onTurn = (payload) => {
      if (!belongsToCurrentSession(payload)) return;
      setTurns((current) => [...current, payload]);
    };
    const onComplete = (payload) => {
      if (!belongsToCurrentSession(payload)) return;
      runningRef.current = false;
      setStatus(payload.cancelled ? 'cancelled' : 'completed');
      setEvaluation(payload.evaluation || null);
      setDocumentId(payload.documentId || null);
      setVectorBackend(payload.vectorBackend || null);
    };
    const onError = (payload) => {
      if (!belongsToCurrentSession(payload)) return;
      runningRef.current = false;
      setStatus('failed');
      setDocumentId(null);
      setError(payload.message || 'Evidence Arena could not complete this session.');
    };
    socket.on('debate_status', onStatus);
    socket.on('debate_turn', onTurn);
    socket.on('debate_complete', onComplete);
    socket.on('debate_error', onError);
    return () => {
      socket.off('debate_status', onStatus);
      socket.off('debate_turn', onTurn);
      socket.off('debate_complete', onComplete);
      socket.off('debate_error', onError);
      if (runningRef.current && sessionIdRef.current && socket.id) {
        api.post('/debate/cancel', { sessionId: sessionIdRef.current, socketId: socket.id }).catch(() => {});
      }
    };
  }, [socket]);

  const active = ACTIVE_STATES.has(status);

  const selectFile = (selected) => {
    setError('');
    if (!selected) return setFile(null);
    if (selected.type !== 'application/pdf' || !/\.pdf$/i.test(selected.name)) {
      setFile(null);
      return setError('Choose a PDF file.');
    }
    if (selected.size > MAX_PDF_BYTES) {
      setFile(null);
      return setError('The PDF must be 10 MB or smaller.');
    }
    return setFile(selected);
  };

  const start = async () => {
    setError('');
    if (!file) return setError('Choose a PDF before starting.');
    if (!topic.trim()) return setError('Enter a proposition or question.');
    if (!socket.connected || !socket.id) return setError('The realtime connection is offline. Reconnect before starting.');

    const sessionId = crypto.randomUUID();
    sessionIdRef.current = sessionId;
    runningRef.current = true;
    setTurns([]);
    setEvaluation(null);
    setDocumentId(null);
    setVectorBackend(null);
    setStatus('uploading');
    const form = new FormData();
    form.append('document', file);
    form.append('topic', topic.trim());
    form.append('totalRounds', String(rounds));
    form.append('socketId', socket.id);
    form.append('sessionId', sessionId);
    if (vaultCollectionId) form.append('vaultCollectionId', vaultCollectionId);
    try {
      await api.post('/debate', form);
    } catch (requestError) {
      runningRef.current = false;
      sessionIdRef.current = null;
      setStatus('failed');
      setError(requestError.response?.data?.message || 'The cross-examination could not be started.');
    }
  };

  const stop = async () => {
    if (!runningRef.current || !sessionIdRef.current) return;
    setStatus('cancelling');
    try {
      await api.post('/debate/cancel', { sessionId: sessionIdRef.current, socketId: socket.id });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'The stop request could not be confirmed.');
    }
  };

  const reset = () => {
    speech.stop();
    sessionIdRef.current = null;
    runningRef.current = false;
    setStatus('idle');
    setTurns([]);
    setEvaluation(null);
    setError('');
    setDocumentId(null);
    setVectorBackend(null);
  };

  const deleteEvidence = async () => {
    if (!documentId) return;
    setDeleting(true);
    setError('');
    try {
      await api.delete(`/evidence/documents/${documentId}`);
      setDocumentId(null);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Stored evidence could not be deleted.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-64px)] bg-[#070b13] text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <button onClick={() => navigate('/arena-os')} className="mb-5 flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-white"><ArrowLeft className="h-4 w-4" /> Arena OS</button>
        <header className="mb-5 overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/40 p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-400"><BookOpenCheck className="h-4 w-4" /> Evidence Arena</div><h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Source-grounded AI cross-examination</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Upload a paper, report, policy, or specification. Critic and Defender retrieve real source chunks, cite them, and receive a separate grounding evaluation. Competitive Elo is never affected.</p></div><div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider"><span className="rounded-full border border-slate-700 px-3 py-1.5 text-slate-400">Private PDF processing</span><span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-violet-300">Realtime RAG</span>{speech.capabilities?.enabled && <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-cyan-300">Voice output · Amazon Polly</span>}</div></div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[390px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <FileUploader selectedFile={file} topic={topic} onFileSelect={selectFile} onTopicChange={setTopic} onClear={() => setFile(null)} disabled={active} maxBytes={MAX_PDF_BYTES} />
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><label htmlFor="evidence-rounds" className="text-xs font-black uppercase tracking-wider text-slate-500">Cross-examination rounds</label><div id="evidence-rounds" className="mt-3 grid grid-cols-3 gap-2">{[1, 2, 3].map((value) => <button key={value} type="button" disabled={active} onClick={() => setRounds(value)} className={`rounded-xl border py-2.5 text-sm font-black ${rounds === value ? 'border-cyan-500 bg-cyan-500 text-slate-950' : 'border-slate-700 text-slate-400 hover:border-slate-500'} disabled:opacity-50`}>{value}</button>)}</div><p className="mt-3 text-xs leading-5 text-slate-500">Each round uses one Critic and one Defender call. Default: 2.</p></section>
            {vaults.length > 0 && <section className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5"><label htmlFor="evidence-vault" className="text-xs font-black uppercase tracking-wider text-violet-300">Evidence Vault retention</label><select id="evidence-vault" value={vaultCollectionId} onChange={event => setVaultCollectionId(event.target.value)} disabled={active} className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none"><option value="">Session only</option>{vaults.map(vault => <option key={vault.id} value={vault.id}>{vault.name} · {vault.retention_days} days</option>)}</select><p className="mt-2 text-xs leading-5 text-slate-500">Choosing a collection persists private extracted chunks; raw PDFs are not retained.</p></section>}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${socket.connected ? 'bg-emerald-400' : 'bg-rose-400'}`} /><span className="text-sm font-black text-white">{statusCopy[status]}</span></div><p className="mt-2 text-xs text-slate-500">{socket.connected ? 'Authenticated realtime stream connected.' : 'Realtime stream disconnected.'}</p>{active ? <button type="button" onClick={stop} disabled={status === 'cancelling'} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 py-3 text-sm font-black text-rose-300 disabled:opacity-50"><Square className="h-4 w-4 fill-current" /> Stop</button> : status === 'idle' ? <button type="button" onClick={start} disabled={!socket.connected} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 py-3 text-sm font-black text-slate-950 disabled:opacity-40"><FileSearch className="h-4 w-4" /> Start cross-examination</button> : <button type="button" onClick={reset} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 py-3 text-sm font-black text-slate-200"><RotateCcw className="h-4 w-4" /> Start another session</button>}</section>
            {documentId && !active && <button type="button" onClick={deleteEvidence} disabled={deleting} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-800 py-3 text-xs font-bold text-slate-500 hover:border-rose-500/30 hover:text-rose-300 disabled:opacity-50">{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete stored evidence</button>}
          </aside>

          <section className="min-h-[640px] rounded-2xl border border-slate-800 bg-slate-900/40 p-4 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black text-white">Live cross-examination</h2><p className="mt-1 text-xs text-slate-500">Evidence IDs map only to chunks retrieved for each turn.</p></div>{vectorBackend && <span className="flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400"><Database className="h-3.5 w-3.5" /> {vectorBackend === 'supabase' ? 'Supabase pgvector' : 'In-memory vectors'}</span>}</div>
            {(error || speech.error) && <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error || speech.error}</div>}
            {!turns.length && !evaluation && <div className="flex min-h-[500px] flex-col items-center justify-center text-center"><div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-800 bg-slate-950"><ShieldCheck className="h-7 w-7 text-slate-600" /></div><h3 className="mt-5 font-black text-slate-300">Your evidence-linked transcript will appear here</h3><p className="mt-2 max-w-md text-sm leading-6 text-slate-600">The source stays out of ordinary debates and is scoped to this authenticated Evidence Arena session.</p>{active && <div className="mt-5 flex items-center gap-2 text-xs font-bold text-cyan-400"><Loader2 className="h-4 w-4 animate-spin" /> {statusCopy[status]}</div>}{!socket.connected && <div className="mt-5 flex items-center gap-2 text-xs font-bold text-rose-300"><WifiOff className="h-4 w-4" /> Realtime connection required</div>}</div>}
            <div className="space-y-4">{turns.map((turn, index) => <EvidenceTurn key={`${turn.speaker}-${turn.round}-${index}`} turn={turn} index={index} speech={speech} />)}{active && turns.length > 0 && <div className="flex items-center justify-center gap-2 py-4 text-xs font-bold text-cyan-400"><Loader2 className="h-4 w-4 animate-spin" /> {statusCopy[status]}</div>}{evaluation && <GroundingScorecard evaluation={evaluation} />}</div>
          </section>
        </div>
      </div>
    </main>
  );
};

export default EvidenceArena;
