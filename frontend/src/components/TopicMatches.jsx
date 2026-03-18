import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { ArrowLeft, Vote, Activity, Layers, Play, Clock } from 'lucide-react';

const TopicMatches = ({ socket }) => {
  const { topicTitle } = useParams();
  const navigate = useNavigate();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  const formatTimeLeft = (createdAt) => {
    const end = new Date(createdAt).getTime() + (24 * 60 * 60 * 1000);
    const now = currentTime.getTime();
    const diff = end - now;
    if (diff <= 0) return { expired: true, text: "00:00:00" };
    const h = Math.floor(diff / (1000 * 60 * 60));
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((diff % (1000 * 60)) / 1000);
    return { expired: false, text: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` };
  };

  const decodedTitle = decodeURIComponent(topicTitle);

  useEffect(() => {
    const fetchMatches = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('matches')
          .select('*')
          .eq('topic_title', decodedTitle)
          .in('status', ['active', 'pending_votes'])
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        const matchesData = data || [];
        
        // Fetch profiles for all matches
        const userIds = new Set();
        matchesData.forEach(m => {
          if (m.critic_id) userIds.add(m.critic_id);
          if (m.defender_id) userIds.add(m.defender_id);
        });

        if (userIds.size > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username')
            .in('id', Array.from(userIds));
          
          const profileMap = {};
          profiles?.forEach(p => {
            profileMap[p.id] = p.username;
          });

          matchesData.forEach(m => {
            m.critic_name = profileMap[m.critic_id] || 'Critic';
            m.defender_name = profileMap[m.defender_id] || 'Defender';
          });
        }

        setMatches(matchesData);
      } catch (err) {
        console.error('Error fetching matches for topic:', err);
      } finally {
        setLoading(false);
      }
    };

    if (decodedTitle) fetchMatches();

    // Optional: Real-time listener for match status changes in this specific topic
    const channel = supabase
      .channel(`topic_matches_${decodedTitle}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
          filter: `topic_title=eq.${decodedTitle}`,
        },
        () => fetchMatches()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [decodedTitle]);

  // Timer tick for countdown clocks
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const [summaries, setSummaries] = useState({});

  const liveMatches = matches.filter(m => m.status === 'active');
  const deliberatingMatches = matches.filter(m => m.status === 'pending_votes');

  useEffect(() => {
    const fetchMissingSummaries = async () => {
      const needsSummary = deliberatingMatches.filter(m => !m.ai_scores?.overall_summary && m.transcript?.length > 0 && !summaries[m.id]);
      
      for (const m of needsSummary) {
        try {
          const res = await fetch(`http://localhost:5000/api/matches/${m.id}/summary`, { method: 'POST' });
          if (res.ok) {
            const data = await res.json();
            if (data.success) {
              setSummaries(prev => ({ ...prev, [m.id]: data.summary }));
            }
          }
        } catch (err) {
          console.error("Failed to fetch AI summary for", m.id, err);
        }
      }
    };
    
    if (deliberatingMatches.length > 0 && !loading) {
      fetchMissingSummaries();
    }
  }, [matches, deliberatingMatches, summaries, loading]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0b0f19]">
        <div className="text-cyan-400 animate-pulse font-medium text-lg flex items-center gap-3">
          <Activity className="animate-spin h-6 w-6" />
          Loading Topic Arenas...
        </div>
      </div>
    );
  }

  const getDebateCrux = (match) => {
    if (match.status === 'active') {
       return 'Live debate in progress. Spectate to see the action!';
    }
    if (match.ai_scores?.overall_summary) {
      return match.ai_scores.overall_summary;
    }
    if (summaries[match.id]) {
      return summaries[match.id];
    }
    if (!match.transcript || match.transcript.length === 0) {
      return 'No transcript available.';
    }
    return 'Analyzing debate for summary...';
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#0b0f19] text-slate-200 p-8">
      <div className="max-w-6xl mx-auto w-full">
        <button 
          onClick={() => navigate('/explore')}
          className="flex items-center gap-2 text-slate-400 hover:text-cyan-400 transition-colors mb-8 group"
        >
          <ArrowLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
          Back to Explore
        </button>

        <header className="mb-12 border-b border-slate-800 pb-8">
          <div className="flex items-center gap-4 mb-3">
            <div className="p-3 bg-cyan-500/10 rounded-2xl border border-cyan-500/20">
              <Layers className="h-8 w-8 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-4xl font-extrabold text-slate-100 tracking-tight leading-none">{decodedTitle}</h1>
              <p className="text-slate-400 text-lg mt-2 font-medium">Topic Headquarters • {matches.length} matches total</p>
            </div>
          </div>
        </header>

        {/* Combined View for Uniformity */}
        <div className="space-y-12">
          {liveMatches.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-slate-100 mb-6 flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
                LIVE DEBATES
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {liveMatches.map(match => (
                  <div key={match.id} className="bg-[#0f172a]/80 backdrop-blur-md border border-red-500/20 rounded-2xl p-6 hover:border-red-500/40 transition-all hover:-translate-y-1 shadow-2xl flex flex-col h-[220px]">
                    <div className="flex justify-between items-start mb-4">
                       <div className="flex flex-col gap-2">
                           <span className="text-xs font-black uppercase tracking-widest text-red-400 bg-red-400/10 px-2 py-1 rounded border border-red-400/20">Active Arena</span>
                           <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                               <Clock className="w-3 h-3" />
                               {new Date(match.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                           </span>
                       </div>
                       <Activity className="h-4 w-4 text-red-500 animate-pulse mt-1" />
                    </div>
                    <div className="mb-4">
                        <div className="text-sm font-semibold text-slate-300 flex items-center justify-between mb-2">
                           <span className="text-rose-400 truncate max-w-[40%]">{match.critic_name || 'Critic'}</span>
                           <span className="text-slate-500 text-[10px] uppercase font-black tracking-widest mx-2">VS</span>
                           <span className="text-cyan-400 truncate max-w-[40%] text-right">{match.defender_name || 'Defender'}</span>
                        </div>
                        <p className="text-xs text-slate-400 line-clamp-2 italic">
                            "{getDebateCrux(match)}"
                        </p>
                    </div>
                    <div className="mt-auto">
                      <button 
                        onClick={() => navigate(`/arena/${match.id}`, { state: { roomId: match.id, topic: match.topic_title, isSpectator: true } })}
                        className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-red-500/20 flex items-center justify-center gap-2"
                      >
                        <Play className="h-4 w-4 fill-current" />
                        Spectate Live
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {deliberatingMatches.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-slate-100 mb-6 flex items-center gap-3">
                <Vote className="h-5 w-5 text-purple-500" />
                VOTING SESSIONS
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {deliberatingMatches.map(match => (
                  <div key={match.id} className="bg-[#0f172a]/80 backdrop-blur-md border border-purple-500/20 rounded-2xl p-6 hover:border-purple-500/40 transition-all hover:-translate-y-1 shadow-2xl flex flex-col h-[220px]">
                    <div className="flex justify-between items-start mb-4">
                       <div className="flex flex-col gap-2">
                           <span className="text-xs font-black uppercase tracking-widest text-purple-400 bg-purple-400/10 px-2 py-1 rounded border border-purple-400/20 w-fit">Awaiting Verdict</span>
                           {formatTimeLeft(match.created_at).expired ? (
                             <span className="text-red-400 text-[11px] font-bold animate-pulse tracking-wide flex items-center gap-1">
                               <Clock className="w-3 h-3" />
                               RESOLVING...
                             </span>
                           ) : (
                             <span className="text-purple-300 text-sm font-mono font-bold tracking-widest flex items-center gap-1 drop-shadow-[0_0_5px_rgba(168,85,247,0.5)]">
                               <Clock className="w-3 h-3" />
                               ⏳ {formatTimeLeft(match.created_at).text}
                             </span>
                           )}
                       </div>
                       <Vote className="h-4 w-4 text-purple-500 mt-1" />
                    </div>
                    <div className="mb-4">
                        <div className="text-sm font-semibold text-slate-300 flex items-center justify-between mb-2">
                           <span className="text-rose-400 truncate max-w-[40%]">{match.critic_name || 'Critic'}</span>
                           <span className="text-slate-500 text-[10px] uppercase font-black tracking-widest mx-2">VS</span>
                           <span className="text-cyan-400 truncate max-w-[40%] text-right">{match.defender_name || 'Defender'}</span>
                        </div>
                        <p className="text-xs text-slate-400 line-clamp-2 italic">
                            "{getDebateCrux(match)}"
                        </p>
                    </div>
                    <div className="mt-auto">
                      <button 
                        onClick={() => navigate(`/review/${match.id}`)}
                        className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2"
                      >
                        Enter to Vote
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {matches.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="p-6 bg-slate-900 rounded-full border border-slate-800 mb-6">
                <Layers className="h-12 w-12 text-slate-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-400">All quiet in the {decodedTitle} arena.</h3>
              <p className="text-slate-500 mt-2">No active debates. Why not start one yourself?</p>
              <button 
                onClick={() => navigate('/explore')}
                className="mt-6 text-cyan-400 hover:text-cyan-300 font-bold underline"
              >
                Start a New Debate
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TopicMatches;
