import { Shield, Activity, BarChart3, Users, Clock, ArrowRight, User } from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { getTopicDomain } from '../lib/domainUtils';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import ProfileModal from './ProfileModal';

const Dashboard = ({ user }) => {
  const navigate = useNavigate();
  const [recentMatches, setRecentMatches] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dashboard_matches')) || []; } catch { return []; }
  });
  const [stats, setStats] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dashboard_stats')) || { elo: 1000, totalMatches: 0 }; } catch { return { elo: 1000, totalMatches: 0 }; }
  });
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [network, setNetwork] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const hasPending = recentMatches.some(m => m.status === 'pending_votes');
    if (!hasPending) return;

    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, [recentMatches]);

  const formatTimeLeft = (createdAt) => {
    const end = new Date(createdAt).getTime() + (24 * 60 * 60 * 1000);
    const now = currentTime.getTime();
    const diff = end - now;
    if (diff <= 0) return { expired: true, text: "00:00:00" };

    const h = Math.floor(diff / (1000 * 60 * 60));
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((diff % (1000 * 60)) / 1000);
    return {
      expired: false,
      text: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    };
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      try {
        // Fetch recent matches
        const { data: matchData, error: matchError } = await supabase
          .from('matches')
          .select('*')
          .or(`critic_id.eq.${user.id},defender_id.eq.${user.id}`)
          .order('created_at', { ascending: false })
          .limit(10);

        if (matchError) {
          console.error("[Dashboard] Match Fetch Error:", matchError.message, matchError.details);
          throw matchError;
        }
        setRecentMatches(matchData || []);

        // 2. Fetch unified stats via RPC
        const { data: unifiedStats, error: rpcError } = await supabase.rpc('get_user_stats', {
          p_user_id: user.id
        });

        if (rpcError) {
          console.error("[Dashboard] Supabase RPC Error:", rpcError.message, rpcError.details);
          throw rpcError;
        }

        const newStats = {
          elo: unifiedStats?.elo_rating ?? 1000,
          totalMatches: unifiedStats?.total_matches ?? 0,
          winRate: unifiedStats?.win_rate ?? 0
        };
        setStats(newStats);
        localStorage.setItem('dashboard_stats', JSON.stringify(newStats));
        localStorage.setItem('dashboard_matches', JSON.stringify(matchData || []));
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      }
    };

    fetchData();

    const fetchNetwork = async () => {
      if (!user) return;
      // 1. Get who I follow
      const { data: follows } = await supabase.from('user_follows').select('followed_id').eq('follower_id', user.id);
      if (!follows || follows.length === 0) {
        setNetwork([]);
        return;
      }
      const followingIds = follows.map(f => f.followed_id);

      // 2. Get their profile data
      const { data: profiles } = await supabase.from('profiles').select('*').in('id', followingIds);

      // 3. Check if they are in an active match (LIVE)
      const { data: activeMatches } = await supabase.from('matches').select('critic_id, defender_id').eq('status', 'active');

      // 4. Combine and set state
      if (profiles) {
        const networkData = profiles.map(profile => {
          const isLive = activeMatches?.some(m => m.critic_id === profile.id || m.defender_id === profile.id);
          return { ...profile, isLive };
        });
        setNetwork(networkData);
      }
    };
    fetchNetwork();
  }, [user]);

  const getRank = (rating) => {
    if (rating < 1050) return { name: 'Novice', color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30' };
    if (rating < 1200) return { name: 'Thinker', color: 'text-slate-300', bg: 'bg-slate-300/10', border: 'border-slate-300/30' };
    if (rating < 1500) return { name: 'Scholar', color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/30' };
    if (rating < 1800) return { name: 'Philosopher', color: 'text-fuchsia-400', bg: 'bg-fuchsia-400/10', border: 'border-fuchsia-400/30' };
    return { name: 'Oracle', color: 'text-cyan-400', bg: 'bg-cyan-400/10', border: 'border-cyan-400/30' };
  };

  const averageStats = useMemo(() => {
    if (!recentMatches || recentMatches.length === 0 || !user) return { logic: 0, facts: 0, relevance: 0 };

    let totalLogic = 0, totalFacts = 0, totalRelevance = 0, count = 0;

    recentMatches.forEach(match => {
      if (match.ai_scores) {
        if (match.critic_id === user.id && match.ai_scores.critic) {
          totalLogic += match.ai_scores.critic.logic || 0;
          totalFacts += match.ai_scores.critic.facts || 0;
          totalRelevance += match.ai_scores.critic.relevance || 0;
          count++;
        } else if (match.defender_id === user.id && match.ai_scores.defender) {
          totalLogic += match.ai_scores.defender.logic || 0;
          totalFacts += match.ai_scores.defender.facts || 0;
          totalRelevance += match.ai_scores.defender.relevance || 0;
          count++;
        }
      }
    });

    if (count === 0) return { logic: 0, facts: 0, relevance: 0 };
    return {
      logic: totalLogic / count,
      facts: totalFacts / count,
      relevance: totalRelevance / count,
    };
  }, [recentMatches, user]);

  const radarData = useMemo(() => [
    { subject: 'Logic', score: parseFloat(averageStats.logic.toFixed(1)), fullMark: 10 },
    { subject: 'Facts', score: parseFloat(averageStats.facts.toFixed(1)), fullMark: 10 },
    { subject: 'Relevance', score: parseFloat(averageStats.relevance.toFixed(1)), fullMark: 10 },
  ], [averageStats]);

  const memoizedRadarChart = useMemo(() => (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
        <PolarGrid stroke="#334155" />
        <PolarAngleAxis 
          dataKey="subject" 
          tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 500 }} 
        />
        <PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} />
        <Radar 
          name="Cognitive Profile" 
          dataKey="score" 
          stroke="#06b6d4" 
          fill="#06b6d4" 
          fillOpacity={0.5} 
          isAnimationActive={false} 
        />
      </RadarChart>
    </ResponsiveContainer>
  ), [radarData]);

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Debater';
  const displayEmail = user?.email || '';

  return (
    <div className="bg-slate-950 text-slate-200 min-h-[calc(100vh-64px)] overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 flex flex-col lg:flex-row gap-8 lg:h-[calc(100vh-64px)] lg:overflow-hidden">

        {/* ── LEFT COLUMN: Fixed ── */}
        <div className="w-full lg:w-[380px] shrink-0 flex flex-col gap-5 overflow-y-auto pb-6 no-scrollbar">

          {/* Mini User ID Card */}
          <div 
            onClick={() => setIsProfileModalOpen(true)}
            className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center gap-4 cursor-pointer hover:border-slate-700 transition"
          >
            <div className="h-14 w-14 rounded-full bg-indigo-600/30 border-2 border-indigo-500/50 flex items-center justify-center shrink-0">
              <User className="h-7 w-7 text-indigo-300" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-slate-100 text-lg truncate">{displayName}</p>
              <p className="text-sm text-slate-400 truncate">{displayEmail}</p>
              <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-widest text-cyan-400 bg-cyan-950/40 border border-cyan-500/20 px-2 py-0.5 rounded">
                Arena Member
              </span>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 text-cyan-400 mb-1">
                <Activity className="h-4 w-4" />
                <h3 className="font-semibold uppercase tracking-wider text-xs">Elo Rating</h3>
              </div>
              <p className="text-3xl font-bold text-slate-100">{stats.elo}</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 text-emerald-400 mb-1">
                <Users className="h-4 w-4" />
                <h3 className="font-semibold uppercase tracking-wider text-xs">Matches</h3>
              </div>
              <p className="text-3xl font-bold text-slate-100">{stats.totalMatches}</p>
            </div>
          </div>

          {/* Cognitive Profile Radar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col">
            <h2 className="text-lg font-bold text-slate-100 mb-4 border-b border-slate-800 pb-3 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-cyan-400" />
              Cognitive Profile
            </h2>
            <div className="h-64 w-full mt-4">
              {memoizedRadarChart}
            </div>
            {averageStats.logic === 0 && (
              <p className="text-center text-xs text-slate-500 mt-2">Play more matches to build your profile.</p>
            )}
          </div>

          {/* Your Network Widget */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl mt-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <Users className="h-6 w-6 text-cyan-400" /> Your Network
              </h3>
              <span className="text-sm text-slate-400 font-medium">{network.length} Following</span>
            </div>

            {network.length === 0 ? (
              <div className="text-center p-6 bg-slate-950/50 rounded-xl border border-slate-800 border-dashed">
                <p className="text-slate-400 italic">You aren't following anyone yet. Visit the Explore page to find debaters!</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {network.map(user => {
                  const r = getRank(user.elo_rating || 1000);
                  // Fallback for missing auth emails in public profiles
                  const initial = (user.username || user.email || 'U').charAt(0).toUpperCase();
                  const displayName = user.username || (user.email ? user.email.split('@')[0] : 'Arena Member');

                  return (
                    <div key={user.id} className="flex items-center justify-between p-3 bg-slate-950/50 hover:bg-slate-800 transition-colors border border-slate-800 rounded-xl group cursor-pointer" onClick={() => {
                        setSelectedProfile(user);
                        setIsProfileModalOpen(true);
                    }}>
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 bg-slate-800 rounded-full flex items-center justify-center font-bold text-cyan-400 border border-slate-700 shadow-inner">
                          {initial}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-200">{displayName}</p>
                          <p className={`text-[10px] font-bold uppercase tracking-wider ${r.color}`}>{r.name} • {user.elo_rating || 1000} ELO</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {user.isLive && (
                          <span className="flex items-center gap-1 text-xs font-bold text-rose-500 animate-pulse bg-rose-500/10 px-2 py-1 rounded-full border border-rose-500/20">
                            <span className="h-1.5 w-1.5 bg-rose-500 rounded-full"></span> LIVE
                          </span>
                        )}
                        <button className="p-2 bg-slate-800/80 group-hover:bg-cyan-500/20 text-slate-400 group-hover:text-cyan-400 rounded-lg transition-all cursor-pointer">
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN: Scrollable ── */}
        <div className="flex-1 flex flex-col gap-5 overflow-y-auto pb-6 pr-1 no-scrollbar">

          {/* Page header */}
          <header>
            <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
              <Shield className="h-8 w-8 text-indigo-400" />
              Debater Profile
            </h1>
            <p className="text-slate-400 mt-1 text-sm">Welcome back to The Socratic Arena.</p>
          </header>

          {/* Recent Debates */}
          <div>
            <h2 className="text-xl font-bold text-slate-100 mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-indigo-400" />
              Recent Debates
            </h2>

            <div className="space-y-4">
              {recentMatches.length > 0 ? (
                recentMatches.map((match) => (
                  <div key={match.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex flex-col gap-2">
                        <span className={`px-2 py-1 rounded text-xs font-semibold uppercase tracking-wider w-fit ${match.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                            match.status === 'pending_votes' ? 'bg-purple-500/20 text-purple-400' :
                              match.status === 'abandoned' ? 'bg-red-500/20 text-red-400' :
                                'bg-yellow-500/20 text-yellow-400'
                          }`}>
                          {match.status === 'pending_votes' ? 'In Deliberation' : match.status}
                        </span>
                        <span className={`shrink-0 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border w-fit ${getTopicDomain(match.topic_title || match.topic).color}`}>
                          {getTopicDomain(match.topic_title || match.topic).domain}
                        </span>
                      </div>
                      {match.status === 'pending_votes' ? (
                        <span className="text-sm font-mono text-purple-400 tracking-widest font-bold drop-shadow-[0_0_5px_rgba(168,85,247,0.5)]">
                          {formatTimeLeft(match.created_at).expired ? (
                            <span className="text-red-400 animate-pulse text-xs uppercase">Resolving...</span>
                          ) : (
                            `⏳ ${formatTimeLeft(match.created_at).text}`
                          )}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">
                          {new Date(match.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-slate-200 mb-4 line-clamp-2">
                      {match.topic_title || match.topic || 'Custom Debate'}
                    </h3>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">
                        You played as{' '}
                        <span className={`font-semibold ${match.critic_id === user?.id ? 'text-rose-300' : 'text-indigo-300'}`}>
                          {match.critic_id === user?.id ? 'Critic' : 'Defender'}
                        </span>
                      </span>
                      <button
                        onClick={() => navigate(`/review/${match.id}`)}
                        className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 font-semibold px-4 py-2 rounded-lg transition-colors border border-slate-700 hover:border-cyan-500/50 text-sm"
                      >
                        View Report Card <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
                  <p className="text-slate-400">No recent debates found. Go enter the arena!</p>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      <ProfileModal 
        isOpen={isProfileModalOpen}
        onClose={() => {
          setIsProfileModalOpen(false);
          setTimeout(() => setSelectedProfile(null), 300);
        }}
        viewUser={selectedProfile}
        currentUser={selectedProfile ? null : user}
        currentUserId={user?.id}
      />
    </div>
  );
};

export default Dashboard;
