import { Compass, Hash, Trophy, Flame, Swords, Users, Vote, Activity, Search, X, LayoutGrid, Layers, ChevronDown, ChevronUp, Bookmark, BookmarkCheck, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { getTopicDomain, broadTopicsList } from '../lib/domainUtils';
import { RankBadge } from '../lib/rankUtils';
import ProfileModal from './ProfileModal';
import React, { useEffect, useState } from 'react';

const Explore = ({ socket, user }) => {
  const navigate = useNavigate();
  const [topics, setTopics] = useState(() => JSON.parse(localStorage.getItem('explore_topics')) || []);
  const [deliberatingMatches, setDeliberatingMatches] = useState(() => JSON.parse(localStorage.getItem('explore_deliberating')) || []);
  const [completedMatches, setCompletedMatches] = useState(() => JSON.parse(localStorage.getItem('explore_completed')) || []);
  const [liveMatches, setLiveMatches] = useState(() => JSON.parse(localStorage.getItem('explore_live')) || []);
  const [endedMatchIds, setEndedMatchIds] = useState(new Set());
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
  const [togglingIds, setTogglingIds] = useState(new Set());
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
        // Filter out "Ghost Matches" (any active match older than 15 mins is definitely over)
        const now = new Date();
        const filteredLive = data.filter(match => {
          const createdAt = new Date(match.created_at);
          const ageInMinutes = (now - createdAt) / (1000 * 60);
          // Filter out matches older than 15 mins OR matches we know have ended
          return ageInMinutes < 15 && !endedMatchIds.has(match.id);
        });

        setLiveMatches(filteredLive);
        localStorage.setItem('explore_live', JSON.stringify(filteredLive));

        // Calculate player density per topic title
        const counts = {};
        filteredLive.forEach(match => {
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
          .in('status', ['active', 'completed', 'pending_votes', 'abandoned']);

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

    const interval = setInterval(fetchLive, 30000);
    const timerInterval = setInterval(() => setCurrentTime(new Date()), 1000);

    // Real-time listener: Instantly remove ended matches from Live Arenas
    const handleMatchEnded = ({ matchId }) => {
      console.log(`[Explore] match_ended received for ${matchId}. Removing from Live Arenas.`);

      // Mark as ended locally to prevent it from being re-added by fetchLive for the next 15 seconds
      setEndedMatchIds(prev => {
        const next = new Set(prev);
        next.add(matchId);
        return next;
      });

      // Simple cleanup: remove from endedMatchIds after 15s
      setTimeout(() => {
        setEndedMatchIds(prev => {
          const next = new Set(prev);
          next.delete(matchId);
          return next;
        });
      }, 15000);

      setLiveMatches(prev => {
        const updated = (prev || []).filter(m => m.id !== matchId);
        localStorage.setItem('explore_live', JSON.stringify(updated));
        return updated;
      });
      fetchDeliberating();
    };

    if (socket) {
      socket.on('match_ended', handleMatchEnded);
    }

    return () => {
      clearInterval(interval);
      clearInterval(timerInterval);
      if (socket) {
        socket.off('match_ended', handleMatchEnded);
      }
    };
  }, [socket, user]);

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
      if (socket) socket.off('new_topic_added', () => { }); // Correctly remove the listener
    };
  }, [socket]); // Dependencies adjusted

  // Follow / Unfollow toggle with optimistic UI and lock
  const toggleFollow = async (topicId) => {
    if (!user || togglingIds.has(topicId)) return;

    setTogglingIds(prev => new Set(prev).add(topicId));

    try {
      const isCurrentlyFollowed = followedIds.includes(topicId);

      // Optimistic update
      setFollowedIds(prev => {
        const next = isCurrentlyFollowed
          ? prev.filter(id => id !== topicId)
          : [...prev, topicId];
        localStorage.setItem('explore_followed_ids', JSON.stringify(next));
        return next;
      });

      if (isCurrentlyFollowed) {
        const { error } = await supabase
          .from('topic_follows')
          .delete()
          .eq('user_id', user.id)
          .eq('topic_id', topicId);
        if (error) {
          console.error('[Explore] Unfollow error:', error.message);
          // Revert on error
          setFollowedIds(prev => [...prev, topicId]);
        }
      } else {
        const { error } = await supabase
          .from('topic_follows')
          .insert({ user_id: user.id, topic_id: topicId });
        if (error) {
          console.error('[Explore] Follow error:', error.message);
          // Revert on error
          setFollowedIds(prev => prev.filter(id => id !== topicId));
        }
      }
    } finally {
      setTogglingIds(prev => {
        const next = new Set(prev);
        next.delete(topicId);
        return next;
      });
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

  const handleTopicClick = (topicTitle, filterStatus = null) => {
    const queryParam = filterStatus ? `?status=${filterStatus}` : '';
    navigate(`/topic/${encodeURIComponent(topicTitle)}${queryParam}`, { state: { filterStatus } });
  };

  const groupMatches = (matches) => {
    const groups = {};
    const seenIds = new Set(); // Deduplicate by match ID
    matches
      .filter(m => {
        // Skip duplicates
        if (seenIds.has(m.id)) return false;
        seenIds.add(m.id);
        return (m.topic_title || m.topic) && (m.topic_title || m.topic).toLowerCase() !== 'custom debate';
      })
      .forEach(m => {
        const title = m.topic_title || m.topic;
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
                      onClick={() => handleTopicClick(title, 'active')}
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
                          <span className="text-xs font-bold uppercase mr-2">View Topics</span>

                          {/* Side-by-side icons in Live Stack cards */}
                          {(() => {
                            const domain = getTopicDomain(title).domain;
                            const categoryTopic = topics.find(t => t.title.toLowerCase() === domain.toLowerCase());
                            const specificTopic = topics.find(t => t.title.toLowerCase() === title.toLowerCase());
                            const isCatFollowed = categoryTopic ? followedIds.includes(categoryTopic.id) : false;
                            const isTopicFollowed = specificTopic ? followedIds.includes(specificTopic.id) : false;

                            return <div className="flex items-center gap-2 mr-2">
                              <button
                                disabled={togglingIds.has(specificTopic?.id)}
                                onClick={(e) => { e.stopPropagation(); if (specificTopic) toggleFollow(specificTopic.id); }}
                                className={`p-1 rounded-md border transition-all ${isTopicFollowed ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400' : 'bg-slate-800 border-slate-700 text-slate-500'} ${togglingIds.has(specificTopic?.id) ? 'opacity-50 keep-cursor' : ''}`}
                                title="Save Topic"
                              >
                                <Target className={`h-3 w-3 ${togglingIds.has(specificTopic?.id) ? 'animate-pulse' : ''}`} />
                              </button>
                              <button
                                disabled={togglingIds.has(categoryTopic?.id)}
                                onClick={(e) => { e.stopPropagation(); if (categoryTopic) toggleFollow(categoryTopic.id); }}
                                className={`p-1 rounded-md border transition-all ${isCatFollowed ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-slate-800 border-slate-700 text-slate-500'} ${togglingIds.has(categoryTopic?.id) ? 'opacity-50 keep-cursor' : ''}`}
                                title={`Follow ${domain}`}
                              >
                                {isCatFollowed ? <BookmarkCheck className={`h-3 w-3 ${togglingIds.has(categoryTopic?.id) ? 'animate-pulse' : ''}`} /> : <Bookmark className={`h-3 w-3 ${togglingIds.has(categoryTopic?.id) ? 'animate-pulse' : ''}`} />}
                              </button>
                            </div>
                              ;
                          })()}

                          <ChevronDown className="h-4 w-4" />
                        </div>
                      </div>
                    </div>
                  );
                }

                const match = matches[0];
                const isPlayer = user && (match.critic_id === user.id || match.defender_id === user.id);

                return (
                  <div
                    key={match.id}
                    onClick={() => navigate(`/arena/${match.id}`, { state: { roomId: match.id, topic: match.topic_title, isSpectator: !isPlayer } })}
                    className={`group cursor-pointer relative bg-red-950/10 border border-red-500/20 rounded-xl p-6 flex flex-col h-full hover:border-red-500/40 transition-all duration-300 hover:shadow-[0_0_20px_rgba(239,68,68,0.1)] active:scale-[0.98] ${isPlayer ? 'ring-2 ring-amber-500/50' : ''}`}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      {isPlayer ? <Swords className="h-6 w-6 text-amber-500 animate-pulse" /> : <Activity className="h-6 w-6 text-red-400 animate-pulse" />}
                      <h3 className="text-xl font-bold text-slate-100 line-clamp-2 flex-1">{match.topic_title || 'Custom Debate'}</h3>
                    </div>

                    <div className="mt-auto flex items-center justify-between">
                      <span className={`${isPlayer ? 'text-amber-500' : 'text-red-400'} font-bold text-sm tracking-tighter`}>
                        {isPlayer ? 'YOUR MATCH' : '1 ACTIVE DEBATE'}
                      </span>
                      <div className={`flex items-center gap-1 transition-colors ${isPlayer ? 'text-amber-400 group-hover:text-amber-300' : 'text-slate-400 group-hover:text-red-300'}`}>
                        <span className="text-xs font-bold uppercase">{isPlayer ? 'Rejoin Match' : 'Spectate'}</span>
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
              <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium border ${deliberationFeedback.type === 'success'
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
                    onClick={() => handleTopicClick(title, 'pending_votes')}
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
                        <span className="text-xs font-bold uppercase mr-2">View Stack</span>

                        {/* Side-by-side icons in Delibration cards */}
                        {(() => {
                          const domain = getTopicDomain(title).domain;
                          const categoryTopic = topics.find(t => t.title.toLowerCase() === domain.toLowerCase());
                          const specificTopic = topics.find(t => t.title.toLowerCase() === title.toLowerCase());
                          const isCatFollowed = categoryTopic ? followedIds.includes(categoryTopic.id) : false;
                          const isTopicFollowed = specificTopic ? followedIds.includes(specificTopic.id) : false;

                          return (
                            <div className="flex items-center gap-2 mr-2">
                              <button
                                disabled={togglingIds.has(specificTopic?.id)}
                                onClick={(e) => { e.stopPropagation(); if (specificTopic) toggleFollow(specificTopic.id); }}
                                className={`p-1 rounded-md border transition-all ${isTopicFollowed ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400' : 'bg-slate-800 border-slate-700 text-slate-500'} ${togglingIds.has(specificTopic?.id) ? 'opacity-50 keep-cursor' : ''}`}
                                title="Save Topic"
                              >
                                <Target className={`h-3 w-3 ${togglingIds.has(specificTopic?.id) ? 'animate-pulse' : ''}`} />
                              </button>
                              <button
                                disabled={togglingIds.has(categoryTopic?.id)}
                                onClick={(e) => { e.stopPropagation(); if (categoryTopic) toggleFollow(categoryTopic.id); }}
                                className={`p-1 rounded-md border transition-all ${isCatFollowed ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-slate-800 border-slate-700 text-slate-500'} ${togglingIds.has(categoryTopic?.id) ? 'opacity-50 keep-cursor' : ''}`}
                                title={`Follow ${domain}`}
                              >
                                {isCatFollowed ? <BookmarkCheck className={`h-3 w-3 ${togglingIds.has(categoryTopic?.id) ? 'animate-pulse' : ''}`} /> : <Bookmark className={`h-3 w-3 ${togglingIds.has(categoryTopic?.id) ? 'animate-pulse' : ''}`} />}
                              </button>
                            </div>
                          );
                        })()}

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
            <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium border ${topicFeedback.type === 'success'
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
                const title = (topic.title || '').toLowerCase();
                const isMatch = title.includes(searchQuery.toLowerCase());
                const isBroad = broadTopicsList.includes(title);
                const isPlayed = (topicTotals[topic.title] || 0) > 0;
                const hasSearch = searchQuery.trim().length > 0;

                // Show topics only if they have been played OR if there's an active search query
                return isMatch && !isBroad && (hasSearch || isPlayed);
              })
              .sort((a, b) => {
                const playA = topicTotals[a.title] || 0;
                const playB = topicTotals[b.title] || 0;
                if (playA !== playB) return playB - playA; // Most played first

                // Tiebreaker: Personalization — topics in followed categories rank higher
                const domainA = getTopicDomain(a.title).domain;
                const domainB = getTopicDomain(b.title).domain;
                const catTopicA = topics.find(t => t.title.toLowerCase() === domainA.toLowerCase());
                const catTopicB = topics.find(t => t.title.toLowerCase() === domainB.toLowerCase());
                const scoreA = (catTopicA && followedIds.includes(catTopicA.id)) ? 1 : 0;
                const scoreB = (catTopicB && followedIds.includes(catTopicB.id)) ? 1 : 0;
                return scoreB - scoreA;
              })
              .slice(0, 5)
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
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Save Topic (Target) */}
                        <button
                          disabled={togglingIds.has(topic.id)}
                          onClick={(e) => { e.stopPropagation(); toggleFollow(topic.id); }}
                          className={`p-1.5 rounded-lg transition-all border ${followedIds.includes(topic.id)
                              ? 'bg-indigo-500/15 border-indigo-500/30 hover:bg-slate-800/15'
                              : 'bg-slate-800/50 border-slate-700/50 hover:bg-indigo-500/15'
                            } ${togglingIds.has(topic.id) ? 'opacity-50 keep-cursor' : ''}`}
                          title={followedIds.includes(topic.id) ? 'Unsave Topic' : 'Save Topic'}
                        >
                          {followedIds.includes(topic.id)
                            ? <Target className={`h-4 w-4 text-indigo-400 ${togglingIds.has(topic.id) ? 'animate-pulse' : ''}`} />
                            : <Target className={`h-4 w-4 text-slate-500 hover:text-indigo-400 ${togglingIds.has(topic.id) ? 'animate-pulse' : ''}`} />
                          }
                        </button>

                        {/* Follow Category (Bookmark) */}
                        {(() => {
                          const domain = getTopicDomain(topic.title).domain;
                          const categoryTopic = topics.find(t => t.title.toLowerCase() === domain.toLowerCase());
                          const isCatFollowed = categoryTopic ? followedIds.includes(categoryTopic.id) : false;

                          return (
                            <button
                              disabled={togglingIds.has(categoryTopic?.id)}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (categoryTopic) {
                                  toggleFollow(categoryTopic.id);
                                } else {
                                  // If category topic doesn't exist yet, we can't easily follow it without proposing
                                }
                              }}
                              className={`p-1.5 rounded-lg transition-all border ${isCatFollowed
                                  ? 'bg-amber-500/15 border-amber-500/30 hover:bg-slate-800/15'
                                  : 'bg-slate-800/50 border-slate-700/50 hover:bg-amber-500/15'
                                } ${(!categoryTopic || togglingIds.has(categoryTopic?.id)) ? 'opacity-30 keep-cursor' : ''}`}
                              title={isCatFollowed ? `Unfollow ${domain}` : `Follow ${domain} Category`}
                            >
                              {isCatFollowed
                                ? <BookmarkCheck className={`h-4 w-4 text-amber-400 ${togglingIds.has(categoryTopic?.id) ? 'animate-pulse' : ''}`} />
                                : <Bookmark className={`h-4 w-4 text-slate-500 hover:text-amber-400 ${togglingIds.has(categoryTopic?.id) ? 'animate-pulse' : ''}`} />
                              }
                            </button>
                          );
                        })()}
                      </div>
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
              <div className={`mb-6 px-4 py-3 rounded-lg text-sm font-medium border ${completedFeedback.type === 'success'
                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-500/50 text-rose-300'
                }`}>
                {completedFeedback.text}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              {Object.entries(groupMatches(completedMatches.filter(m => !completedSearchQuery || (m.topic_title || m.topic || '').toLowerCase().includes(completedSearchQuery.toLowerCase()))))
                .map(([title, matches]) => (
                  <div
                    key={`stack-comp-${title}`}
                    onClick={() => handleTopicClick(title, 'completed')}
                    className="group cursor-pointer relative bg-emerald-950/10 border border-emerald-500/20 rounded-xl p-6 flex flex-col h-full hover:border-emerald-500/40 transition-all hover:shadow-[0_0_20px_rgba(16,185,129,0.1)] active:scale-[0.98]"
                  >
                    <div className="absolute top-2 right-2 bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full z-20 animate-pulse">
                      RESOLVED STACK
                    </div>

                    {/* Visual Stack Effect */}
                    <div className="absolute inset-0 bg-emerald-500/5 rounded-xl translate-x-2 translate-y-2 -z-10 border border-emerald-500/10"></div>
                    <div className="absolute inset-0 bg-emerald-500/5 rounded-xl translate-x-4 translate-y-4 -z-20 border border-emerald-500/10"></div>

                    <div className="flex items-center gap-3 mb-2">
                      <Layers className="h-6 w-6 text-emerald-400" />
                      <h3 className="text-xl font-bold text-slate-100 line-clamp-2 flex-1">{title}</h3>
                      <span className={`shrink-0 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${getTopicDomain(title).color}`}>
                        {getTopicDomain(title).domain}
                      </span>
                    </div>

                    <div className="mt-auto flex items-center justify-between">
                      <span className="text-emerald-400 font-bold text-sm tracking-tighter">
                        {matches.length} {matches.length === 1 ? 'COMPLETED ARENA' : 'COMPLETED ARENAS'}
                      </span>
                      <div className="flex items-center gap-1 text-slate-400 group-hover:text-emerald-300 transition-colors">
                        <span className="text-xs font-bold uppercase mr-2">View History</span>

                        {/* Side-by-side icons in Completed stack cards */}
                        {(() => {
                          const domain = getTopicDomain(title).domain;
                          const categoryTopic = topics.find(t => t.title.toLowerCase() === domain.toLowerCase());
                          const specificTopic = topics.find(t => t.title.toLowerCase() === title.toLowerCase());
                          const isCatFollowed = categoryTopic ? followedIds.includes(categoryTopic.id) : false;
                          const isTopicFollowed = specificTopic ? followedIds.includes(specificTopic.id) : false;

                          return (
                            <div className="flex items-center gap-2 mr-2">
                              <button
                                disabled={togglingIds.has(specificTopic?.id)}
                                onClick={(e) => { e.stopPropagation(); if (specificTopic) toggleFollow(specificTopic.id); }}
                                className={`p-1 rounded-md border transition-all ${isTopicFollowed ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400' : 'bg-slate-800 border-slate-700 text-slate-500'} ${togglingIds.has(specificTopic?.id) ? 'opacity-50 keep-cursor' : ''}`}
                                title="Save Topic"
                              >
                                <Target className={`h-3 w-3 ${togglingIds.has(specificTopic?.id) ? 'animate-pulse' : ''}`} />
                              </button>
                              <button
                                disabled={togglingIds.has(categoryTopic?.id)}
                                onClick={(e) => { e.stopPropagation(); if (categoryTopic) toggleFollow(categoryTopic.id); }}
                                className={`p-1 rounded-md border transition-all ${isCatFollowed ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-slate-800 border-slate-700 text-slate-500'} ${togglingIds.has(categoryTopic?.id) ? 'opacity-50 keep-cursor' : ''}`}
                                title={`Follow ${domain}`}
                              >
                                {isCatFollowed ? <BookmarkCheck className={`h-3 w-3 ${togglingIds.has(categoryTopic?.id) ? 'animate-pulse' : ''}`} /> : <Bookmark className={`h-3 w-3 ${togglingIds.has(categoryTopic?.id) ? 'animate-pulse' : ''}`} />}
                              </button>
                            </div>
                          );
                        })()}

                        <ChevronDown className="h-4 w-4" />
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
          <form onSubmit={handleSearchUser} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Enter Socratic ID (e.g. 1ab66dbc...)"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors text-sm sm:text-base"
            />
            <button type="submit" className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold rounded-xl transition-colors cursor-pointer text-sm sm:text-base whitespace-nowrap">
              Search Debater
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
                  <div className="flex items-center gap-2 sm:gap-4">
                    <div className="hidden xs:block">
                      <RankBadge elo={profile.elo_rating || 1000} />
                    </div>
                    <div className="flex items-center gap-1.5 w-[45px] sm:w-[50px] justify-end">
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
        socket={socket}
      />
    </div>
  );
};

export default Explore;
