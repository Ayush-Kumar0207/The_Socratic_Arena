import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Loader2, Play, Trophy } from "lucide-react";
import api from "../services/api";

const TournamentBracket = ({ user }) => {
  const { tournamentId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await api.get(
        `/product/tournaments/${tournamentId}/bracket`,
      );
      setData(response.data);
      setError("");
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "Unable to load tournament bracket.",
      );
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    load();
  }, [load]);
  const profiles = useMemo(
    () =>
      Object.fromEntries(
        (data?.profiles || []).map((profile) => [profile.id, profile]),
      ),
    [data?.profiles],
  );
  const rounds = useMemo(
    () =>
      Object.groupBy
        ? Object.groupBy(
            data?.fixtures || [],
            (fixture) => fixture.round_number,
          )
        : (data?.fixtures || []).reduce(
            (result, fixture) => ({
              ...result,
              [fixture.round_number]: [
                ...(result[fixture.round_number] || []),
                fixture,
              ],
            }),
            {},
          ),
    [data?.fixtures],
  );
  const canManage = data?.tournament?.owner_id === user?.id;

  const start = async () => {
    setBusy("start");
    try {
      await api.post(`/product/tournaments/${tournamentId}/start`);
      await load();
    } catch (requestError) {
      setError(
        requestError.response?.data?.message || "Unable to seed bracket.",
      );
    } finally {
      setBusy("");
    }
  };

  const report = async (fixture, winnerId) => {
    setBusy(fixture.id);
    try {
      await api.post(
        `/product/tournaments/${tournamentId}/fixtures/${fixture.id}/result`,
        {
          winner_id: winnerId,
          score_player1: winnerId === fixture.player1_id ? 1 : 0,
          score_player2: winnerId === fixture.player2_id ? 1 : 0,
        },
      );
      await load();
    } catch (requestError) {
      setError(
        requestError.response?.data?.message || "Unable to certify result.",
      );
    } finally {
      setBusy("");
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
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <button
          onClick={() => navigate("/arena-os")}
          className="mb-6 flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Arena OS
        </button>
        <header className="rounded-3xl border border-slate-800 bg-slate-900/70 p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.2em] text-amber-400">
                Verified competition
              </div>
              <h1 className="mt-2 text-3xl font-black">
                {data.tournament.title}
              </h1>
              <p className="mt-2 text-slate-400">
                {data.tournament.description}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-black uppercase text-cyan-300">
                {data.tournament.status}
              </span>
              {canManage && data.tournament.status === "registration" && (
                <button
                  onClick={start}
                  disabled={busy === "start"}
                  className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50"
                >
                  {busy === "start" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}{" "}
                  Seed & start
                </button>
              )}
            </div>
          </div>
          {data.tournament.champion_user_id && (
            <div className="mt-6 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200">
              <Trophy className="h-5 w-5" />
              <strong>
                {profiles[data.tournament.champion_user_id]?.username ||
                  "Champion"}
              </strong>{" "}
              won the tournament and received a verifiable credential.
            </div>
          )}
        </header>
        {error && (
          <div className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
            {error}
          </div>
        )}
        <div className="mt-6 flex gap-5 overflow-x-auto pb-5">
          {Object.entries(rounds).map(([round, fixtures]) => (
            <section
              key={round}
              className="w-80 shrink-0 rounded-2xl border border-slate-800 bg-slate-900/50 p-4"
            >
              <h2 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                Round {round}
              </h2>
              <div className="space-y-4">
                {fixtures.map((fixture) => (
                  <div
                    key={fixture.id}
                    className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"
                  >
                    <div className="space-y-2">
                      {[fixture.player1_id, fixture.player2_id].map(
                        (playerId, index) => (
                          <button
                            key={playerId || `empty-${index}`}
                            disabled={
                              !canManage ||
                              fixture.status !== "ready" ||
                              !playerId ||
                              Boolean(busy)
                            }
                            onClick={() => report(fixture, playerId)}
                            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${fixture.winner_id === playerId ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-900 text-slate-300"} disabled:cursor-default`}
                          >
                            <span>
                              {playerId
                                ? profiles[playerId]?.username ||
                                  playerId.slice(0, 8)
                                : "Bye"}
                            </span>
                            {fixture.winner_id === playerId && (
                              <CheckCircle2 className="h-4 w-4" />
                            )}
                          </button>
                        ),
                      )}
                    </div>
                    <div className="mt-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-600">
                      {busy === fixture.id ? "Saving result…" : fixture.status}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
};

export default TournamentBracket;
