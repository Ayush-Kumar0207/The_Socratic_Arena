import { createElement, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, ArrowRight, BadgeCheck, BarChart3, BookOpen, Bot, BrainCircuit,
  Building2, CalendarDays, Check, ChevronRight, CircleAlert, ClipboardCheck,
  Clock3, Crown, Flag, GraduationCap, LayoutGrid, Loader2, LockKeyhole,
  Medal, Plus, RefreshCw, Scale, ShieldCheck, Sparkles, Swords, Target,
  Trophy, Users, X, Zap,
} from 'lucide-react';
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from 'recharts';
import api from '../services/api';

const metricLabels = {
  logic: 'Logic', evidence: 'Evidence', rebuttal: 'Rebuttal', clarity: 'Clarity',
  conciseness: 'Conciseness', persuasion: 'Persuasion', listening: 'Listening',
  calibration: 'Calibration', humility: 'Epistemic humility', sourceReliability: 'Source reliability',
  emotionalControl: 'Emotional control',
};

const tabs = [
  { id: 'coach', label: 'Coach', Icon: BrainCircuit },
  { id: 'compete', label: 'Compete', Icon: Trophy },
  { id: 'classrooms', label: 'Classrooms', Icon: GraduationCap },
  { id: 'simulate', label: 'Simulate', Icon: Bot },
  { id: 'trust', label: 'Trust', Icon: ShieldCheck },
];

const fallback = (user) => ({
  profile: { username: user?.user_metadata?.username || user?.email?.split('@')[0] || 'Debater', elo_rating: 1000 },
  reasoningProfile: {
    overall: 64, confidence: 36, percentile: 52, trend: 0, match_count: 0,
    metrics: { logic: 68, evidence: 62, rebuttal: 64, clarity: 72, conciseness: 66, persuasion: 63, listening: 61, calibration: 58, humility: 70, sourceReliability: 57, emotionalControl: 74 },
  },
  ratings: [{ format_key: 'Ranked Classic', rating: 1000, matches_played: 0, peak_rating: 1000 }, { format_key: 'Rapid', rating: 968, matches_played: 0, peak_rating: 1000 }],
  season: { name: 'Founders Season', division: 'Silver', points: 100, progress: 42, days_left: 41, placement_complete: false },
  dailyDrill: { id: 'direct-rebuttal', metric: 'rebuttal', title: 'Three-minute direct rebuttal', duration: 3, description: 'Answer the opponent’s strongest claim before adding a new argument.', completed: false },
  clubs: [], classrooms: [], assignments: [], credentials: [], appeals: [], practice: [],
  tournaments: [
    { id: 'featured-campus', title: 'Inter-College Reasoning League', description: 'Weekly verified campus fixtures leading to a national final.', domain: 'Open', format: '1v1', bracket_size: 64, status: 'registration', verified: true, starts_at: new Date(Date.now() + 7 * 86400000).toISOString(), entries: 38 },
    { id: 'featured-tech-ethics', title: 'Technology & Ethics Cup', description: 'Fast-format debates on AI, privacy, biotechnology, and digital society.', domain: 'Technology', format: 'Rapid 1v1', bracket_size: 32, status: 'registration', verified: true, starts_at: new Date(Date.now() + 12 * 86400000).toISOString(), entries: 21 },
  ],
  simulations: [
    { scenario_key: 'sales-objection', title: 'Enterprise sales objection', description: 'Defend value and handle a skeptical procurement lead.', category: 'Sales', difficulty: 'Intermediate', opening_prompt: 'Your proposal is twice the price of the incumbent. Why should we take that risk?' },
    { scenario_key: 'salary-negotiation', title: 'Salary negotiation', description: 'Negotiate scope, evidence, and trade-offs under pressure.', category: 'Career', difficulty: 'Intermediate', opening_prompt: 'The budget is fixed. Why should we make an exception for your compensation?' },
    { scenario_key: 'design-review', title: 'Technical design review', description: 'Defend an architecture against reliability and cost concerns.', category: 'Technology', difficulty: 'Advanced', opening_prompt: 'This design adds operational complexity. Prove the reliability gain is worth it.' },
    { scenario_key: 'investor-pitch', title: 'Investor challenge room', description: 'Answer market, moat, and execution objections.', category: 'Leadership', difficulty: 'Advanced', opening_prompt: 'Your competitors can copy this in six months. What is actually defensible?' },
  ],
  trust: { judge_version: 'arena-panel-1.0', panel_size: 3, benchmark_status: 'Calibration dataset active', fairness_checks: ['Language', 'Accent', 'Ideology', 'Speaking order'], identity_blinding: true },
});

