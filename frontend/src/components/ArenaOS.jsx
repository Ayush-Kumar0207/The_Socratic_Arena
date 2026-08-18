import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BookOpen,
  Bot,
  BrainCircuit,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  Crown,
  FileSearch,
  Flag,
  GraduationCap,
  LayoutGrid,
  Loader2,
  LockKeyhole,
  Medal,
  Plus,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sparkles,
  Swords,
  Target,
  Trophy,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import api from "../services/api";

const metricLabels = {
  logic: "Logic",
  evidence: "Evidence",
  rebuttal: "Rebuttal",
  clarity: "Clarity",
  conciseness: "Conciseness",
  persuasion: "Persuasion",
  listening: "Listening",
  calibration: "Calibration",
  humility: "Epistemic humility",
  sourceReliability: "Source reliability",
  emotionalControl: "Emotional control",
};

const tabs = [
  { id: "coach", label: "Coach", Icon: BrainCircuit },
  { id: "compete", label: "Compete", Icon: Trophy },
  { id: "classrooms", label: "Classrooms", Icon: GraduationCap },
  { id: "simulate", label: "Simulate", Icon: Bot },
  { id: "trust", label: "Trust", Icon: ShieldCheck },
];

const bootstrapCacheKey = (userId) => `arena-os:bootstrap:${userId || "guest"}`;

const readBootstrapCache = (userId) => {
  try {
    const cached = JSON.parse(sessionStorage.getItem(bootstrapCacheKey(userId)));
    return cached?.data || null;
  } catch {
    return null;
  }
};

const writeBootstrapCache = (userId, data) => {
  try {
    sessionStorage.setItem(
      bootstrapCacheKey(userId),
      JSON.stringify({ data, cachedAt: Date.now() }),
    );
  } catch {
    // Storage can be unavailable in private browsing; live data still works.
  }
};

const fallback = (user) => ({
  profile: {
    username:
      user?.user_metadata?.username || user?.email?.split("@")[0] || "Debater",
    elo_rating: 1000,
  },
  reasoningProfile: {
    overall: 64,
    confidence: 36,
    percentile: null,
    cohort_size: 0,
    trend: 0,
    match_count: 0,
    metrics: {
      logic: 68,
      evidence: 62,
      rebuttal: 64,
      clarity: 72,
      conciseness: 66,
      persuasion: 63,
      listening: 61,
      calibration: 58,
      humility: 70,
      sourceReliability: 57,
      emotionalControl: 74,
    },
  },
  ratings: [
    {
      format_key: "Ranked Classic",
      rating: 1000,
      matches_played: 0,
      peak_rating: 1000,
    },
    { format_key: "Rapid", rating: 968, matches_played: 0, peak_rating: 1000 },
  ],
  season: {
    name: "Founders Season",
    division: "Silver",
    points: 100,
    progress: 42,
    days_left: 41,
    placement_complete: false,
  },
  dailyDrill: {
    id: "direct-rebuttal",
    metric: "rebuttal",
    title: "Three-minute direct rebuttal",
    duration: 3,
    description:
      "Answer the opponent’s strongest claim before adding a new argument.",
    completed: false,
  },
  clubs: [],
  classrooms: [],
  assignments: [],
  submissions: [],
  credentials: [],
  appeals: [],
  practice: [],
  proWaitlist: false,
  moderation: { actions: [], appeals: [] },
  admin: { is_admin: false, moderation_queue: null },
  tournaments: [
    {
      id: "featured-campus",
      title: "Inter-College Reasoning League",
      description:
        "Weekly verified campus fixtures leading to a national final.",
      domain: "Open",
      format: "1v1",
      bracket_size: 64,
      status: "registration",
      verified: true,
      starts_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      entries: 38,
    },
    {
      id: "featured-tech-ethics",
      title: "Technology & Ethics Cup",
      description:
        "Fast-format debates on AI, privacy, biotechnology, and digital society.",
      domain: "Technology",
      format: "Rapid 1v1",
      bracket_size: 32,
      status: "registration",
      verified: true,
      starts_at: new Date(Date.now() + 12 * 86400000).toISOString(),
      entries: 21,
    },
  ],
  simulations: [
    {
      scenario_key: "sales-objection",
      title: "Enterprise sales objection",
      description: "Defend value and handle a skeptical procurement lead.",
      category: "Sales",
      difficulty: "Intermediate",
      opening_prompt:
        "Your proposal is twice the price of the incumbent. Why should we take that risk?",
    },
    {
      scenario_key: "salary-negotiation",
      title: "Salary negotiation",
      description: "Negotiate scope, evidence, and trade-offs under pressure.",
      category: "Career",
      difficulty: "Intermediate",
      opening_prompt:
        "The budget is fixed. Why should we make an exception for your compensation?",
    },
    {
      scenario_key: "design-review",
      title: "Technical design review",
      description:
        "Defend an architecture against reliability and cost concerns.",
      category: "Technology",
      difficulty: "Advanced",
      opening_prompt:
        "This design adds operational complexity. Prove the reliability gain is worth it.",
    },
    {
      scenario_key: "investor-pitch",
      title: "Investor challenge room",
      description: "Answer market, moat, and execution objections.",
      category: "Leadership",
      difficulty: "Advanced",
      opening_prompt:
        "Your competitors can copy this in six months. What is actually defensible?",
    },
  ],
  trust: {
    judge_version: "arena-panel-1.0",
    panel_size: 3,
    benchmark_status: "Benchmark runner ready — no published measurement",
    fairness_checks: [
      "Language",
      "Accent proxy",
      "Ideology",
      "Speaking order",
    ].map((label) => ({ label, measured: false, gap: null })),
    identity_blinding: true,
  },
});

const Card = ({ children, className = "" }) => (
  <section
    className={`rounded-2xl border border-slate-800 bg-slate-900/60 ${className}`}
  >
    {children}
  </section>
);

