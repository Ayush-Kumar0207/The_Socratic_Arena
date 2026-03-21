import { Compass, Hash, Trophy, Flame, Users, Vote, Activity, Search, X, LayoutGrid, Layers, ChevronDown, ChevronUp, Bookmark, BookmarkCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { getTopicDomain } from '../lib/domainUtils';
import { RankBadge } from '../lib/rankUtils';
import ProfileModal from './ProfileModal';
import React, { useEffect, useState } from 'react';

const Explore = ({ socket, user }) => {
  const navigate = useNavigate();
  const [topics, setTopics] = useState(() => JSON.parse(localStorage.getItem('explore_topics')) || []);
  const [deliberatingMatches, setDeliberatingMatches] = useState(() => JSON.parse(localStorage.getItem('explore_deliberating')) || []);
  const [completedMatches, setCompletedMatches] = useState(() => JSON.parse(localStorage.getItem('explore_completed')) || []);
  const [liveMatches, setLiveMatches] = useState(() => JSON.parse(localStorage.getItem('explore_live')) || []);
  const [activeUserCounts, setActiveUserCounts] = useState(() => JSON.parse(localStorage.getItem('explore_counts')) || {});
  const [leaderboard, setLeaderboard] = useState(() => JSON.parse(localStorage.getItem('explore_leaderboard')) || []);
  const [searchQuery, setSearchQuery] = useState('');
  const [deliberationSearchQuery, setDeliberationSearchQuery] = useState('');
  const [completedSearchQuery, setCompletedSearchQuery] = useState('');
  const [isSearchingDeliberation, setIsSearchingDeliberation] = useState(false);
  const [isSearchingCompleted, setIsSearchingCompleted] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [vipAnnouncement, setVipAnnouncement] = useState(null);
  const searchTimeoutRef = React.useRef(null);
  const [isCreating, setIsCreating] = useState(false);
  const [topicFeedback, setTopicFeedback] = useState(null);
  const [deliberationFeedback, setDeliberationFeedback] = useState(null);
  const [completedFeedback, setCompletedFeedback] = useState(null);
  const [topicTotals, setTopicTotals] = useState(() => JSON.parse(localStorage.getItem('explore_totals')) || {});
  const [currentTime, setCurrentTime] = useState(new Date());
  const [followedIds, setFollowedIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('explore_followed_ids')) || []; } catch { return []; }
  });
  const [searchId, setSearchId] = useState('');
  const [searchError, setSearchError] = useState('');

  const handleSearchUser = async (e) => {
    e.preventDefault();
    setSearchError('');
    if (!searchId.trim()) return;

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', searchId.trim())
        .single();

    if (data) {
        setSelectedProfile(data);
        setIsProfileModalOpen(true);
        setSearchId('');
    } else {
        setSearchError('User not found. Check the Socratic ID.');
    }
  };

  useEffect(() => {
    const fetchTopics = async () => {
      const { data, error } = await supabase
        .from('topics')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error("[Explore] Topics Fetch Error:", error.message, error.details);
      }
      if (!error && data) {
        setTopics(data);
        localStorage.setItem('explore_topics', JSON.stringify(data));
      }
    };

    const fetchLeaderboard = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('elo_rating', { ascending: false })
        .limit(5);

      if (error) {
        console.error("[Explore] Leaderboard Fetch Error:", error.message, error.details);
      }
      if (!error && data) {
        setLeaderboard(data);
        localStorage.setItem('explore_leaderboard', JSON.stringify(data));
      }
    };

    const fetchDeliberating = async () => {
      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .eq('status', 'pending_votes')
        .order('created_at', { ascending: false });
        
      if (error) {
        console.error("[Explore] Deliberating Fetch Error:", error.message, error.details);
      }
      if (!error && data) {
        setDeliberatingMatches(data);
        localStorage.setItem('explore_deliberating', JSON.stringify(data));
      }
      
      const { data: compData, error: compErr } = await supabase
        .from('matches')
        .select('*')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(6);
        
      if (!compErr && compData) {
        setCompletedMatches(compData);
        localStorage.setItem('explore_completed', JSON.stringify(compData));
      }
    };

    const fetchLive = async () => {
      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) {
        console.error("[Explore] Live Matches Fetch Error:", error.message, error.details);
      }
      if (!error && data) {
        setLiveMatches(data);
        localStorage.setItem('explore_live', JSON.stringify(data));

        // Calculate player density per topic title (2 players per active match)
        const counts = {};
        data.forEach(match => {
          const topic = match.topic_title;
          if (topic) counts[topic] = (counts[topic] || 0) + 2;
        });
        setActiveUserCounts(counts);
        localStorage.setItem('explore_counts', JSON.stringify(counts));
      }
    };

    const fetchTopicTotals = async () => {
      try {
        const { data, error } = await supabase
          .from('matches')
          .select('topic_title, status')
          .in('status', ['active', 'completed', 'pending_votes']);
        
        if (error) throw error;
        
        const totals = {};
        data?.forEach(m => {
          const topic = m.topic_title || 'Unknown';
          totals[topic] = (totals[topic] || 0) + 1;
        });
        setTopicTotals(totals);
        localStorage.setItem('explore_totals', JSON.stringify(totals));
      } catch (err) {
        console.error("[Explore] Totals Fetch Error:", err);
      }
    };
    
    const fetchFollows = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('topic_follows')
        .select('topic_id')
        .eq('user_id', user.id);
      if (data) {
        const ids = data.map(f => f.topic_id);
        setFollowedIds(ids);
        localStorage.setItem('explore_followed_ids', JSON.stringify(ids));
      }
    };
    
    fetchTopics();
    fetchLeaderboard();
    fetchDeliberating();
    fetchLive();
    fetchTopicTotals();
    fetchFollows();

    const interval = setInterval(fetchLive, 5000);
    const timerInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => {
      clearInterval(interval);
      clearInterval(timerInterval);
      if (socket) socket.off('new_topic_added', fetchTopics); // Keep this if it's still relevant for new topics
    };
  }, []); // Dependency array changed from [socket, user] to []

  useEffect(() => {
    if (!socket || !user) return;
    
    // Announce online presence
    const stats = JSON.parse(localStorage.getItem('dashboard_stats')) || { elo: 1000 };
    socket.emit('user_online', { 
      id: user.id, 
      email: user.email, 
      username: user.user_metadata?.username, 
      elo_rating: stats.elo 
    });

    const handleAnnouncement = (data) => {
      if (data.type === 'online_vip') {
        setVipAnnouncement(data.message);
        setTimeout(() => setVipAnnouncement(null), 6000);
      }
    };
    
    socket.on('global_announcement', handleAnnouncement);
    return () => socket.off('global_announcement', handleAnnouncement);
  }, [socket, user]);

  // This useEffect was previously the first one, now it's the third.
  // It was also modified to remove the fetch calls that are now in the first useEffect.
  useEffect(() => {
    // Setup global timer for deliberation card countdowns
    const timerInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    
    const interval = setInterval(() => {
      // These fetches are now handled by the first useEffect's interval or are called once
      // fetchLeaderboard();
      // fetchDeliberating();
      // fetchLive(); // Changed to fetchLive
      // fetchTopicTotals();
    }, 10000); // This interval is now redundant if fetchLiveMatches is called every 5s in the first useEffect.
               // I'll remove the interval setup here to avoid duplicate intervals.
    
    // Listen for real-time topic additions
    if (socket) {
      socket.on('new_topic_added', () => {
        // Re-fetch topics when a new one is added
        const fetchTopics = async () => {
          const { data, error } = await supabase
            .from('topics')
            .select('*')
            .order('created_at', { ascending: false });
          
          if (error) {
            console.error("[Explore] Topics Fetch Error:", error.message, error.details);
          }
          if (!error && data) {
            setTopics(data);
            localStorage.setItem('explore_topics', JSON.stringify(data));
          }
        };
        fetchTopics();
      });
    }

    return () => {
      clearInterval(timerInterval);
      // clearInterval(interval); // Removed as it's redundant with the first useEffect's interval
      if (socket) socket.off('new_topic_added', () => {}); // Correctly remove the listener
    };
  }, [socket]); // Dependencies adjusted

  // Follow / Unfollow toggle with optimistic UI
  const toggleFollow = async (topicId) => {
    if (!user) return;
    const isFollowed = followedIds.includes(topicId);

    // Optimistic update
    const newIds = isFollowed
      ? followedIds.filter(id => id !== topicId)
      : [...followedIds, topicId];
    setFollowedIds(newIds);
    localStorage.setItem('explore_followed_ids', JSON.stringify(newIds));

    if (isFollowed) {
      const { error } = await supabase
        .from('topic_follows')
        .delete()
        .eq('user_id', user.id)
        .eq('topic_id', topicId);
      if (error) {
        console.error('[Explore] Unfollow error:', error.message);
        setFollowedIds(followedIds); // revert
      }
    } else {
      const { error } = await supabase
        .from('topic_follows')
        .insert({ user_id: user.id, topic_id: topicId });
      if (error) {
        console.error('[Explore] Follow error:', error.message);
        setFollowedIds(followedIds); // revert
      }
    }
  };

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

  // Search & Create: auto-filter on duplicate OR success clear
  useEffect(() => {
    if (!socket) return;
    const handleTopicResult = (data) => {
      setIsCreating(false);
      setTopicFeedback({ type: data.success ? 'success' : 'error', text: data.message });
      if (!data.success && data.matchedTopic) {
        setSearchQuery(data.matchedTopic);
      } else if (data.success) {
        setSearchQuery('');
      }
      setTimeout(() => setTopicFeedback(null), 5000);
    };
    
    const handleSemanticResult = (data) => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
      setIsSearchingDeliberation(false);
      if (data.found && data.matchedTopic) {
        setDeliberationSearchQuery(data.matchedTopic);
        setDeliberationFeedback({ type: 'success', text: `Found semantic match: "${data.matchedTopic}"` });
      } else {
        setDeliberationFeedback({ type: 'error', text: 'No semantically matching debates found in deliberation.' });
      }
      setTimeout(() => setDeliberationFeedback(null), 4000);
    };

    const handleSemanticCompletedResult = async (data) => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
      setIsSearchingCompleted(false);
      
      if (data.found && data.matchedTopic) {
        setCompletedSearchQuery(data.matchedTopic);
        
        const { data: dbData, error } = await supabase
          .from('matches')
          .select('*')
          .eq('status', 'completed')
          .eq('topic_title', data.matchedTopic)
          .order('created_at', { ascending: false })
          .limit(20);

        if (!error && dbData && dbData.length > 0) {
           setCompletedMatches(dbData);
           setCompletedFeedback({ type: 'success', text: `Found semantic match: "${data.matchedTopic}"` });
        } else {
           setCompletedFeedback({ type: 'error', text: 'Error retrieving matches for this topic.' });
        }
      } else {
        setCompletedFeedback({ type: 'error', text: 'No semantically matching completed debates found.' });
      }
      setTimeout(() => setCompletedFeedback(null), 4000);
    };

    socket.on('topic_result', handleTopicResult);
    socket.on('semantic_search_result', handleSemanticResult);
    socket.on('semantic_search_completed_result', handleSemanticCompletedResult);
    
    return () => {
      socket.off('topic_result', handleTopicResult);
      socket.off('semantic_search_result', handleSemanticResult);
      socket.off('semantic_search_completed_result', handleSemanticCompletedResult);
    };
  }, [socket]);

  const handleCreateTopic = () => {
    if (searchQuery.trim().length < 5) return;
    setIsCreating(true);
    setTopicFeedback(null);
    socket.emit('propose_topic', { newTopic: searchQuery.trim() });
  };

  const handleDeliberationSearch = () => {
    if (deliberationSearchQuery.trim().length < 3) return;
    setIsSearchingDeliberation(true);
    setDeliberationFeedback(null);
    
    // Get unique topic titles currently in deliberation
    const contextTopics = [...new Set(deliberatingMatches.map(m => m.topic_title).filter(Boolean))];
    
    if (contextTopics.length === 0) {
      setIsSearchingDeliberation(false);
      setDeliberationFeedback({ type: 'error', text: 'No debates are currently in deliberation.' });
      setTimeout(() => setDeliberationFeedback(null), 3000);
      return;
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setIsSearchingDeliberation(false);
      setDeliberationFeedback({ type: 'error', text: 'Search timed out. (Did you forget to restart the backend server?)' });
      setTimeout(() => setDeliberationFeedback(null), 6000);
    }, 10000);

    socket.emit('semantic_search', { query: deliberationSearchQuery.trim(), contextTopics });
  };

  const handleCompletedSearch = async () => {
    if (completedSearchQuery.trim().length < 3) return;
    setIsSearchingCompleted(true);
    setCompletedFeedback(null);

    // Get unique completed topic titles from DB to feed Gemini
    const { data, error } = await supabase
      .from('matches')
      .select('topic_title')
      .eq('status', 'completed');

    if (error || !data || data.length === 0) {
      setIsSearchingCompleted(false);
      setCompletedFeedback({ type: 'error', text: 'Error fetching completed arenas context.' });
      setTimeout(() => setCompletedFeedback(null), 4000);
      return;
    }

    const contextTopics = [...new Set(data.filter(d => d.topic_title).map(d => d.topic_title))];

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setIsSearchingCompleted(false);
      setCompletedFeedback({ type: 'error', text: 'Search timed out.' });
      setTimeout(() => setCompletedFeedback(null), 6000);
    }, 10000);

    socket.emit('semantic_search_completed', { query: completedSearchQuery.trim(), contextTopics });
  };

  const handleEnterLobby = (topic) => {
    navigate(`/lobby/${topic.id}`, { state: { topic } });
  };

  const handleTopicClick = (topicTitle) => {
    navigate(`/topic/${encodeURIComponent(topicTitle)}`);
  };

  const groupMatches = (matches) => {
    const groups = {};
    matches
      .filter(m => m.topic_title && m.topic_title.toLowerCase() !== 'custom debate')
      .forEach(m => {
        const title = m.topic_title;
        if (!groups[title]) groups[title] = [];
        groups[title].push(m);
      });
    return groups;
  };



  return (
    <div className="bg-slate-950 text-slate-200 min-h-[calc(100vh-64px)] overflow-y-auto">
      {vipAnnouncement && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-4 fade-in duration-300">
          <div className="px-6 py-3 rounded-full bg-cyan-950/80 border border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.3)] backdrop-blur-md flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
            </span>
            <p className="text-cyan-300 font-bold text-sm tracking-wide">{vipAnnouncement}</p>
          </div>
        </div>
      )}
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 flex flex-col gap-12 pb-16">
        <header className="mb-10">
          <h1 className="text-4xl font-extrabold text-slate-100 flex items-center gap-4">
            <Compass className="h-10 w-10 text-cyan-400" />
            Explore Topics
          </h1>
          <p className="text-slate-400 mt-3 text-lg">Find trending debates, browse categories, and enter the arena.</p>
        </header>

        {liveMatches.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-slate-100 mb-6 flex items-center gap-3 border-b border-[#1e293b] pb-4">
              <span className="relative flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500"></span>
              </span>
              🔴 Live Arenas
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Object.entries(groupMatches(liveMatches)).map(([title, matches]) => {
                const hasMultiple = matches.length > 1;

                if (hasMultiple) {
                  return (
                    <div 
                      key={`stack-live-${title}`}
                      onClick={() => handleTopicClick(title)}
                      className="group cursor-pointer relative bg-red-950/10 border border-red-500/20 rounded-xl p-6 flex flex-col h-full hover:border-red-500/40 transition-all hover:shadow-[0_0_20px_rgba(239,68,68,0.1)] active:scale-[0.98]"
                    >
                      <div className="absolute top-2 right-2 bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full z-20 animate-pulse">
                        LIVE STACK
                      </div>
                      
                      {/* Visual Stack Effect */}
                      <div className="absolute inset-0 bg-red-500/5 rounded-xl translate-x-2 translate-y-2 -z-10 border border-red-500/10"></div>
                      <div className="absolute inset-0 bg-red-500/5 rounded-xl translate-x-4 translate-y-4 -z-20 border border-red-500/10"></div>
                      
                      <div className="flex items-center gap-3 mb-4">
                        <Layers className="h-6 w-6 text-red-400" />
                        <h3 className="text-xl font-bold text-slate-100 line-clamp-2">{title}</h3>
                      </div>
                      
                      <div className="mt-auto flex items-center justify-between">
                        <span className="text-red-400 font-bold text-sm tracking-tighter">
                          {matches.length} ACTIVE DEBATES
                        </span>
                        <div className="flex items-center gap-1 text-slate-400 group-hover:text-red-300 transition-colors">
                          <span className="text-xs font-bold uppercase">View Topics</span>
                          <ChevronDown className="h-4 w-4" />
                        </div>
                      </div>
                    </div>
                  );
                }

                const match = matches[0];
                return (
                  <div 
                    key={match.id} 
                    onClick={() => navigate(`/arena/${match.id}`, { state: { roomId: match.id, topic: match.topic_title, isSpectator: true } })}
                    className="group cursor-pointer relative bg-red-950/10 border border-red-500/20 rounded-xl p-6 flex flex-col h-full hover:border-red-500/40 transition-all duration-300 hover:shadow-[0_0_20px_rgba(239,68,68,0.1)] active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <Activity className="h-6 w-6 text-red-400 animate-pulse" />
                      <h3 className="text-xl font-bold text-slate-100 line-clamp-2 flex-1">{match.topic_title || 'Custom Debate'}</h3>
                    </div>
                    
                    <div className="mt-auto flex items-center justify-between">
                      <span className="text-red-400 font-bold text-sm tracking-tighter">
                        1 ACTIVE DEBATE
                      </span>
                      <div className="flex items-center gap-1 text-slate-400 group-hover:text-red-300 transition-colors">
                        <span className="text-xs font-bold uppercase">Spectate</span>
                        <ChevronDown className="h-4 w-4 -rotate-90" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {deliberatingMatches.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-slate-100 mb-6 flex items-center gap-3 border-b border-[#1e293b] pb-4">
              <Vote className="h-6 w-6 text-purple-500" />
              In Deliberation (Voting Open)
            </h2>

            {/* Deliberation Search Bar */}
            <div className="mb-2 relative flex items-center">
              <Search className="absolute left-4 h-5 w-5 text-slate-500" />
              <input
                type="text"
                placeholder="Search debates waiting for verdict..."
                value={deliberationSearchQuery}
                onChange={(e) => setDeliberationSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && deliberationSearchQuery.trim().length >= 3) {
                    handleDeliberationSearch();
                  }
                }}
                disabled={isSearchingDeliberation}
                className={`w-full bg-slate-900/50 border border-slate-700/50 rounded-xl py-3 pl-12 pr-12 text-slate-200 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all text-sm ${isSearchingDeliberation ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
              {deliberationSearchQuery && !isSearchingDeliberation && (
                <button onClick={() => setDeliberationSearchQuery('')} className="absolute right-4 p-1 hover:bg-slate-800 rounded-full transition-colors">
                  <X className="h-4 w-4 text-slate-400 hover:text-slate-200" />
                </button>
              )}
            </div>

            {/* AI Semantic Search Action */}
            {deliberationSearchQuery.trim().length >= 3 && !deliberationFeedback && (
              <div className="mb-6 p-4 border border-dashed border-purple-700/50 bg-purple-950/10 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <span className="text-slate-300 text-sm">Use AI to find debates with the same core meaning.</span>
                <button
                  onClick={handleDeliberationSearch}
                  disabled={isSearchingDeliberation}
                  className="shrink-0 px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg shadow-lg shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-sm"
                >
                  {isSearchingDeliberation ? (
                    <>
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                      </span>
                      Analyzing Semantics...
                    </>
                  ) : (
                    'Find Active Verdicts'
                  )}
                </button>
              </div>
            )}

            {/* Deliberation Feedback Toast */}
            {deliberationFeedback && (
              <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium border ${
                deliberationFeedback.type === 'success'
                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-500/50 text-rose-300'
              }`}>
                {deliberationFeedback.text}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              {Object.entries(groupMatches(deliberatingMatches.filter(m => !deliberationSearchQuery || (m.topic_title && m.topic_title.toLowerCase().includes(deliberationSearchQuery.toLowerCase()))))).map(([title, matches]) => {
                return (
                  <div 
                    key={`stack-delib-${title}`}
                    onClick={() => handleTopicClick(title)}
                    className="group cursor-pointer relative bg-purple-950/10 border border-purple-500/20 rounded-xl p-6 flex flex-col h-full hover:border-purple-500/40 transition-all hover:shadow-[0_0_20px_rgba(168,85,247,0.1)] active:scale-[0.98]"
                  >
                    <div className="absolute top-2 right-2 bg-purple-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full z-20 animate-pulse">
                      VOTE STACK
                    </div>
                    
                    {/* Visual Stack Effect */}
                    <div className="absolute inset-0 bg-purple-500/5 rounded-xl translate-x-2 translate-y-2 -z-10 border border-purple-500/10"></div>
                    <div className="absolute inset-0 bg-purple-500/5 rounded-xl translate-x-4 translate-y-4 -z-20 border border-purple-500/10"></div>
                    
                    <div className="flex items-center gap-3 mb-2">
                      <Layers className="h-6 w-6 text-purple-400" />
                      <h3 className="text-xl font-bold text-slate-100 line-clamp-2 flex-1">{title}</h3>
                      <span className={`shrink-0 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${getTopicDomain(title).color}`}>
                        {getTopicDomain(title).domain}
                      </span>
                    </div>
                    
                    <div className="mt-auto flex items-center justify-between">
                      <span className="text-purple-400 font-bold text-sm tracking-tighter">
                        {matches.length} {matches.length === 1 ? 'PENDING DECISION' : 'PENDING DECISIONS'}
                      </span>
                      <div className="flex items-center gap-1 text-slate-400 group-hover:text-purple-300 transition-colors">
                        <span className="text-xs font-bold uppercase">View Stack</span>
                        <ChevronDown className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

          <div className="mb-12">
          <h2 className="text-2xl font-bold text-slate-100 mb-6 flex items-center gap-3 border-b border-[#1e293b] pb-4">
            <Flame className="h-6 w-6 text-rose-500" />
            Trending Arenas
          </h2>

          {/* Search Bar */}
          {/* Search & Create Bar */}
          <div className="mb-2 relative flex items-center">
            <Search className="absolute left-4 h-5 w-5 text-slate-500" />
            <input
              type="text"
              placeholder="Search active arenas or propose a new topic..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchQuery.trim().length > 5) {
                  handleCreateTopic();
                }
              }}
              className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl py-4 pl-12 pr-12 text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all text-base"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-4 p-1 hover:bg-slate-800 rounded-full transition-colors">
                <X className="h-5 w-5 text-slate-400 hover:text-slate-200" />
              </button>
            )}
          </div>

          {/* Feedback Toast */}
          {topicFeedback && (
            <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium border ${
              topicFeedback.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                : 'bg-rose-950/40 border-rose-500/50 text-rose-300'
            }`}>
              {topicFeedback.text}
            </div>
          )}

          {/* Create New Arena Action */}
          {searchQuery.trim().length > 5 && !topicFeedback && (
            <div className="mb-6 p-4 border border-dashed border-cyan-700/50 bg-cyan-950/10 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <span className="text-slate-300 text-sm">Don't see your topic? Create a new public Arena.</span>
              <button
                onClick={handleCreateTopic}
                disabled={isCreating}
                className="shrink-0 px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isCreating ? 'Analyzing Semantics...' : 'Create New Arena'}
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {topics
              .filter(topic => {
                const title = topic.title || '';
                return title.toLowerCase().includes(searchQuery.toLowerCase());
              })
              .sort((a, b) => (topicTotals[b.title] || 0) - (topicTotals[a.title] || 0))
              .slice(0, 5) // Display top 5 topics as per plan
              .map((topic, index) => (
              <div 
                key={topic.id} 
                className="bg-slate-900/50 backdrop-blur-md border border-[#1e293b] rounded-2xl p-6 transition-all duration-300 hover:border-cyan-500/50 hover:shadow-[0_0_30px_rgba(34,211,238,0.1)] hover:-translate-y-1 flex flex-col h-full"
              >
                <div className="flex justify-between items-start mb-4 gap-3">
                  <h3 className="text-xl font-bold text-slate-100 leading-snug flex-1">
                    {topic.title}
                  </h3>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full border ${getTopicDomain(topic.title).color}`}>
                      {getTopicDomain(topic.title).domain}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleFollow(topic.id); }}
                      className={`p-1.5 rounded-lg transition-all border ${
                        followedIds.includes(topic.id)
                          ? 'bg-amber-500/15 border-amber-500/30 hover:bg-red-500/15 hover:border-red-500/30'
                          : 'bg-slate-800/50 border-slate-700/50 hover:bg-amber-500/15 hover:border-amber-500/30'
                      }`}
                      title={followedIds.includes(topic.id) ? 'Unfollow' : 'Follow'}
                    >
                      {followedIds.includes(topic.id)
                        ? <BookmarkCheck className="h-4 w-4 text-amber-400" />
                        : <Bookmark className="h-4 w-4 text-slate-500 hover:text-amber-400" />
                      }
                    </button>
                  </div>
                </div>
                
                {/* Topic info footer */}
                <div className="mt-auto flex flex-col gap-3 pt-4 border-t border-[#1e293b]">
                  <div className="flex items-center justify-between text-slate-400">
                    <div className="flex items-center gap-2">
                       <Users className="h-4 w-4 text-cyan-400" />
                       <span className="text-sm font-medium">
                         {(activeUserCounts[topic.title] || 0).toLocaleString()} Active
                       </span>
                    </div>
                    <div className="flex items-center gap-2">
                       <Activity className="h-4 w-4 text-purple-400" />
                       <span className="text-sm font-medium">
                         {(topicTotals[topic.title] || 0).toLocaleString()} Played
                       </span>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => handleEnterLobby(topic)}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold uppercase tracking-wider px-6 py-2.5 rounded-lg transition-colors shadow-lg shadow-indigo-500/20"
                  >
                    Enter Lobby
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Completed Arenas Section */}
        {completedMatches.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-slate-100 mb-6 flex items-center gap-3 border-b border-[#1e293b] pb-4 mt-8">
              <Trophy className="h-6 w-6 text-emerald-500" />
              Recently Completed
            </h2>

            {/* Completed Search Bar */}
            <div className="mb-2 relative flex items-center">
              <Search className="absolute left-4 h-5 w-5 text-slate-500" />
              <input
                type="text"
                placeholder="Search past debate topics..."
                value={completedSearchQuery}
                onChange={(e) => setCompletedSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && completedSearchQuery.trim().length >= 3) {
                    handleCompletedSearch();
                  }
                }}
                disabled={isSearchingCompleted}
                className={`w-full bg-slate-900/50 border border-slate-700/50 rounded-xl py-3 pl-12 pr-12 text-slate-200 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all text-sm ${isSearchingCompleted ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
              {completedSearchQuery && !isSearchingCompleted && (
                <button onClick={() => setCompletedSearchQuery('')} className="absolute right-4 p-1 hover:bg-slate-800 rounded-full transition-colors">
                  <X className="h-4 w-4 text-slate-400 hover:text-slate-200" />
                </button>
              )}
            </div>

            {/* Completed Search Action Block */}
            {completedSearchQuery.trim().length >= 3 && !completedFeedback && (
              <div className="mb-6 p-4 border border-dashed border-emerald-700/50 bg-emerald-950/10 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <span className="text-slate-300 text-sm">Search the archives for past debates.</span>
                <button
                  onClick={handleCompletedSearch}
                  disabled={isSearchingCompleted}
                  className="shrink-0 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-sm"
                >
                  {isSearchingCompleted ? (
                    <>
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                      </span>
                      Searching Archives...
                    </>
                  ) : (
                    'Recall Past Arenas'
                  )}
                </button>
              </div>
            )}

            {/* Completed Feedback Toast */}
            {completedFeedback && (
              <div className={`mb-6 px-4 py-3 rounded-lg text-sm font-medium border ${
                completedFeedback.type === 'success'
                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-500/50 text-rose-300'
              }`}>
                {completedFeedback.text}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {completedMatches
                .filter(m => !completedSearchQuery || (m.topic_title || m.topic || '').toLowerCase().includes(completedSearchQuery.toLowerCase()))
                .map((match) => (
                <div 
                  key={match.id} 
                  onClick={() => navigate(`/review/${match.id}`)}
                  className="group cursor-pointer relative bg-[#0b0f19]/80 backdrop-blur-sm border border-emerald-900/30 rounded-xl p-6 flex flex-col h-full hover:border-emerald-500/40 transition-all duration-300 hover:shadow-[0_0_20px_rgba(16,185,129,0.05)] active:scale-[0.98]"
                >
                  <div className="flex justify-between items-start mb-4 gap-4">
                    <h3 className="text-lg font-bold text-slate-200 line-clamp-2 flex-1">
                      {match.topic_title || match.topic || 'Custom Debate'}
                    </h3>
                    <span className={`shrink-0 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${getTopicDomain(match.topic_title || match.topic).color}`}>
                      {getTopicDomain(match.topic_title || match.topic).domain}
                    </span>
                  </div>
                  
                  <div className="mt-auto flex items-center justify-between text-slate-400 border-t border-slate-800/50 pt-4">
                    <span className="text-[10px] font-black tracking-wider bg-emerald-950/30 text-emerald-400/80 px-2 py-1 rounded-md border border-emerald-900/20">
                      RESOLVED • {new Date(match.updated_at || match.created_at).toLocaleDateString()}
                    </span>
                    <div className="flex items-center gap-1 group-hover:text-emerald-400 transition-colors">
                      <span className="text-xs font-bold uppercase">View Report</span>
                      <ChevronDown className="h-4 w-4 -rotate-90" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Find Debater Search Bar */}
        <div className="mb-8 p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
            <h3 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
                <Search className="h-5 w-5 text-cyan-400" /> Find Debater
            </h3>
            <form onSubmit={handleSearchUser} className="flex gap-3">
                <input
                    type="text"
                    placeholder="Enter Socratic ID (e.g. 1ab66dbc...)"
                    value={searchId}
                    onChange={(e) => setSearchId(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
                />
                <button type="submit" className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold rounded-xl transition-colors cursor-pointer">
                    Search
                </button>
            </form>
            {searchError && <p className="text-rose-500 text-sm mt-2">{searchError}</p>}
        </div>

        <div>
          <h2 className="text-2xl font-bold text-slate-100 mb-6 flex items-center gap-3 border-b border-[#1e293b] pb-4 mt-8">
            <Trophy className="h-6 w-6 text-amber-500" />
            Hall of Fame
          </h2>
          <div className="bg-slate-900/50 border border-[#1e293b] rounded-2xl p-4 space-y-3">
            {leaderboard.length > 0 ? leaderboard.map((profile, index) => {
              const medal = index === 0
                ? { label: '🥇', color: 'text-amber-400' }
                : index === 1
                ? { label: '🥈', color: 'text-slate-300' }
                : index === 2
                ? { label: '🥉', color: 'text-amber-700' }
                : { label: `#${index + 1}`, color: 'text-slate-500' };

              return (
                <div 
                  key={profile.id} 
                  onClick={() => {
                    setSelectedProfile({ id: profile.id, username: profile.username || profile.email?.split('@')[0], email: profile.email });
                    setIsProfileModalOpen(true);
                  }}
                  className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#0b0f19] border border-slate-800/60 hover:border-slate-700 transition cursor-pointer active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-xl font-bold w-8 text-center ${medal.color}`}>{medal.label}</span>
                    <span className="text-slate-100 font-semibold truncate">
                      {profile.username || profile.email?.split('@')[0] || 'Anonymous'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="hidden sm:block">
                      <RankBadge elo={profile.elo_rating || 1000} />
                    </div>
                    <div className="flex items-center gap-1.5 w-[50px] justify-end">
                      <Activity className="h-3.5 w-3.5 text-cyan-400" />
                      <span className="text-cyan-300 font-bold text-sm">{profile.elo_rating ?? 1000}</span>
                    </div>
                  </div>
                </div>
              );
            }) : (
              <div className="flex items-center justify-center min-h-[160px]">
                <p className="text-slate-500 font-medium tracking-wide">No ranked debaters yet. Win a match to claim your spot!</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* External Profile Modal */}
      <ProfileModal 
        isOpen={isProfileModalOpen} 
        onClose={() => {
          setIsProfileModalOpen(false);
          setTimeout(() => setSelectedProfile(null), 300);
        }} 
        viewUser={selectedProfile}
        currentUserId={user?.id}
      />
    </div>
  );
};

export default Explore;