const Card = ({ children, className = '' }) => <section className={`rounded-2xl border border-slate-800 bg-slate-900/60 ${className}`}>{children}</section>;

const Pill = ({ children, tone = 'cyan' }) => {
  const tones = { cyan: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300', emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300', violet: 'border-violet-500/30 bg-violet-500/10 text-violet-300', amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300', rose: 'border-rose-500/30 bg-rose-500/10 text-rose-300' };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${tones[tone] || tones.cyan}`}>{children}</span>;
};

const Empty = ({ icon = Sparkles, title, body, action }) => (
  <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/30 p-8 text-center">
    {createElement(icon, { className: 'mx-auto mb-3 h-8 w-8 text-slate-500' })}
    <h3 className="font-bold text-slate-200">{title}</h3>
    <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{body}</p>
    {action}
  </div>
);

const Modal = ({ title, subtitle, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
    <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl">
      <div className="flex items-start justify-between border-b border-slate-800 p-6">
        <div><h2 className="text-xl font-black text-white">{title}</h2><p className="mt-1 text-sm text-slate-400">{subtitle}</p></div>
        <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-white"><X className="h-5 w-5" /></button>
      </div>
      <div className="p-6">{children}</div>
    </div>
  </div>
);

const Field = ({ label, ...props }) => <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">{label}</span><input {...props} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-500" /></label>;

const ArenaOS = ({ user }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('coach');
  const [data, setData] = useState(() => fallback(user));
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState(null);
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/product/bootstrap');
      setData(response.data.data);
      setOffline(false);
    } catch (error) {
      console.warn('[Arena OS] Using preview data:', error.message);
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (key, request, successText, update) => {
    setBusy(key); setNotice(null);
    try {
      const response = await request();
      if (update) setData(current => update(current, response.data));
      setNotice({ type: 'success', text: successText });
      return response.data;
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'That action could not be completed.' });
      return null;
    } finally { setBusy(''); }
  };

  const profile = data.reasoningProfile || fallback(user).reasoningProfile;
  const metrics = useMemo(() => profile.metrics || {}, [profile.metrics]);
  const radarData = useMemo(() => Object.entries(metricLabels).map(([key, label]) => ({ metric: label, score: Number(metrics[key]) || 0, fullMark: 100 })), [metrics]);
  const strongest = useMemo(() => Object.entries(metrics).sort((a, b) => b[1] - a[1]).slice(0, 3), [metrics]);
  const focus = useMemo(() => Object.entries(metrics).sort((a, b) => a[1] - b[1]).slice(0, 3), [metrics]);

  const startPractice = (params = {}) => {
    const search = new URLSearchParams({ topic: params.topic || 'Should AI systems be granted legal personhood?', stance: params.stance || 'for', ...params });
    navigate(`/practice?${search.toString()}`);
  };

  return (
    <main className="min-h-[calc(100vh-64px)] bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
        <header className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/60 p-6 sm:p-8">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2"><Pill>Arena OS</Pill><Pill tone="violet">Founders season</Pill>{offline && <Pill tone="amber">Preview mode</Pill>}</div>
              <h1 className="max-w-3xl text-3xl font-black tracking-tight text-white sm:text-5xl">Train your thinking. <span className="text-cyan-400">Prove your reasoning.</span></h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">One competitive identity across live debates, targeted coaching, campus leagues, classrooms, and high-stakes simulations.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => startPractice({ mode: 'sparring' })} className="flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-950 hover:bg-cyan-100"><Bot className="h-4 w-4" /> Practice now</button>
              <button onClick={() => navigate('/explore')} className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-5 py-3 text-sm font-bold text-slate-200 hover:border-cyan-500/50"><Swords className="h-4 w-4" /> Find a match</button>
            </div>
          </div>
        </header>

        <div className="mt-5 flex gap-2 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60 p-2">
          {tabs.map(tab => <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex min-w-max flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition ${activeTab === tab.id ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/10' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>{createElement(tab.Icon, { className: 'h-4 w-4' })}{tab.label}</button>)}
        </div>

        {notice && <div className={`mt-5 flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${notice.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}`}><span>{notice.text}</span><button onClick={() => setNotice(null)}><X className="h-4 w-4" /></button></div>}

        {loading ? <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-9 w-9 animate-spin text-cyan-400" /></div> : (
          <div className="mt-5">
            {activeTab === 'coach' && <CoachTab data={data} profile={profile} radarData={radarData} strongest={strongest} focus={focus} busy={busy} startPractice={startPractice} completeDrill={() => act('drill', () => api.post(`/product/drills/${data.dailyDrill.id}/complete`, {}), 'Daily drill complete. Your streak is protected.', current => ({ ...current, dailyDrill: { ...current.dailyDrill, completed: true } }))} />}
            {activeTab === 'compete' && <CompeteTab data={data} busy={busy} navigate={navigate} onCreateClub={() => setModal('club')} onJoin={(tournament) => act(`tournament-${tournament.id}`, () => api.post(`/product/tournaments/${tournament.id}/join`), `Registered for ${tournament.title}.`, current => ({ ...current, tournaments: current.tournaments.map(item => item.id === tournament.id ? { ...item, joined: true } : item) }))} onJoinClub={(club) => act(`club-${club.id}`, () => api.post(`/product/clubs/${club.id}/join`), `Joined ${club.name}.`, current => ({ ...current, clubs: current.clubs.map(item => item.id === club.id ? { ...item, joined: true } : item) }))} />}
            {activeTab === 'classrooms' && <ClassroomsTab data={data} onCreate={() => setModal('classroom')} onAssign={() => setModal('assignment')} />}
            {activeTab === 'simulate' && <SimulateTab simulations={data.simulations || []} practice={data.practice || []} startPractice={startPractice} />}
            {activeTab === 'trust' && <TrustTab data={data} onReport={() => setModal('report')} />}
          </div>
        )}
      </div>

      {modal === 'club' && <CreateClubModal busy={busy} onClose={() => setModal(null)} onSubmit={(payload) => act('create-club', () => api.post('/product/clubs', payload), 'Club created. Invite your first rival campus.', (current, result) => ({ ...current, clubs: [{ ...result.club, joined: true }, ...current.clubs] })).then(result => result && setModal(null))} />}
      {modal === 'classroom' && <CreateClassroomModal busy={busy} onClose={() => setModal(null)} onSubmit={(payload) => act('create-classroom', () => api.post('/product/classrooms', payload), 'Classroom created with a private join code.', (current, result) => ({ ...current, classrooms: [result.classroom, ...current.classrooms] })).then(result => result && setModal(null))} />}
      {modal === 'assignment' && <CreateAssignmentModal busy={busy} classrooms={data.classrooms || []} onClose={() => setModal(null)} onSubmit={(classroomId, payload) => act('create-assignment', () => api.post(`/product/classrooms/${classroomId}/assignments`, payload), 'Assignment published to the cohort.', (current, result) => ({ ...current, assignments: [result.assignment, ...current.assignments] })).then(result => result && setModal(null))} />}
      {modal === 'report' && <ReportModal busy={busy} onClose={() => setModal(null)} onSubmit={(payload) => act('report', () => api.post('/product/moderation/reports', payload), 'Report received. Safety review has started.').then(result => result && setModal(null))} />}
    </main>
  );
};

const CoachTab = ({ data, profile, radarData, strongest, focus, busy, startPractice, completeDrill }) => (
  <div className="grid gap-5 lg:grid-cols-12">
    <Card className="p-6 lg:col-span-4">
      <div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Verified reasoning identity</p><h2 className="mt-2 text-2xl font-black text-white">{data.profile?.username || 'Debater'}</h2></div><BadgeCheck className="h-7 w-7 text-cyan-400" /></div>
      <div className="mt-6 grid grid-cols-3 gap-2 text-center">
        {[['Overall', profile.overall], ['Percentile', `${profile.percentile}th`], ['Confidence', `${profile.confidence}%`]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-950/70 p-3"><div className="text-xl font-black text-white">{value}</div><div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div></div>)}
      </div>
      <div className="mt-5 h-[320px]">
        <ResponsiveContainer width="100%" height="100%"><RadarChart data={radarData} outerRadius="68%"><PolarGrid stroke="#334155" /><PolarAngleAxis dataKey="metric" tick={{ fill: '#94a3b8', fontSize: 9 }} /><PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} /><Radar dataKey="score" stroke="#22d3ee" fill="#06b6d4" fillOpacity={0.35} /></RadarChart></ResponsiveContainer>
      </div>
      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm"><span className="text-slate-400">Trend across verified matches</span><span className={`font-black ${profile.trend >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{profile.trend >= 0 ? '+' : ''}{profile.trend || 0}</span></div>
    </Card>

    <div className="space-y-5 lg:col-span-8">
      <Card className="overflow-hidden">
        <div className="border-b border-slate-800 p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">Today’s prescription</p><h2 className="mt-1 text-xl font-black text-white">{data.dailyDrill?.title}</h2></div>{data.dailyDrill?.completed ? <Pill tone="emerald"><Check className="mr-1 h-3 w-3" /> Complete</Pill> : <Pill>{data.dailyDrill?.duration} minutes</Pill>}</div><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">{data.dailyDrill?.description}</p></div>
        <div className="flex flex-col gap-3 p-6 sm:flex-row"><button disabled={data.dailyDrill?.completed || busy === 'drill'} onClick={completeDrill} className="flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-50">{busy === 'drill' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}{data.dailyDrill?.completed ? 'Completed today' : 'Complete focused drill'}</button><button onClick={() => startPractice({ mode: 'sparring' })} className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-5 py-3 text-sm font-bold text-slate-200 hover:bg-slate-800"><Bot className="h-4 w-4" /> Apply it against AI</button></div>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card className="p-6"><div className="mb-5 flex items-center gap-2"><Crown className="h-5 w-5 text-amber-400" /><h3 className="font-black text-white">Signature strengths</h3></div><div className="space-y-4">{strongest.map(([metric, score]) => <MetricRow key={metric} metric={metric} score={score} tone="emerald" />)}</div></Card>
        <Card className="p-6"><div className="mb-5 flex items-center gap-2"><Target className="h-5 w-5 text-violet-400" /><h3 className="font-black text-white">Highest-leverage focus</h3></div><div className="space-y-4">{focus.map(([metric, score]) => <MetricRow key={metric} metric={metric} score={score} tone="violet" />)}</div></Card>
      </div>
      <Card className="p-6"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-black text-white">Portable skill record</h3><p className="mt-1 text-sm text-slate-500">Built from repeated performances, with confidence rising as evidence accumulates.</p></div><LockKeyhole className="h-5 w-5 text-slate-500" /></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(profile.metrics || {}).map(([metric, score]) => <div key={metric} className="flex items-center justify-between rounded-xl bg-slate-950/60 px-4 py-3"><span className="text-xs font-semibold text-slate-400">{metricLabels[metric] || metric}</span><span className="font-black text-slate-100">{score}</span></div>)}</div></Card>
    </div>
  </div>
);

const MetricRow = ({ metric, score, tone }) => <div><div className="mb-2 flex justify-between text-xs"><span className="font-semibold text-slate-300">{metricLabels[metric] || metric}</span><span className="font-black text-white">{score}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className={`h-full rounded-full ${tone === 'emerald' ? 'bg-emerald-400' : 'bg-violet-400'}`} style={{ width: `${score}%` }} /></div></div>;

const CompeteTab = ({ data, busy, navigate, onCreateClub, onJoin, onJoinClub }) => (
  <div className="space-y-5">
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="relative overflow-hidden p-6 lg:col-span-2"><div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl" /><div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between"><div><Pill tone="violet">{data.season.name}</Pill><h2 className="mt-4 text-3xl font-black text-white">{data.season.division} Division</h2><p className="mt-2 text-sm text-slate-400">{data.season.points} season points · {data.season.days_left} days remaining</p></div><div className="grid min-w-[220px] grid-cols-2 gap-3 text-center"><div className="rounded-xl bg-slate-950/60 p-4"><div className="text-2xl font-black text-cyan-400">{data.profile?.elo_rating || 1000}</div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Global Elo</div></div><div className="rounded-xl bg-slate-950/60 p-4"><div className="text-2xl font-black text-white">{data.season.placement_complete ? 'Seeded' : '0/5'}</div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Placement</div></div></div></div><div className="relative mt-6"><div className="mb-2 flex justify-between text-xs font-bold text-slate-500"><span>Season journey</span><span>{data.season.progress}%</span></div><div className="h-2 rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400" style={{ width: `${data.season.progress}%` }} /></div></div></Card>
      <Card className="p-6"><h3 className="font-black text-white">Play your next fixture</h3><p className="mt-2 text-sm leading-6 text-slate-500">Ranked live play updates Elo. AI sparring updates coaching progress without risking rank.</p><div className="mt-6 space-y-3"><button onClick={() => navigate('/explore')} className="flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950"><span className="flex items-center gap-2"><Swords className="h-4 w-4" /> Ranked match</span><ArrowRight className="h-4 w-4" /></button><button onClick={() => navigate('/practice?mode=sparring')} className="flex w-full items-center justify-between rounded-xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-200"><span className="flex items-center gap-2"><Bot className="h-4 w-4" /> Unranked AI</span><ArrowRight className="h-4 w-4" /></button></div></Card>
    </div>

    <Card className="p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-xl font-black text-white">Format ratings</h2><p className="mt-1 text-sm text-slate-500">Separate identities for each competitive format and domain.</p></div><BarChart3 className="h-5 w-5 text-cyan-400" /></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{(data.ratings || []).map(rating => <div key={rating.format_key} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4"><div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider text-slate-500">{rating.format_key}</span><Activity className="h-4 w-4 text-cyan-500" /></div><div className="mt-3 text-3xl font-black text-white">{rating.rating}</div><div className="mt-2 text-xs text-slate-500">{rating.matches_played || 0} matches · peak {rating.peak_rating || rating.rating}</div></div>)}</div></Card>

    <div><div className="mb-4 flex items-end justify-between"><div><h2 className="text-xl font-black text-white">Verified competitions</h2><p className="mt-1 text-sm text-slate-500">Brackets, campus rivalries, and seasonal qualification.</p></div><Medal className="h-6 w-6 text-amber-400" /></div><div className="grid gap-5 lg:grid-cols-2">{(data.tournaments || []).map(tournament => <Card key={tournament.id} className="p-6"><div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap gap-2"><Pill tone={tournament.verified ? 'emerald' : 'cyan'}>{tournament.verified ? 'Verified' : tournament.status}</Pill><Pill tone="violet">{tournament.domain}</Pill></div><h3 className="mt-4 text-xl font-black text-white">{tournament.title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{tournament.description}</p></div><Trophy className="h-7 w-7 shrink-0 text-amber-400" /></div><div className="mt-5 grid grid-cols-3 gap-2 text-xs text-slate-400"><span className="rounded-lg bg-slate-950/60 p-2 text-center">{tournament.format}</span><span className="rounded-lg bg-slate-950/60 p-2 text-center">{tournament.bracket_size} bracket</span><span className="rounded-lg bg-slate-950/60 p-2 text-center">{new Date(tournament.starts_at).toLocaleDateString()}</span></div><button disabled={tournament.joined || busy === `tournament-${tournament.id}`} onClick={() => onJoin(tournament)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-60">{busy === `tournament-${tournament.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : tournament.joined ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{tournament.joined ? 'Registered' : 'Join tournament'}</button></Card>)}</div></div>

    <div><div className="mb-4 flex items-end justify-between"><div><h2 className="text-xl font-black text-white">Clubs & team leagues</h2><p className="mt-1 text-sm text-slate-500">Build a home for your campus, city, or practice cohort.</p></div><button onClick={onCreateClub} className="flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-bold text-slate-200 hover:bg-slate-800"><Plus className="h-4 w-4" /> Create club</button></div>{data.clubs?.length ? <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{data.clubs.map(club => <Card key={club.id} className="p-5"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ backgroundColor: `${club.badge_color || '#22d3ee'}22`, color: club.badge_color || '#22d3ee' }}><Users className="h-5 w-5" /></div><div><h3 className="font-black text-white">{club.name}</h3><p className="text-xs text-slate-500">{club.institution || club.city || 'Open community'}</p></div></div><p className="mt-4 line-clamp-2 text-sm text-slate-500">{club.description || 'A competitive home for serious thinkers.'}</p><button disabled={club.joined || busy === `club-${club.id}`} onClick={() => onJoinClub(club)} className="mt-4 w-full rounded-lg border border-slate-700 py-2 text-xs font-bold text-slate-300 disabled:opacity-60">{club.joined ? 'Member' : 'Join club'}</button></Card>)}</div> : <Empty icon={Users} title="Start the first club in your network" body="Create a campus or city club, invite teammates, and enter seasonal leagues together." />}</div>
  </div>
);

const ClassroomsTab = ({ data, onCreate, onAssign }) => (
  <div className="space-y-5">
    <div className="grid gap-5 lg:grid-cols-3"><Card className="p-6 lg:col-span-2"><div className="flex items-start justify-between"><div><Pill tone="amber">Education workspace</Pill><h2 className="mt-4 text-2xl font-black text-white">Measure improvement, not just winners.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Create cohorts, assign controlled debates, randomize positions, use custom rubrics, review transcripts and citations, and export defensible assessment evidence.</p></div><GraduationCap className="h-8 w-8 shrink-0 text-amber-400" /></div><div className="mt-6 grid gap-3 sm:grid-cols-3">{[['Custom rubrics', Scale], ['Integrity reports', ClipboardCheck], ['Progress analytics', BarChart3]].map(item => <div key={item[0]} className="flex items-center gap-3 rounded-xl bg-slate-950/50 p-4 text-sm font-semibold text-slate-300">{createElement(item[1], { className: 'h-4 w-4 text-cyan-400' })}{item[0]}</div>)}</div></Card><Card className="p-6"><h3 className="font-black text-white">Instructor actions</h3><div className="mt-5 space-y-3"><button onClick={onCreate} className="flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950"><span className="flex items-center gap-2"><Plus className="h-4 w-4" /> Create classroom</span><ChevronRight className="h-4 w-4" /></button><button disabled={!data.classrooms?.length} onClick={onAssign} className="flex w-full items-center justify-between rounded-xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-200 disabled:opacity-40"><span className="flex items-center gap-2"><BookOpen className="h-4 w-4" /> New assignment</span><ChevronRight className="h-4 w-4" /></button></div></Card></div>
    <div className="grid gap-5 lg:grid-cols-2"><div><h2 className="mb-4 text-lg font-black text-white">Your classrooms</h2>{data.classrooms?.length ? <div className="space-y-3">{data.classrooms.map(room => <Card key={room.id} className="p-5"><div className="flex items-start justify-between"><div><h3 className="font-black text-white">{room.name}</h3><p className="mt-1 text-xs text-slate-500">{room.term || 'Current term'} · AI policy: {room.ai_policy}</p></div><div className="rounded-lg border border-dashed border-cyan-500/40 bg-cyan-500/5 px-3 py-2 font-mono text-xs font-black text-cyan-300">{room.join_code}</div></div><div className="mt-4 flex gap-2 text-xs text-slate-500"><span className="rounded-lg bg-slate-950/60 px-3 py-2">Private cohort</span><span className="rounded-lg bg-slate-950/60 px-3 py-2">Custom rubric</span><span className="rounded-lg bg-slate-950/60 px-3 py-2">365-day retention</span></div></Card>)}</div> : <Empty icon={Building2} title="No classroom yet" body="Create a private cohort and share its join code with students." />}</div><div><h2 className="mb-4 text-lg font-black text-white">Assignments</h2>{data.assignments?.length ? <div className="space-y-3">{data.assignments.map(assignment => <Card key={assignment.id} className="p-5"><div className="flex justify-between gap-4"><div><h3 className="font-black text-white">{assignment.title}</h3><p className="mt-1 text-sm text-slate-500">{assignment.topic}</p></div><Pill tone="emerald">{assignment.status}</Pill></div><div className="mt-4 flex items-center gap-4 text-xs text-slate-500"><span className="flex items-center gap-1"><Clock3 className="h-3 w-3" />{assignment.duration_minutes} min</span><span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{assignment.due_at ? new Date(assignment.due_at).toLocaleDateString() : 'No due date'}</span></div></Card>)}</div> : <Empty icon={BookOpen} title="No assignments published" body="Assignments inherit the classroom rubric and controlled AI-use policy." />}</div></div>
  </div>
);

const SimulateTab = ({ simulations, practice, startPractice }) => (
  <div className="space-y-5"><Card className="overflow-hidden p-6 sm:p-8"><div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center"><div><Pill tone="violet">Professional simulations</Pill><h2 className="mt-4 text-2xl font-black text-white">Reason clearly when the stakes are real.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Private AI roleplay expands debate skills into sales, negotiation, leadership, consulting, interviews, policy, and technical review.</p></div><div className="grid grid-cols-2 gap-3 text-center"><div className="rounded-xl bg-slate-950/60 p-4"><div className="text-2xl font-black text-cyan-400">{practice.filter(item => item.session_type === 'simulation').length}</div><div className="text-[10px] uppercase tracking-wider text-slate-500">Completed</div></div><div className="rounded-xl bg-slate-950/60 p-4"><div className="text-2xl font-black text-white">11</div><div className="text-[10px] uppercase tracking-wider text-slate-500">Skills tracked</div></div></div></div></Card><div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{simulations.map((scenario, index) => <Card key={scenario.scenario_key || scenario.id} className="flex flex-col p-6"><div className="flex items-start justify-between"><div className={`flex h-11 w-11 items-center justify-center rounded-xl ${index % 3 === 0 ? 'bg-cyan-500/10 text-cyan-400' : index % 3 === 1 ? 'bg-violet-500/10 text-violet-400' : 'bg-amber-500/10 text-amber-400'}`}><Bot className="h-5 w-5" /></div><Pill tone={String(scenario.difficulty).toLowerCase() === 'advanced' ? 'rose' : 'cyan'}>{scenario.difficulty}</Pill></div><h3 className="mt-5 text-lg font-black text-white">{scenario.title}</h3><p className="mt-2 flex-1 text-sm leading-6 text-slate-500">{scenario.description}</p><div className="mt-4 rounded-xl bg-slate-950/60 p-3 text-xs italic leading-5 text-slate-400">“{scenario.opening_prompt}”</div><button onClick={() => startPractice({ mode: 'simulation', scenario: scenario.scenario_key, topic: scenario.title, opening: scenario.opening_prompt })} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-black text-slate-950">Enter simulation <ArrowRight className="h-4 w-4" /></button></Card>)}</div></div>
);

const TrustTab = ({ data, onReport }) => (
  <div className="space-y-5"><div className="grid gap-5 lg:grid-cols-3"><Card className="p-6 lg:col-span-2"><div className="flex items-start justify-between"><div><Pill tone="emerald">Auditable judging</Pill><h2 className="mt-4 text-2xl font-black text-white">Rankings only matter when the judge earns trust.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Every new match uses blind identities, three independent rubric lenses, median aggregation, factual-claim flags, uncertainty, judge-version tracking, and an appeal trail.</p></div><ShieldCheck className="h-9 w-9 text-emerald-400" /></div><div className="mt-6 grid gap-3 sm:grid-cols-3">{[['Independent judges', `${data.trust?.panel_size || 3}`], ['Judge version', data.trust?.judge_version || 'v1'], ['Identity blinding', data.trust?.identity_blinding ? 'On' : 'Off']].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-950/60 p-4"><div className="text-lg font-black text-white">{value}</div><div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div></div>)}</div></Card><Card className="p-6"><h3 className="font-black text-white">Safety centre</h3><p className="mt-2 text-sm leading-6 text-slate-500">Report harassment, manipulation, citation abuse, impersonation, or unsafe conduct. Match evidence is preserved for review.</p><button onClick={onReport} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 py-3 text-sm font-bold text-rose-300"><Flag className="h-4 w-4" /> File a report</button></Card></div><div className="grid gap-5 lg:grid-cols-2"><Card className="p-6"><div className="flex items-center justify-between"><h3 className="font-black text-white">Fairness checks</h3><Scale className="h-5 w-5 text-violet-400" /></div><div className="mt-5 grid grid-cols-2 gap-3">{(data.trust?.fairness_checks || []).map(check => <div key={check} className="flex items-center gap-2 rounded-xl bg-slate-950/60 p-3 text-sm text-slate-300"><Check className="h-4 w-4 text-emerald-400" />{check}</div>)}</div><div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-5 text-amber-200/80"><CircleAlert className="mr-2 inline h-4 w-4" />AI scores remain probabilistic assessments. Confidence and disagreement are exposed instead of hidden.</div></Card><Card className="p-6"><div className="flex items-center justify-between"><div><h3 className="font-black text-white">Your appeals</h3><p className="mt-1 text-xs text-slate-500">Re-evaluation never silently overwrites the original panel.</p></div><RefreshCw className="h-5 w-5 text-cyan-400" /></div>{data.appeals?.length ? <div className="mt-5 space-y-3">{data.appeals.map(appeal => <div key={appeal.id} className="flex items-center justify-between rounded-xl bg-slate-950/60 p-4"><div><div className="text-sm font-bold text-slate-200">Match {appeal.match_id.slice(0, 8)}</div><div className="mt-1 text-xs text-slate-500">Filed {new Date(appeal.created_at).toLocaleDateString()}</div></div><Pill tone={appeal.status === 'adjusted' ? 'emerald' : 'amber'}>{appeal.status}</Pill></div>)}</div> : <Empty icon={Scale} title="No disputed results" body="Match participants can open an appeal directly from a result page." />}</Card></div><Card className="p-6"><div className="flex items-center gap-3"><ClipboardCheck className="h-5 w-5 text-cyan-400" /><div><h3 className="font-black text-white">Evidence and integrity policy</h3><p className="mt-1 text-sm text-slate-500">Claims are flagged for verification; AI authorship is disclosure-based and is never treated as proven by an unreliable detector.</p></div></div></Card></div>
);

const CreateClubModal = ({ busy, onClose, onSubmit }) => {
  const [form, setForm] = useState({ name: '', institution: '', city: '', description: '' });
  return <Modal title="Create a club" subtitle="Build a competitive home for your campus or city." onClose={onClose}><form onSubmit={event => { event.preventDefault(); onSubmit(form); }} className="space-y-4"><Field required label="Club name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="IIT Delhi Reasoning Society" /><div className="grid grid-cols-2 gap-3"><Field label="Institution" value={form.institution} onChange={e => setForm({ ...form, institution: e.target.value })} placeholder="University" /><Field label="City" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="New Delhi" /></div><Field label="Mission" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What will your club compete for?" /><Submit busy={busy === 'create-club'} label="Create club" /></form></Modal>;
};

const CreateClassroomModal = ({ busy, onClose, onSubmit }) => {
  const [form, setForm] = useState({ name: '', term: '', ai_policy: 'disclose' });
  return <Modal title="Create a classroom" subtitle="A private cohort with rubric and integrity controls." onClose={onClose}><form onSubmit={event => { event.preventDefault(); onSubmit(form); }} className="space-y-4"><Field required label="Classroom name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Critical Thinking — Section A" /><Field label="Term" value={form.term} onChange={e => setForm({ ...form, term: e.target.value })} placeholder="Fall 2026" /><label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">AI-use policy</span><select value={form.ai_policy} onChange={e => setForm({ ...form, ai_policy: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100"><option value="allowed">Allowed</option><option value="disclose">Allowed with disclosure</option><option value="restricted">Restricted</option><option value="prohibited">Prohibited</option></select></label><Submit busy={busy === 'create-classroom'} label="Create classroom" /></form></Modal>;
};

const CreateAssignmentModal = ({ busy, classrooms, onClose, onSubmit }) => {
  const [classroomId, setClassroomId] = useState(classrooms[0]?.id || '');
  const [form, setForm] = useState({ title: '', topic: '', duration_minutes: 5, due_at: '', position_policy: 'random' });
  return <Modal title="Publish an assignment" subtitle="Students receive a position, timer, rubric, and integrity policy." onClose={onClose}><form onSubmit={event => { event.preventDefault(); onSubmit(classroomId, form); }} className="space-y-4"><label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Classroom</span><select required value={classroomId} onChange={e => setClassroomId(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100">{classrooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label><Field required label="Assignment title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Evidence under pressure" /><Field required label="Debate topic" value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} placeholder="Should universities prohibit generative AI?" /><div className="grid grid-cols-2 gap-3"><Field type="number" min="1" max="30" label="Minutes" value={form.duration_minutes} onChange={e => setForm({ ...form, duration_minutes: e.target.value })} /><Field type="datetime-local" label="Due date" value={form.due_at} onChange={e => setForm({ ...form, due_at: e.target.value })} /></div><Submit busy={busy === 'create-assignment'} label="Publish assignment" /></form></Modal>;
};

const ReportModal = ({ busy, onClose, onSubmit }) => {
  const [form, setForm] = useState({ category: 'Harassment', match_id: '', reported_user_id: '', details: '' });
  return <Modal title="Safety report" subtitle="Provide precise context; reports are reviewed with preserved match evidence." onClose={onClose}><form onSubmit={event => { event.preventDefault(); onSubmit(form); }} className="space-y-4"><label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Category</span><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100"><option>Harassment</option><option>Hate or abuse</option><option>Evidence manipulation</option><option>Impersonation</option><option>Spam</option><option>Other</option></select></label><Field label="Match ID (optional)" value={form.match_id} onChange={e => setForm({ ...form, match_id: e.target.value })} /><Field label="User ID (optional)" value={form.reported_user_id} onChange={e => setForm({ ...form, reported_user_id: e.target.value })} /><label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">What happened?</span><textarea required value={form.details} onChange={e => setForm({ ...form, details: e.target.value })} rows="4" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-rose-500" /></label><Submit busy={busy === 'report'} label="Submit confidential report" /></form></Modal>;
};

const Submit = ({ busy, label }) => <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 py-3.5 text-sm font-black text-slate-950 disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{label}</button>;

export default ArenaOS;