const Pill = ({ children, tone = "cyan" }) => {
  const tones = {
    cyan: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    violet: "border-violet-500/30 bg-violet-500/10 text-violet-300",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    rose: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${tones[tone] || tones.cyan}`}
    >
      {children}
    </span>
  );
};

const Empty = ({ icon = Sparkles, title, body, action }) => (
  <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/30 p-8 text-center">
    {createElement(icon, { className: "mx-auto mb-3 h-8 w-8 text-slate-500" })}
    <h3 className="font-bold text-slate-200">{title}</h3>
    <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{body}</p>
    {action}
  </div>
);

const Modal = ({ title, subtitle, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
    <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl">
      <div className="flex items-start justify-between border-b border-slate-800 p-6">
        <div>
          <h2 className="text-xl font-black text-white">{title}</h2>
          <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="p-6">{children}</div>
    </div>
  </div>
);

const Field = ({ label, ...props }) => (
  <label className="block">
    <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
      {label}
    </span>
    <input
      {...props}
      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-500"
    />
  </label>
);

const ArenaOS = ({ user }) => {
  const navigate = useNavigate();
  const userId = user?.id;
  const [activeTab, setActiveTab] = useState("coach");
  const [data, setData] = useState(() => readBootstrapCache(userId) || fallback(user));
  const [loading, setLoading] = useState(() => !readBootstrapCache(userId));
  const [refreshing, setRefreshing] = useState(true);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await api.get("/product/bootstrap");
      setData(response.data.data);
      writeBootstrapCache(userId, response.data.data);
      setOffline(false);
    } catch (error) {
      console.warn("[Arena OS] Using preview data:", error.message);
      setOffline(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (key, request, successText, update) => {
    setBusy(key);
    setNotice(null);
    try {
      const response = await request();
      if (update) setData((current) => update(current, response.data));
      setNotice({ type: "success", text: successText });
      return response.data;
    } catch (error) {
      setNotice({
        type: "error",
        text:
          error.response?.data?.message ||
          "That action could not be completed.",
      });
      return null;
    } finally {
      setBusy("");
    }
  };

  const profile = data.reasoningProfile || fallback(user).reasoningProfile;
  const metrics = useMemo(() => profile.metrics || {}, [profile.metrics]);
  const radarData = useMemo(
    () =>
      Object.entries(metricLabels).map(([key, label]) => ({
        metric: label,
        score: Number(metrics[key]) || 0,
        fullMark: 100,
      })),
    [metrics],
  );
  const strongest = useMemo(
    () =>
      Object.entries(metrics)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3),
    [metrics],
  );
  const focus = useMemo(
    () =>
      Object.entries(metrics)
        .sort((a, b) => a[1] - b[1])
        .slice(0, 3),
    [metrics],
  );

  const startPractice = (params = {}) => {
    const search = new URLSearchParams({
      topic: params.topic || "Should AI systems be granted legal personhood?",
      stance: params.stance || "for",
      ...params,
    });
    navigate(`/practice?${search.toString()}`);
  };

  return (
    <main className="min-h-[calc(100vh-64px)] bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
        <header className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/60 p-6 sm:p-8">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Pill>Arena OS</Pill>
                <Pill tone="violet">Founders season</Pill>
                <Pill tone="violet">Pro coming soon</Pill>
                {offline && <Pill tone="amber">Preview mode</Pill>}
              </div>
              <h1 className="max-w-3xl text-3xl font-black tracking-tight text-white sm:text-5xl">
                Train your thinking.{" "}
                <span className="text-cyan-400">Prove your reasoning.</span>
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
                One competitive identity across live debates, targeted coaching,
                campus leagues, classrooms, and high-stakes simulations.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => startPractice({ mode: "sparring" })}
                className="flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-950 hover:bg-cyan-100"
              >
                <Bot className="h-4 w-4" /> Practice now
              </button>
              <button
                onClick={() => navigate("/explore")}
                className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-5 py-3 text-sm font-bold text-slate-200 hover:border-cyan-500/50"
              >
                <Swords className="h-4 w-4" /> Find a match
              </button>
              <button
                onClick={() =>
                  act(
                    "pro-waitlist",
                    () => api.post("/product/pro-waitlist"),
                    "You're on the Socratic Arena Pro waitlist.",
                    (current) => ({ ...current, proWaitlist: true }),
                  )
                }
                disabled={busy === "pro-waitlist" || data.proWaitlist}
                className="flex items-center gap-2 rounded-xl border border-violet-500/40 bg-violet-500/10 px-5 py-3 text-sm font-bold text-violet-200 hover:bg-violet-500/20 disabled:cursor-default disabled:opacity-70"
              >
                {busy === "pro-waitlist" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : data.proWaitlist ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {data.proWaitlist ? "Pro waitlist joined" : "Join Pro waitlist"}
              </button>
            </div>
          </div>
        </header>

        <div className="mt-5 flex gap-2 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60 p-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex min-w-max flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition ${activeTab === tab.id ? "bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/10" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}
            >
              {createElement(tab.Icon, { className: "h-4 w-4" })}
              {tab.label}
            </button>
          ))}
        </div>

        {notice && (
          <div
            role={notice.type === "error" ? "alert" : "status"}
            aria-live={notice.type === "error" ? "assertive" : "polite"}
            className={`fixed left-4 right-4 top-20 z-50 flex items-start justify-between gap-4 rounded-2xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-xl sm:left-auto sm:right-6 sm:max-w-md ${notice.type === "success" ? "border-emerald-500/40 bg-emerald-950/95 text-emerald-200 shadow-emerald-950/40" : "border-rose-500/40 bg-rose-950/95 text-rose-200 shadow-rose-950/40"}`}
          >
            <span className="font-semibold leading-6">{notice.text}</span>
            <button aria-label="Dismiss notification" onClick={() => setNotice(null)} className="mt-0.5 shrink-0 rounded-lg p-1 hover:bg-white/10">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex min-h-[420px] items-center justify-center" role="status" aria-live="polite">
            <div className="flex max-w-sm flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10">
                <Loader2 className="h-7 w-7 animate-spin text-cyan-400" />
              </div>
              <p className="mt-4 font-black text-white">Loading your Arena OS</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">Syncing coaching progress, matches, classrooms, and trust data.</p>
            </div>
          </div>
        ) : (
          <div className={`mt-5 transition-opacity ${refreshing ? "opacity-80" : "opacity-100"}`} aria-busy={refreshing}>
            {activeTab === "coach" && (
              <CoachTab
                data={data}
                profile={profile}
                radarData={radarData}
                strongest={strongest}
                focus={focus}
                busy={busy}
                navigate={navigate}
                startPractice={startPractice}
                completeDrill={() =>
                  act(
                    "drill",
                    () =>
                      api.post(
                        `/product/drills/${data.dailyDrill.id}/complete`,
                        {},
                      ),
                    "Daily drill complete. Your streak is protected.",
                    (current) => ({
                      ...current,
                      dailyDrill: { ...current.dailyDrill, completed: true },
                    }),
                  )
                }
              />
            )}
            {activeTab === "compete" && (
              <CompeteTab
                data={data}
                busy={busy}
                navigate={navigate}
                onCreateClub={() => setModal("club")}
                onCreateTournament={() => setModal("tournament")}
                onTeam={() => setModal("team")}
                onJoin={(tournament) =>
                  act(
                    `tournament-${tournament.id}`,
                    () =>
                      api.post(`/product/tournaments/${tournament.id}/join`),
                    `Registered for ${tournament.title}.`,
                    (current) => ({
                      ...current,
                      tournaments: current.tournaments.map((item) =>
                        item.id === tournament.id
                          ? { ...item, joined: true }
                          : item,
                      ),
                    }),
                  )
                }
                onJoinClub={(club) =>
                  act(
                    `club-${club.id}`,
                    () => api.post(`/product/clubs/${club.id}/join`),
                    `Joined ${club.name}.`,
                    (current) => ({
                      ...current,
                      clubs: current.clubs.map((item) =>
                        item.id === club.id ? { ...item, joined: true } : item,
                      ),
                    }),
                  )
                }
              />
            )}
            {activeTab === "classrooms" && (
              <ClassroomsTab
                data={data}
                onCreate={() => setModal("classroom")}
                onJoin={() => setModal("join-classroom")}
                onAssign={() => setModal("assignment")}
                onSubmit={(assignment) =>
                  setModal({ type: "submission", assignment })
                }
                onAnalytics={(classroom) =>
                  setModal({ type: "analytics", classroom })
                }
              />
            )}
            {activeTab === "simulate" && (
              <SimulateTab
                simulations={data.simulations || []}
                practice={data.practice || []}
                startPractice={startPractice}
              />
            )}
            {activeTab === "trust" && (
              <>
                <TrustTab data={data} onReport={() => setModal("report")} />
                <TrustOperations
                  data={data}
                  busy={busy}
                  onIssueCredential={() =>
                    act(
                      "credential",
                      () => api.post("/product/credentials/issue/reasoning"),
                      "Your signed reasoning credential is ready.",
                      (current, result) => ({
                        ...current,
                        credentials: [
                          result.credential,
                          ...current.credentials.filter(
                            (item) => item.id !== result.credential.id,
                          ),
                        ],
                      }),
                    )
                  }
                  onModerate={(report) =>
                    setModal({ type: "moderation", report })
                  }
                  onAppealAction={(action) => {
                    const reason = window.prompt(
                      "Explain why this restriction should be reconsidered",
                    );
                    if (!reason?.trim()) return;
                    act(
                      `appeal-action-${action.id}`,
                      () =>
                        api.post(
                          `/product/moderation/actions/${action.id}/appeal`,
                          { reason },
                        ),
                      "Restriction appeal filed for independent moderator review.",
                      (current, result) => ({
                        ...current,
                        moderation: {
                          ...current.moderation,
                          appeals: [
                            result.appeal,
                            ...(current.moderation?.appeals || []),
                          ],
                        },
                      }),
                    );
                  }}
                  onReviewAppeal={(appeal) => {
                    const uphold = window.confirm(
                      "Choose OK to uphold the restriction, or Cancel to revoke it.",
                    );
                    const resolution = window.prompt(
                      "Record the evidence-based resolution",
                    );
                    if (!resolution?.trim()) return;
                    act(
                      `review-appeal-${appeal.id}`,
                      () =>
                        api.post(
                          `/product/admin/moderation/appeals/${appeal.id}/resolve`,
                          { uphold_action: uphold, resolution },
                        ),
                      "Moderation appeal resolved and audit trail updated.",
                      (current) => ({
                        ...current,
                        admin: {
                          ...current.admin,
                          moderation_queue: {
                            ...current.admin.moderation_queue,
                            appeals: (
                              current.admin.moderation_queue?.appeals || []
                            ).filter((item) => item.id !== appeal.id),
                          },
                        },
                      }),
                    );
                  }}
                />
              </>
            )}
          </div>
        )}
      </div>

      {modal === "club" && (
        <CreateClubModal
          busy={busy}
          onClose={() => setModal(null)}
          onSubmit={(payload) =>
            act(
              "create-club",
              () => api.post("/product/clubs", payload),
              "Club created. Invite your first rival campus.",
              (current, result) => ({
                ...current,
                clubs: [{ ...result.club, joined: true }, ...current.clubs],
              }),
            ).then((result) => result && setModal(null))
          }
        />
      )}
      {modal === "classroom" && (
        <CreateClassroomModal
          busy={busy}
          onClose={() => setModal(null)}
          onSubmit={(payload) =>
            act(
              "create-classroom",
              () => api.post("/product/classrooms", payload),
              "Classroom created with a private join code.",
              (current, result) => ({
                ...current,
                classrooms: [result.classroom, ...current.classrooms],
              }),
            ).then((result) => result && setModal(null))
          }
        />
      )}
      {modal === "join-classroom" && (
        <JoinClassroomModal
          busy={busy}
          onClose={() => setModal(null)}
          onSubmit={(payload) =>
            act(
              "join-classroom",
              () => api.post("/product/classrooms/join", payload),
              "You joined the classroom.",
              (current, result) => ({
                ...current,
                classrooms: [
                  result.classroom,
                  ...current.classrooms.filter(
                    (item) => item.id !== result.classroom.id,
                  ),
                ],
              }),
            ).then((result) => result && setModal(null))
          }
        />
      )}
      {modal === "assignment" && (
        <CreateAssignmentModal
          busy={busy}
          classrooms={(data.classrooms || []).filter(
            (room) => room.role === "teacher",
          )}
          onClose={() => setModal(null)}
          onSubmit={(classroomId, payload) =>
            act(
              "create-assignment",
              () =>
                api.post(
                  `/product/classrooms/${classroomId}/assignments`,
                  payload,
                ),
              "Assignment published to the cohort.",
              (current, result) => ({
                ...current,
                assignments: [result.assignment, ...current.assignments],
              }),
            ).then((result) => result && setModal(null))
          }
        />
      )}
      {modal === "tournament" && (
        <CreateTournamentModal
          busy={busy}
          onClose={() => setModal(null)}
          onSubmit={(payload) =>
            act(
              "create-tournament",
              () => api.post("/product/tournaments", payload),
              "Tournament created and registration is open.",
              (current, result) => ({
                ...current,
                tournaments: [
                  { ...result.tournament, joined: false },
                  ...current.tournaments,
                ],
              }),
            ).then((result) => result && setModal(null))
          }
        />
      )}
      {modal === "team" && (
        <TeamDebateModal
          busy={busy}
          onClose={() => setModal(null)}
          onSubmit={(mode, payload) =>
            act(
              "team",
              () =>
                api.post(
                  mode === "create"
                    ? "/product/team-debates"
                    : "/product/team-debates/join",
                  payload,
                ),
              mode === "create" ? "2v2 arena created." : "Joined 2v2 arena.",
            ).then(
              (result) => result && navigate(`/team-arena/${result.debate.id}`),
            )
          }
        />
      )}
      {modal?.type === "submission" && (
        <SubmissionModal
          busy={busy}
          assignment={modal.assignment}
          onClose={() => setModal(null)}
          onSubmit={(payload) =>
            act(
              "submission",
              () =>
                api.post(
                  `/product/assignments/${modal.assignment.id}/submit`,
                  payload,
                ),
              "Assignment submitted with an integrity report.",
              (current, result) => ({
                ...current,
                assignments: current.assignments.map((item) =>
                  item.id === modal.assignment.id
                    ? { ...item, submission: result.submission }
                    : item,
                ),
              }),
            ).then((result) => result && setModal(null))
          }
        />
      )}
      {modal?.type === "analytics" && (
        <AnalyticsModal
          classroom={modal.classroom}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "moderation" && (
        <ModerationModal
          busy={busy}
          report={modal.report}
          onClose={() => setModal(null)}
          onSubmit={(payload) =>
            act(
              "moderate",
              () =>
                api.post(
                  `/product/admin/moderation/reports/${modal.report.id}/resolve`,
                  payload,
                ),
              "Moderation report resolved.",
              (current) => ({
                ...current,
                admin: {
                  ...current.admin,
                  moderation_queue: {
                    ...current.admin.moderation_queue,
                    reports: current.admin.moderation_queue.reports.filter(
                      (item) => item.id !== modal.report.id,
                    ),
                  },
                },
              }),
            ).then((result) => result && setModal(null))
          }
        />
      )}
      {modal === "report" && (
        <ReportModal
          busy={busy}
          onClose={() => setModal(null)}
          onSubmit={(payload) =>
            act(
              "report",
              () => api.post("/product/moderation/reports", payload),
              "Report received. Safety review has started.",
            ).then((result) => result && setModal(null))
          }
        />
      )}
    </main>
  );
};

const CoachTab = ({
  data,
  profile,
  radarData,
  strongest,
  focus,
  busy,
  navigate,
  startPractice,
  completeDrill,
}) => (
  <div className="grid gap-5 lg:grid-cols-12">
    <Card className="p-6 lg:col-span-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
            Verified reasoning identity
          </p>
          <h2 className="mt-2 text-2xl font-black text-white">
            {data.profile?.username || "Debater"}
          </h2>
        </div>
        <BadgeCheck className="h-7 w-7 text-cyan-400" />
      </div>
      <div className="mt-6 grid grid-cols-3 gap-2 text-center">
        {[
          ["Overall", profile.overall],
          [
            "Percentile",
            profile.percentile == null ? "—" : `${profile.percentile}th`,
          ],
          ["Confidence", `${profile.confidence}%`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-slate-950/70 p-3">
            <div className="text-xl font-black text-white">{value}</div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {label}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} outerRadius="68%">
            <PolarGrid stroke="#334155" />
            <PolarAngleAxis
              dataKey="metric"
              tick={{ fill: "#94a3b8", fontSize: 9 }}
            />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar
              dataKey="score"
              stroke="#22d3ee"
              fill="#06b6d4"
              fillOpacity={0.35}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm">
        <span className="text-slate-400">Trend across verified matches</span>
        <span
          className={`font-black ${profile.trend >= 0 ? "text-emerald-400" : "text-rose-400"}`}
        >
          {profile.trend >= 0 ? "+" : ""}
          {profile.trend || 0}
        </span>
      </div>
    </Card>

    <div className="space-y-5 lg:col-span-8">
      <Card className="overflow-hidden">
        <div className="border-b border-slate-800 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">
                Today’s prescription
              </p>
              <h2 className="mt-1 text-xl font-black text-white">
                {data.dailyDrill?.title}
              </h2>
            </div>
            {data.dailyDrill?.completed ? (
              <Pill tone="emerald">
                <Check className="mr-1 h-3 w-3" /> Complete
              </Pill>
            ) : (
              <Pill>{data.dailyDrill?.duration} minutes</Pill>
            )}
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            {data.dailyDrill?.description}
          </p>
        </div>
        <div className="flex flex-col gap-3 p-6 sm:flex-row">
          <button
            disabled={data.dailyDrill?.completed || busy === "drill"}
            onClick={completeDrill}
            className="flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-50"
          >
            {busy === "drill" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            {data.dailyDrill?.completed
              ? "Completed today"
              : "Complete focused drill"}
          </button>
          <button
            onClick={() => startPractice({ mode: "sparring" })}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-5 py-3 text-sm font-bold text-slate-200 hover:bg-slate-800"
          >
            <Bot className="h-4 w-4" /> Apply it against AI
          </button>
        </div>
      </Card>

      <Card className="relative overflow-hidden border-cyan-500/20 p-6">
        <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-400"><FileSearch className="h-4 w-4" /> Evidence Arena</div>
            <h2 className="mt-2 text-xl font-black text-white">Cross-examine a source, not a vague prompt</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">Upload a PDF and watch Critic and Defender retrieve, cite, and evaluate evidence without changing your competitive Elo.</p>
          </div>
          <button onClick={() => navigate('/evidence-arena')} className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-black text-slate-950"><BookOpen className="h-4 w-4" /> Open Evidence Arena <ArrowRight className="h-4 w-4" /></button>
        </div>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card className="p-6">
          <div className="mb-5 flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-400" />
            <h3 className="font-black text-white">Signature strengths</h3>
          </div>
          <div className="space-y-4">
            {strongest.map(([metric, score]) => (
              <MetricRow
                key={metric}
                metric={metric}
                score={score}
                tone="emerald"
              />
            ))}
          </div>
        </Card>
        <Card className="p-6">
          <div className="mb-5 flex items-center gap-2">
            <Target className="h-5 w-5 text-violet-400" />
            <h3 className="font-black text-white">Highest-leverage focus</h3>
          </div>
          <div className="space-y-4">
            {focus.map(([metric, score]) => (
              <MetricRow
                key={metric}
                metric={metric}
                score={score}
                tone="violet"
              />
            ))}
          </div>
        </Card>
      </div>
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-black text-white">Portable skill record</h3>
            <p className="mt-1 text-sm text-slate-500">
              Built from repeated performances, with confidence rising as
              evidence accumulates.
            </p>
          </div>
          <LockKeyhole className="h-5 w-5 text-slate-500" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(profile.metrics || {}).map(([metric, score]) => (
            <div
              key={metric}
              className="flex items-center justify-between rounded-xl bg-slate-950/60 px-4 py-3"
            >
              <span className="text-xs font-semibold text-slate-400">
                {metricLabels[metric] || metric}
              </span>
              <span className="font-black text-slate-100">{score}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  </div>
);

const MetricRow = ({ metric, score, tone }) => (
  <div>
    <div className="mb-2 flex justify-between text-xs">
      <span className="font-semibold text-slate-300">
        {metricLabels[metric] || metric}
      </span>
      <span className="font-black text-white">{score}</span>
    </div>
    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
      <div
        className={`h-full rounded-full ${tone === "emerald" ? "bg-emerald-400" : "bg-violet-400"}`}
        style={{ width: `${score}%` }}
      />
    </div>
  </div>
);

const CompeteTab = ({
  data,
  busy,
  navigate,
  onCreateClub,
  onCreateTournament,
  onTeam,
  onJoin,
  onJoinClub,
}) => (
  <div className="space-y-5">
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="relative overflow-hidden p-6 lg:col-span-2">
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Pill tone="violet">{data.season.name}</Pill>
            <h2 className="mt-4 text-3xl font-black text-white">
              {data.season.division} Division
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              {data.season.points} season points · {data.season.days_left} days
              remaining
            </p>
          </div>
          <div className="grid min-w-[220px] grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-slate-950/60 p-4">
              <div className="text-2xl font-black text-cyan-400">
                {data.profile?.elo_rating || 1000}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Global Elo
              </div>
            </div>
            <div className="rounded-xl bg-slate-950/60 p-4">
              <div className="text-2xl font-black text-white">
                {data.season.placement_complete ? "Seeded" : "0/5"}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Placement
              </div>
            </div>
          </div>
        </div>
        <div className="relative mt-6">
          <div className="mb-2 flex justify-between text-xs font-bold text-slate-500">
            <span>Season journey</span>
            <span>{data.season.progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400"
              style={{ width: `${data.season.progress}%` }}
            />
          </div>
        </div>
      </Card>
      <Card className="p-6">
        <h3 className="font-black text-white">Play your next fixture</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Ranked live play updates Elo. Team arenas coordinate four verified
          speakers.
        </p>
        <div className="mt-6 space-y-3">
          <button
            onClick={() => navigate("/explore")}
            className="flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950"
          >
            <span className="flex items-center gap-2">
              <Swords className="h-4 w-4" /> Ranked 1v1
            </span>
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            onClick={onTeam}
            className="flex w-full items-center justify-between rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 py-3 text-sm font-bold text-violet-200"
          >
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4" /> Create / join 2v2
            </span>
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => navigate("/practice?mode=sparring")}
            className="flex w-full items-center justify-between rounded-xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-200"
          >
            <span className="flex items-center gap-2">
              <Bot className="h-4 w-4" /> Unranked AI
            </span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </Card>
    </div>

    <Card className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-white">Format ratings</h2>
          <p className="mt-1 text-sm text-slate-500">
            Separate identities for each competitive format and domain.
          </p>
        </div>
        <BarChart3 className="h-5 w-5 text-cyan-400" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(data.ratings || []).map((rating) => (
          <div
            key={rating.format_key}
            className="rounded-xl border border-slate-800 bg-slate-950/50 p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {rating.format_key}
              </span>
              <Activity className="h-4 w-4 text-cyan-500" />
            </div>
            <div className="mt-3 text-3xl font-black text-white">
              {rating.rating}
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {rating.matches_played || 0} matches · peak{" "}
              {rating.peak_rating || rating.rating}
            </div>
          </div>
        ))}
      </div>
    </Card>

    <div>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white">
            Verified competitions
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Seeded brackets, certified results, automatic advancement, and
            champion credentials.
          </p>
        </div>
        <button
          onClick={onCreateTournament}
          className="flex items-center gap-2 rounded-xl border border-amber-500/30 px-4 py-2.5 text-sm font-bold text-amber-300"
        >
          <Plus className="h-4 w-4" /> Host
        </button>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {(data.tournaments || []).map((tournament) => (
          <Card key={tournament.id} className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap gap-2">
                  <Pill tone={tournament.verified ? "emerald" : "cyan"}>
                    {tournament.verified ? "Verified" : tournament.status}
                  </Pill>
                  <Pill tone="violet">{tournament.domain}</Pill>
                </div>
                <h3 className="mt-4 text-xl font-black text-white">
                  {tournament.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {tournament.description}
                </p>
              </div>
              <Trophy className="h-7 w-7 shrink-0 text-amber-400" />
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 text-xs text-slate-400">
              <span className="rounded-lg bg-slate-950/60 p-2 text-center">
                {tournament.format}
              </span>
              <span className="rounded-lg bg-slate-950/60 p-2 text-center">
                {tournament.bracket_size} bracket
              </span>
              <span className="rounded-lg bg-slate-950/60 p-2 text-center">
                {new Date(tournament.starts_at).toLocaleDateString()}
              </span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                disabled={
                  tournament.joined ||
                  tournament.status !== "registration" ||
                  busy === `tournament-${tournament.id}`
                }
                onClick={() => onJoin(tournament)}
                className="flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-60"
              >
                {tournament.joined ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {tournament.joined ? "Registered" : "Join"}
              </button>
              <button
                disabled={!tournament.id?.includes?.("-")}
                onClick={() => navigate(`/tournaments/${tournament.id}`)}
                className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-200 disabled:opacity-40"
              >
                View bracket
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>

    <div>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-xl font-black text-white">
            Clubs & team leagues
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Build a home for your campus, city, or practice cohort.
          </p>
        </div>
        <button
          onClick={onCreateClub}
          className="flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-bold text-slate-200 hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" /> Create club
        </button>
      </div>
      {data.clubs?.length ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.clubs.map((club) => (
            <Card key={club.id} className="p-5">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{
                    backgroundColor: `${club.badge_color || "#22d3ee"}22`,
                    color: club.badge_color || "#22d3ee",
                  }}
                >
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-black text-white">{club.name}</h3>
                  <p className="text-xs text-slate-500">
                    {club.institution || club.city || "Open community"}
                  </p>
                </div>
              </div>
              <p className="mt-4 line-clamp-2 text-sm text-slate-500">
                {club.description || "A competitive home for serious thinkers."}
              </p>
              <button
                disabled={club.joined || busy === `club-${club.id}`}
                onClick={() => onJoinClub(club)}
                className="mt-4 w-full rounded-lg border border-slate-700 py-2 text-xs font-bold text-slate-300 disabled:opacity-60"
              >
                {club.joined ? "Member" : "Join club"}
              </button>
            </Card>
          ))}
        </div>
      ) : (
        <Empty
          icon={Users}
          title="Start the first club in your network"
          body="Create a campus or city club, invite teammates, and enter seasonal leagues together."
        />
      )}
    </div>
  </div>
);

const ClassroomsTab = ({
  data,
  onCreate,
  onJoin,
  onAssign,
  onSubmit,
  onAnalytics,
}) => (
  <div className="space-y-5">
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="p-6 lg:col-span-2">
        <div className="flex items-start justify-between">
          <div>
            <Pill tone="amber">Education workspace</Pill>
            <h2 className="mt-4 text-2xl font-black text-white">
              Measure improvement, not just winners.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Students join private cohorts, complete rubric-scored work,
              receive source integrity reports, teacher feedback, analytics
              exports, and signed completion credentials.
            </p>
          </div>
          <GraduationCap className="h-8 w-8 shrink-0 text-amber-400" />
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            ["Custom rubrics", Scale],
            ["Integrity reports", ClipboardCheck],
            ["Progress analytics", BarChart3],
          ].map((item) => (
            <div
              key={item[0]}
              className="flex items-center gap-3 rounded-xl bg-slate-950/50 p-4 text-sm font-semibold text-slate-300"
            >
              {createElement(item[1], { className: "h-4 w-4 text-cyan-400" })}
              {item[0]}
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-6">
        <h3 className="font-black text-white">Classroom actions</h3>
        <div className="mt-5 space-y-3">
          <button
            onClick={onJoin}
            className="flex w-full items-center justify-between rounded-xl bg-cyan-500 px-4 py-3 text-sm font-black text-slate-950"
          >
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4" /> Join with code
            </span>
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={onCreate}
            className="flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950"
          >
            <span className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> Create classroom
            </span>
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            disabled={!data.classrooms?.some((room) => room.role === "teacher")}
            onClick={onAssign}
            className="flex w-full items-center justify-between rounded-xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-200 disabled:opacity-40"
          >
            <span className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" /> New assignment
            </span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </Card>
    </div>
    <div className="grid gap-5 lg:grid-cols-2">
      <div>
        <h2 className="mb-4 text-lg font-black text-white">Your classrooms</h2>
        {data.classrooms?.length ? (
          <div className="space-y-3">
            {data.classrooms.map((room) => (
              <Card key={room.id} className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-black text-white">{room.name}</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {room.term || "Current term"} · {room.role || "member"} ·
                      AI policy: {room.ai_policy}
                    </p>
                  </div>
                  {room.role === "teacher" && (
                    <div className="rounded-lg border border-dashed border-cyan-500/40 bg-cyan-500/5 px-3 py-2 font-mono text-xs font-black text-cyan-300">
                      {room.join_code}
                    </div>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="rounded-lg bg-slate-950/60 px-3 py-2">
                    Private cohort
                  </span>
                  <span className="rounded-lg bg-slate-950/60 px-3 py-2">
                    Custom rubric
                  </span>
                  {room.role === "teacher" && (
                    <button
                      onClick={() => onAnalytics(room)}
                      className="rounded-lg border border-amber-500/30 px-3 py-2 font-bold text-amber-300"
                    >
                      Analytics & grading
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Empty
            icon={Building2}
            title="No classroom yet"
            body="Join with a code or create a private cohort."
          />
        )}
      </div>
      <div>
        <h2 className="mb-4 text-lg font-black text-white">Assignments</h2>
        {data.assignments?.length ? (
          <div className="space-y-3">
            {data.assignments.map((assignment) => (
              <Card key={assignment.id} className="p-5">
                <div className="flex justify-between gap-4">
                  <div>
                    <h3 className="font-black text-white">
                      {assignment.title}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {assignment.topic}
                    </p>
                  </div>
                  <Pill
                    tone={
                      assignment.submission?.status === "graded"
                        ? "emerald"
                        : "amber"
                    }
                  >
                    {assignment.submission?.status || assignment.status}
                  </Pill>
                </div>
                <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock3 className="h-3 w-3" />
                    {assignment.duration_minutes} min
                  </span>
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {assignment.due_at
                      ? new Date(assignment.due_at).toLocaleDateString()
                      : "No due date"}
                  </span>
                </div>
                {!assignment.submission &&
                  data.classrooms?.some(
                    (room) =>
                      room.id === assignment.classroom_id &&
                      room.role === "student",
                  ) && (
                    <button
                      onClick={() => onSubmit(assignment)}
                      className="mt-4 w-full rounded-lg bg-white py-2.5 text-xs font-black text-slate-950"
                    >
                      Complete & submit
                    </button>
                  )}
                {assignment.submission?.status === "graded" && (
                  <div className="mt-4 rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-300">
                    Grade {assignment.submission.grade}/100 ·{" "}
                    {assignment.submission.feedback || "Graded"}
                  </div>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <Empty
            icon={BookOpen}
            title="No assignments published"
            body="Assignments inherit the classroom rubric and controlled AI-use policy."
          />
        )}
      </div>
    </div>
  </div>
);

const SimulateTab = ({ simulations, practice, startPractice }) => (
  <div className="space-y-5">
    <Card className="overflow-hidden p-6 sm:p-8">
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
        <div>
          <Pill tone="violet">Professional simulations</Pill>
          <h2 className="mt-4 text-2xl font-black text-white">
            Reason clearly when the stakes are real.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Private AI roleplay expands debate skills into sales, negotiation,
            leadership, consulting, interviews, policy, and technical review.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="rounded-xl bg-slate-950/60 p-4">
            <div className="text-2xl font-black text-cyan-400">
              {
                practice.filter((item) => item.session_type === "simulation")
                  .length
              }
            </div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Completed
            </div>
          </div>
          <div className="rounded-xl bg-slate-950/60 p-4">
            <div className="text-2xl font-black text-white">11</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Skills tracked
            </div>
          </div>
        </div>
      </div>
    </Card>
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {simulations.map((scenario, index) => (
        <Card
          key={scenario.scenario_key || scenario.id}
          className="flex flex-col p-6"
        >
          <div className="flex items-start justify-between">
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-xl ${index % 3 === 0 ? "bg-cyan-500/10 text-cyan-400" : index % 3 === 1 ? "bg-violet-500/10 text-violet-400" : "bg-amber-500/10 text-amber-400"}`}
            >
              <Bot className="h-5 w-5" />
            </div>
            <Pill
              tone={
                String(scenario.difficulty).toLowerCase() === "advanced"
                  ? "rose"
                  : "cyan"
              }
            >
              {scenario.difficulty}
            </Pill>
          </div>
          <h3 className="mt-5 text-lg font-black text-white">
            {scenario.title}
          </h3>
          <p className="mt-2 flex-1 text-sm leading-6 text-slate-500">
            {scenario.description}
          </p>
          <div className="mt-4 rounded-xl bg-slate-950/60 p-3 text-xs italic leading-5 text-slate-400">
            “{scenario.opening_prompt}”
          </div>
          <button
            onClick={() =>
              startPractice({
                mode: "simulation",
                scenario: scenario.scenario_key,
                topic: scenario.title,
                opening: scenario.opening_prompt,
              })
            }
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-black text-slate-950"
          >
            Enter simulation <ArrowRight className="h-4 w-4" />
          </button>
        </Card>
      ))}
    </div>
  </div>
);

