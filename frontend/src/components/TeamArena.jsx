import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Send,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";
import api from "../services/api";

const TeamArena = () => {
  const { debateId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await api.get(`/product/team-debates/${debateId}`);
      setData(response.data);
      setError("");
    } catch (requestError) {
      setError(
        requestError.response?.data?.message || "Unable to load team arena.",
      );
    } finally {
      setLoading(false);
    }
  }, [debateId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [load]);
  const profiles = useMemo(
    () =>
      Object.fromEntries(
        (data?.profiles || []).map((profile) => [profile.id, profile]),
      ),
    [data?.profiles],
  );
  const myTurn =
    data?.debate?.status === "active" &&
    data.me?.side === data.debate.active_side &&
    Number(data.me?.position) === Number(data.debate.active_position);

  const submit = async (event) => {
    event.preventDefault();
    if (!text.trim() || !myTurn) return;
    setBusy(true);
    try {
      await api.post(`/product/team-debates/${debateId}/turns`, { text });
      setText("");
      await load();
    } catch (requestError) {
      setError(
        requestError.response?.data?.message || "Unable to submit turn.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading)
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  if (!data)
    return (
      <div className="min-h-screen bg-slate-950 p-8 text-rose-300">{error}</div>
    );

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-slate-100 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <button
          onClick={() => navigate("/arena-os")}
          className="mb-5 flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Arena OS
        </button>
        <header className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-400">
                <Users className="h-4 w-4" /> 2v2 team arena
              </div>
              <h1 className="mt-2 text-2xl font-black">{data.debate.topic}</h1>
              <p className="mt-2 font-mono text-xs text-slate-500">
                Invite code: {data.debate.arena_code}
              </p>
            </div>
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-black uppercase text-cyan-300">
              {data.debate.status}
            </span>
          </div>
        </header>
        {error && (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
            {error}
          </div>
        )}
        <div className="mt-5 grid gap-5 lg:grid-cols-[260px_1fr_260px]">
          {["affirmative", "negative"].map((side, sideIndex) => (
            <section
              key={side}
              className={`rounded-2xl border p-4 ${sideIndex === 0 ? "border-cyan-500/30 bg-cyan-500/5" : "border-rose-500/30 bg-rose-500/5"} ${sideIndex === 1 ? "lg:order-3" : ""}`}
            >
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                {side}
              </h2>
              <div className="mt-4 space-y-3">
                {[1, 2].map((position) => {
                  const member = data.members.find(
                    (item) =>
                      item.side === side && Number(item.position) === position,
                  );
                  return (
                    <div
                      key={position}
                      className="rounded-xl bg-slate-950/60 p-3"
                    >
                      <div className="text-[10px] uppercase text-slate-600">
                        Speaker {position}
                      </div>
                      <div className="mt-1 font-bold text-slate-200">
                        {member
                          ? profiles[member.user_id]?.username ||
                            member.user_id.slice(0, 8)
                          : "Waiting…"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 lg:order-2">
            <div className="h-[470px] space-y-3 overflow-y-auto pr-1">
              {data.turns.length ? (
                data.turns.map((turn) => (
                  <article
                    key={turn.id}
                    className={`rounded-xl p-4 ${turn.side === "affirmative" ? "bg-cyan-500/10" : "bg-rose-500/10"}`}
                  >
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-wider text-slate-500">
                      <span>
                        {turn.side} · speaker {turn.position}
                      </span>
                      <span>Turn {turn.turn_number}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">
                      {turn.text}
                    </p>
                    {turn.evidence?.claims_requiring_sources > 0 && (
                      <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                        <ShieldCheck className="h-4 w-4" />{" "}
                        {turn.evidence.verified_claims}/
                        {turn.evidence.claims_requiring_sources} empirical
                        claims supported by cited sources
                      </div>
                    )}
                  </article>
                ))
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-600">
                  Waiting for four speakers and the opening turn.
                </div>
              )}
            </div>
            {data.debate.status === "completed" ? (
              <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-amber-500/10 p-4 font-black text-amber-300">
                <Trophy className="h-5 w-5" />{" "}
                {data.debate.winning_side === "draw"
                  ? "The panel scored a draw"
                  : `${data.debate.winning_side} wins`}
              </div>
            ) : (
              <form onSubmit={submit} className="mt-4">
                <textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  disabled={!myTurn || busy}
                  rows="4"
                  placeholder={
                    data.debate.status === "waiting"
                      ? "Waiting for all four team members…"
                      : myTurn
                        ? "Make your team’s next argument…"
                        : `Waiting for ${data.debate.active_side} speaker ${data.debate.active_position}…`
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm outline-none focus:border-cyan-500 disabled:opacity-50"
                />
                <button
                  disabled={!myTurn || busy || !text.trim()}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-black text-slate-950 disabled:opacity-40"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}{" "}
                  Submit team turn
                </button>
              </form>
            )}
          </section>
        </div>
      </div>
    </main>
  );
};

export default TeamArena;