const TrustTab = ({ data, onReport }) => (
  <div className="space-y-5">
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="p-6 lg:col-span-2">
        <div className="flex items-start justify-between">
          <div>
            <Pill tone="emerald">Auditable judging</Pill>
            <h2 className="mt-4 text-2xl font-black text-white">
              Rankings only matter when the judge earns trust.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Every new match uses blind identities, three independent rubric
              lenses, median aggregation, factual-claim flags, uncertainty,
              judge-version tracking, and an appeal trail.
            </p>
          </div>
          <ShieldCheck className="h-9 w-9 text-emerald-400" />
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            ["Independent judges", `${data.trust?.panel_size || 3}`],
            ["Judge version", data.trust?.judge_version || "v1"],
            ["Identity blinding", data.trust?.identity_blinding ? "On" : "Off"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-slate-950/60 p-4">
              <div className="text-lg font-black text-white">{value}</div>
              <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {label}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-6">
        <h3 className="font-black text-white">Safety centre</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Report harassment, manipulation, citation abuse, impersonation, or
          unsafe conduct. Match evidence is preserved for review.
        </p>
        <button
          onClick={onReport}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 py-3 text-sm font-bold text-rose-300"
        >
          <Flag className="h-4 w-4" /> File a report
        </button>
      </Card>
    </div>
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-white">Fairness benchmark</h3>
          <Scale className="h-5 w-5 text-violet-400" />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          {(data.trust?.fairness_checks || []).map((check) => (
            <div
              key={check.label || check}
              className="flex items-center gap-2 rounded-xl bg-slate-950/60 p-3 text-sm text-slate-300"
            >
              {check.measured ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <Clock3 className="h-4 w-4 text-amber-400" />
              )}
              {check.label || check}
              {check.measured && check.gap != null && (
                <span className="ml-auto text-[10px] text-slate-500">
                  gap {Number(check.gap).toFixed(2)}
                </span>
              )}
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          {data.trust?.benchmark_status}
        </p>
        <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-5 text-amber-200/80">
          <CircleAlert className="mr-2 inline h-4 w-4" />
          AI scores remain probabilistic. A dimension is labelled measured only
          after a stored, reproducible benchmark run. The current small
          calibration set is a regression gate, not proof of population-wide
          fairness.
        </div>
      </Card>
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-black text-white">Your appeals</h3>
            <p className="mt-1 text-xs text-slate-500">
              Re-evaluation never silently overwrites the original panel.
            </p>
          </div>
          <RefreshCw className="h-5 w-5 text-cyan-400" />
        </div>
        {data.appeals?.length ? (
          <div className="mt-5 space-y-3">
            {data.appeals.map((appeal) => (
              <div
                key={appeal.id}
                className="flex items-center justify-between rounded-xl bg-slate-950/60 p-4"
              >
                <div>
                  <div className="text-sm font-bold text-slate-200">
                    Match {appeal.match_id.slice(0, 8)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Filed {new Date(appeal.created_at).toLocaleDateString()}
                  </div>
                </div>
                <Pill tone={appeal.status === "adjusted" ? "emerald" : "amber"}>
                  {appeal.status}
                </Pill>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            icon={Scale}
            title="No disputed results"
            body="Match participants can open an appeal directly from a result page."
          />
        )}
      </Card>
    </div>
    <Card className="p-6">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="h-5 w-5 text-cyan-400" />
        <div>
          <h3 className="font-black text-white">
            Evidence and integrity policy
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Claims are flagged for verification; AI authorship is
            disclosure-based and is never treated as proven by an unreliable
            detector.
          </p>
        </div>
      </div>
    </Card>
  </div>
);

const TrustOperations = ({
  data,
  busy,
  onIssueCredential,
  onModerate,
  onAppealAction,
  onReviewAppeal,
}) => (
  <div className="mt-5 grid gap-5 lg:grid-cols-2">
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-black text-white">Calibration evidence</h3>
          <p className="mt-1 text-xs text-slate-500">
            {data.trust?.benchmark_status}
          </p>
        </div>
        <Scale className="h-5 w-5 text-violet-400" />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {(data.trust?.fairness_checks || []).map((check) => (
          <div
            key={check.label || check}
            className="rounded-xl bg-slate-950/60 p-3"
          >
            <div className="flex items-center gap-2 text-sm text-slate-300">
              {check.measured ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <Clock3 className="h-4 w-4 text-amber-400" />
              )}
              {check.label || check}
            </div>
            <div className="mt-1 text-[10px] text-slate-600">
              {check.measured && check.gap != null
                ? `Measured gap ${Number(check.gap).toFixed(2)}`
                : "Not yet measured"}
            </div>
          </div>
        ))}
      </div>
      {data.trust?.benchmark && (
        <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-200">
          Dataset {data.trust.benchmark.dataset_version} · n=
          {data.trust.benchmark.dataset_size} · accuracy{" "}
          {Number(data.trust.benchmark.accuracy).toFixed(1)}%
          <div className="mt-1 text-[10px] leading-4 text-emerald-100/60">
            Reproducible regression evidence; not a population-wide scientific
            fairness claim.
          </div>
        </div>
      )}
    </Card>
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-black text-white">Signed credentials</h3>
          <p className="mt-1 text-xs text-slate-500">
            Issued only from measured performance and independently verifiable
            by code.
          </p>
        </div>
        <BadgeCheck className="h-6 w-6 text-cyan-400" />
      </div>
      <button
        onClick={onIssueCredential}
        disabled={busy === "credential"}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-black text-slate-950 disabled:opacity-50"
      >
        {busy === "credential" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <BadgeCheck className="h-4 w-4" />
        )}{" "}
        Issue current reasoning credential
      </button>
      <div className="mt-4 space-y-2">
        {(data.credentials || []).slice(0, 4).map((credential) => (
          <a
            key={credential.id}
            href={`/verify/${credential.verification_code}`}
            className="block rounded-xl bg-slate-950/60 p-3 hover:bg-slate-900"
          >
            <div className="text-sm font-bold text-slate-200">
              {credential.title}
            </div>
            <div className="mt-1 font-mono text-[10px] text-cyan-500">
              {credential.verification_code}
            </div>
          </a>
        ))}
      </div>
    </Card>
    {data.moderation?.active_action && (
      <Card className="border-rose-500/30 p-6">
        <h3 className="font-black text-rose-300">Active account restriction</h3>
        <p className="mt-2 text-sm text-slate-400">
          {data.moderation.active_action.reason}
        </p>
        <p className="mt-2 text-xs uppercase text-rose-400">
          {data.moderation.active_action.action_type}
        </p>
        <button
          onClick={() => onAppealAction(data.moderation.active_action)}
          disabled={(data.moderation.appeals || []).some(
            (appeal) =>
              appeal.action_id === data.moderation.active_action.id &&
              ["queued", "reviewing"].includes(appeal.status),
          )}
          className="mt-4 rounded-xl border border-rose-500/30 px-4 py-2 text-xs font-bold text-rose-200 disabled:opacity-40"
        >
          Appeal restriction
        </button>
      </Card>
    )}
    {data.admin?.is_admin && (
      <Card className="p-6 lg:col-span-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-black text-white">Moderator triage queue</h3>
            <p className="mt-1 text-xs text-slate-500">
              Resolve reports into warnings, suspensions, bans, or dismissals.
            </p>
          </div>
          <ShieldCheck className="h-5 w-5 text-rose-400" />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(data.admin.moderation_queue?.reports || []).map((report) => (
            <button
              key={report.id}
              onClick={() => onModerate(report)}
              className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-left hover:border-rose-500/40"
            >
              <div className="text-sm font-bold text-slate-200">
                {report.category}
              </div>
              <div className="mt-1 line-clamp-2 text-xs text-slate-500">
                {report.details || "No additional detail"}
              </div>
              <div className="mt-2 text-[10px] uppercase text-rose-400">
                Review report
              </div>
            </button>
          ))}
        </div>
        {!data.admin.moderation_queue?.reports?.length && (
          <p className="mt-4 text-sm text-slate-600">No open safety reports.</p>
        )}
        {(data.admin.moderation_queue?.appeals || []).length > 0 && (
          <div className="mt-6 border-t border-slate-800 pt-5">
            <h4 className="text-sm font-black text-white">
              Restriction appeals
            </h4>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {data.admin.moderation_queue.appeals.map((appeal) => (
                <button
                  key={appeal.id}
                  onClick={() => onReviewAppeal(appeal)}
                  className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-left"
                >
                  <div className="line-clamp-2 text-xs text-slate-300">
                    {appeal.reason}
                  </div>
                  <div className="mt-2 text-[10px] font-bold uppercase text-amber-300">
                    Resolve appeal
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>
    )}
  </div>
);

const CreateClubModal = ({ busy, onClose, onSubmit }) => {
  const [form, setForm] = useState({
    name: "",
    institution: "",
    city: "",
    description: "",
  });
  return (
    <Modal
      title="Create a club"
      subtitle="Build a competitive home for your campus or city."
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(form);
        }}
        className="space-y-4"
      >
        <Field
          required
          label="Club name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="IIT Delhi Reasoning Society"
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Institution"
            value={form.institution}
            onChange={(e) => setForm({ ...form, institution: e.target.value })}
            placeholder="University"
          />
          <Field
            label="City"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            placeholder="New Delhi"
          />
        </div>
        <Field
          label="Mission"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="What will your club compete for?"
        />
        <Submit busy={busy === "create-club"} label="Create club" />
      </form>
    </Modal>
  );
};

const CreateClassroomModal = ({ busy, onClose, onSubmit }) => {
  const [form, setForm] = useState({
    name: "",
    term: "",
    ai_policy: "disclose",
  });
  return (
    <Modal
      title="Create a classroom"
      subtitle="A private cohort with rubric and integrity controls."
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(form);
        }}
        className="space-y-4"
      >
        <Field
          required
          label="Classroom name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Critical Thinking — Section A"
        />
        <Field
          label="Term"
          value={form.term}
          onChange={(e) => setForm({ ...form, term: e.target.value })}
          placeholder="Fall 2026"
        />
        <label className="block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
            AI-use policy
          </span>
          <select
            value={form.ai_policy}
            onChange={(e) => setForm({ ...form, ai_policy: e.target.value })}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100"
          >
            <option value="allowed">Allowed</option>
            <option value="disclose">Allowed with disclosure</option>
            <option value="restricted">Restricted</option>
            <option value="prohibited">Prohibited</option>
          </select>
        </label>
        <Submit busy={busy === "create-classroom"} label="Create classroom" />
      </form>
    </Modal>
  );
};

const CreateAssignmentModal = ({ busy, classrooms, onClose, onSubmit }) => {
  const [classroomId, setClassroomId] = useState(classrooms[0]?.id || "");
  const [form, setForm] = useState({
    title: "",
    topic: "",
    duration_minutes: 5,
    due_at: "",
    position_policy: "random",
  });
  return (
    <Modal
      title="Publish an assignment"
      subtitle="Students receive a position, timer, rubric, and integrity policy."
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(classroomId, form);
        }}
        className="space-y-4"
      >
        <label className="block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
            Classroom
          </span>
          <select
            required
            value={classroomId}
            onChange={(e) => setClassroomId(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100"
          >
            {classrooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </label>
        <Field
          required
          label="Assignment title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Evidence under pressure"
        />
        <Field
          required
          label="Debate topic"
          value={form.topic}
          onChange={(e) => setForm({ ...form, topic: e.target.value })}
          placeholder="Should universities prohibit generative AI?"
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            type="number"
            min="1"
            max="30"
            label="Minutes"
            value={form.duration_minutes}
            onChange={(e) =>
              setForm({ ...form, duration_minutes: e.target.value })
            }
          />
          <Field
            type="datetime-local"
            label="Due date"
            value={form.due_at}
            onChange={(e) => setForm({ ...form, due_at: e.target.value })}
          />
        </div>
        <Submit
          busy={busy === "create-assignment"}
          label="Publish assignment"
        />
      </form>
    </Modal>
  );
};

const ReportModal = ({ busy, onClose, onSubmit }) => {
  const [form, setForm] = useState({
    category: "Harassment",
    match_id: "",
    reported_user_id: "",
    details: "",
  });
  return (
    <Modal
      title="Safety report"
      subtitle="Provide precise context; reports are reviewed with preserved match evidence."
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(form);
        }}
        className="space-y-4"
      >
        <label className="block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
            Category
          </span>
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100"
          >
            <option>Harassment</option>
            <option>Hate or abuse</option>
            <option>Evidence manipulation</option>
            <option>Impersonation</option>
            <option>Spam</option>
            <option>Other</option>
          </select>
        </label>
        <Field
          label="Match ID (optional)"
          value={form.match_id}
          onChange={(e) => setForm({ ...form, match_id: e.target.value })}
        />
        <Field
          label="User ID (optional)"
          value={form.reported_user_id}
          onChange={(e) =>
            setForm({ ...form, reported_user_id: e.target.value })
          }
        />
        <label className="block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
            What happened?
          </span>
          <textarea
            required
            value={form.details}
            onChange={(e) => setForm({ ...form, details: e.target.value })}
            rows="4"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-rose-500"
          />
        </label>
        <Submit busy={busy === "report"} label="Submit confidential report" />
      </form>
    </Modal>
  );
};

const JoinClassroomModal = ({ busy, onClose, onSubmit }) => {
  const [joinCode, setJoinCode] = useState("");
  return (
    <Modal
      title="Join a classroom"
      subtitle="Use the private code provided by your teacher."
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({ join_code: joinCode });
        }}
        className="space-y-4"
      >
        <Field
          required
          label="Join code"
          value={joinCode}
          onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
          placeholder="SA-A1B2C3"
        />
        <Submit busy={busy === "join-classroom"} label="Join classroom" />
      </form>
    </Modal>
  );
};

const CreateTournamentModal = ({ busy, onClose, onSubmit }) => {
  const [form, setForm] = useState({
    title: "",
    description: "",
    domain: "Open",
    format: "1v1",
    bracket_size: 8,
    starts_at: "",
  });
  return (
    <Modal
      title="Host a tournament"
      subtitle="Registration, seeding, rounds, advancement, and champion credentials are managed end to end."
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(form);
        }}
        className="space-y-4"
      >
        <Field
          required
          label="Tournament title"
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
        />
        <Field
          label="Description"
          value={form.description}
          onChange={(event) =>
            setForm({ ...form, description: event.target.value })
          }
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Domain"
            value={form.domain}
            onChange={(event) =>
              setForm({ ...form, domain: event.target.value })
            }
          />
          <Field
            type="number"
            min="2"
            max="64"
            label="Bracket size"
            value={form.bracket_size}
            onChange={(event) =>
              setForm({ ...form, bracket_size: event.target.value })
            }
          />
        </div>
        <Field
          type="datetime-local"
          label="Starts"
          value={form.starts_at}
          onChange={(event) =>
            setForm({ ...form, starts_at: event.target.value })
          }
        />
        <Submit busy={busy === "create-tournament"} label="Open registration" />
      </form>
    </Modal>
  );
};

const TeamDebateModal = ({ busy, onClose, onSubmit }) => {
  const [mode, setMode] = useState("create");
  const [topic, setTopic] = useState("");
  const [code, setCode] = useState("");
  const [side, setSide] = useState("affirmative");
  return (
    <Modal
      title="2v2 team debate"
      subtitle="Four verified speakers rotate through a durable, rubric-scored team arena."
      onClose={onClose}
    >
      <div className="mb-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => setMode("create")}
          className={`rounded-xl py-2 text-sm font-bold ${mode === "create" ? "bg-cyan-500 text-slate-950" : "bg-slate-800 text-slate-300"}`}
        >
          Create
        </button>
        <button
          onClick={() => setMode("join")}
          className={`rounded-xl py-2 text-sm font-bold ${mode === "join" ? "bg-cyan-500 text-slate-950" : "bg-slate-800 text-slate-300"}`}
        >
          Join
        </button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(
            mode,
            mode === "create" ? { topic, side } : { arena_code: code, side },
          );
        }}
        className="space-y-4"
      >
        {mode === "create" ? (
          <Field
            required
            label="Debate topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
          />
        ) : (
          <Field
            required
            label="Team arena code"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="TEAM-A1B2C3"
          />
        )}
        <label className="block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
            Preferred side
          </span>
          <select
            value={side}
            onChange={(event) => setSide(event.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm"
          >
            <option value="affirmative">Affirmative</option>
            <option value="negative">Negative</option>
          </select>
        </label>
        <Submit
          busy={busy === "team"}
          label={mode === "create" ? "Create 2v2 arena" : "Join team"}
        />
      </form>
    </Modal>
  );
};

const SubmissionModal = ({ busy, assignment, onClose, onSubmit }) => {
  const [text, setText] = useState("");
  return (
    <Modal
      title={assignment.title}
      subtitle="Submit your argument. Cited web sources are retrieved and checked before your teacher grades it."
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({ text });
        }}
        className="space-y-4"
      >
        <div className="rounded-xl bg-slate-950/60 p-3 text-sm text-slate-400">
          {assignment.topic}
        </div>
        <label className="block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
            Your argument or transcript
          </span>
          <textarea
            required
            rows="10"
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm leading-6 text-slate-100 outline-none focus:border-cyan-500"
            placeholder="Make the claim, cite the source URL, and explain the warrant…"
          />
        </label>
        <Submit busy={busy === "submission"} label="Submit for grading" />
      </form>
    </Modal>
  );
};

const AnalyticsModal = ({ classroom, onClose }) => {
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const [grading, setGrading] = useState(null);
  const loadAnalytics = useCallback(async () => {
    try {
      const response = await api.get(
        `/product/classrooms/${classroom.id}/analytics`,
      );
      setState({ loading: false, data: response.data, error: "" });
    } catch (error) {
      setState({
        loading: false,
        data: null,
        error: error.response?.data?.message || "Unable to load analytics.",
      });
    }
  }, [classroom.id]);
  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);
  const exportCsv = async () => {
    const response = await api.get(
      `/product/classrooms/${classroom.id}/analytics`,
      { params: { format: "csv" }, responseType: "blob" },
    );
    const url = URL.createObjectURL(response.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${classroom.name}-analytics.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const grade = async (row) => {
    const value = window.prompt(`Grade ${row.student} from 0 to 100`);
    if (value == null) return;
    const feedback = window.prompt("Feedback for the student") || "";
    setGrading(row.assignment);
    try {
      await api.patch(
        `/product/assignments/${row.assignment_id}/submissions/${row.id}/grade`,
        { grade: Number(value), feedback },
      );
      await loadAnalytics();
    } catch (error) {
      window.alert(error.response?.data?.message || error.message);
    } finally {
      setGrading(null);
    }
  };
  return (
    <Modal
      title={`${classroom.name} analytics`}
      subtitle="Completion, integrity, grading, and export."
      onClose={onClose}
    >
      {state.loading ? (
        <Loader2 className="mx-auto h-7 w-7 animate-spin text-cyan-400" />
      ) : state.error ? (
        <p className="text-rose-300">{state.error}</p>
      ) : (
        <div>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(state.data.summary).map(([key, value]) => (
              <div
                key={key}
                className="rounded-xl bg-slate-950 p-3 text-center"
              >
                <div className="font-black text-white">{value ?? "—"}</div>
                <div className="mt-1 text-[9px] uppercase text-slate-600">
                  {key.replaceAll("_", " ")}
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={exportCsv}
            className="mt-4 w-full rounded-xl border border-cyan-500/30 py-2.5 text-xs font-bold text-cyan-300"
          >
            Export CSV
          </button>
          <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
            {state.data.rows.map((row) => (
              <button
                key={`${row.student}-${row.assignment}`}
                onClick={() => grade(row)}
                disabled={grading === row.assignment}
                className="flex w-full items-center justify-between rounded-xl bg-slate-950/60 p-3 text-left text-xs"
              >
                <span>
                  <strong className="text-slate-200">{row.student}</strong>
                  <br />
                  <span className="text-slate-500">
                    {row.assignment} · integrity {row.integrity_risk}
                  </span>
                </span>
                <span className="font-black text-cyan-300">
                  {row.grade ?? "Grade"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
};

const ModerationModal = ({ busy, report, onClose, onSubmit }) => {
  const [form, setForm] = useState({
    outcome: "actioned",
    action_type: "warning",
    duration_days: 7,
    reason: report.details || report.category,
  });
  return (
    <Modal
      title="Resolve safety report"
      subtitle="Issue an enforceable account action or dismiss the report with an audit trail."
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(form);
        }}
        className="space-y-4"
      >
        <div className="rounded-xl bg-slate-950 p-3 text-sm text-slate-400">
          {report.details || report.category}
        </div>
        <label className="block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
            Outcome
          </span>
          <select
            value={form.outcome}
            onChange={(event) =>
              setForm({ ...form, outcome: event.target.value })
            }
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3"
          >
            <option value="actioned">Take action</option>
            <option value="dismissed">Dismiss report</option>
          </select>
        </label>
        {form.outcome === "actioned" && (
          <>
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Action
              </span>
              <select
                value={form.action_type}
                onChange={(event) =>
                  setForm({ ...form, action_type: event.target.value })
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3"
              >
                <option value="warning">Warning</option>
                <option value="suspension">Temporary suspension</option>
                <option value="ban">Permanent ban</option>
              </select>
            </label>
            {form.action_type === "suspension" && (
              <Field
                type="number"
                min="1"
                max="90"
                label="Duration (days)"
                value={form.duration_days}
                onChange={(event) =>
                  setForm({ ...form, duration_days: event.target.value })
                }
              />
            )}
            <Field
              required
              label="Reason"
              value={form.reason}
              onChange={(event) =>
                setForm({ ...form, reason: event.target.value })
              }
            />
          </>
        )}
        <Submit busy={busy === "moderate"} label="Resolve report" />
      </form>
    </Modal>
  );
};

const Submit = ({ busy, label }) => (
  <button
    disabled={busy}
    className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 py-3.5 text-sm font-black text-slate-950 disabled:opacity-60"
  >
    {busy ? (
      <Loader2 className="h-4 w-4 animate-spin" />
    ) : (
      <Check className="h-4 w-4" />
    )}
    {label}
  </button>
);

export default ArenaOS;
