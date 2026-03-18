import { Swords, Bookmark, BookmarkCheck, Users, Activity, Search, X, Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { getTopicDomain } from '../lib/domainUtils';
import React, { useEffect, useState, useMemo } from 'react';

const MyArena = ({ user }) => {
  const navigate = useNavigate();

  // localStorage-backed state for zero-delay navigation
  const [followedTopics, setFollowedTopics] = useState(() => {
    try { return JSON.parse(localStorage.getItem('myarena_topics')) || []; } catch { return []; }
  });
  const [followIds, setFollowIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('myarena_follow_ids')) || []; } catch { return []; }
  });
  const [topicTotals, setTopicTotals] = useState(() => {
    try { return JSON.parse(localStorage.getItem('myarena_totals')) || {}; } catch { return {}; }
  });
  const [activeUserCounts, setActiveUserCounts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('myarena_counts')) || {}; } catch { return {}; }
  });

  const [activeTab, setActiveTab] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Fetch followed topics
  useEffect(() => {
    if (!user) return;

    const fetchFollows = async () => {
      // 1. Get user's follow relationships
      const { data: follows, error: followError } = await supabase
        .from('topic_follows')
        .select('topic_id')
        .eq('user_id', user.id);

      if (followError) {
        console.error('[MyArena] Follow fetch error:', followError.message);
        return;
      }

      const ids = (follows || []).map(f => f.topic_id);
      setFollowIds(ids);
      localStorage.setItem('myarena_follow_ids', JSON.stringify(ids));

      if (ids.length === 0) {
        setFollowedTopics([]);
        localStorage.setItem('myarena_topics', JSON.stringify([]));
        return;
      }

      // 2. Fetch the actual topics
      const { data: topics, error: topicError } = await supabase
        .from('topics')
        .select('*')
        .in('id', ids)
        .order('created_at', { ascending: false });

      if (!topicError && topics) {
        setFollowedTopics(topics);
        localStorage.setItem('myarena_topics', JSON.stringify(topics));
      }

      // 3. Fetch match counts per topic
      const { data: matchData } = await supabase
        .from('matches')
        .select('topic_title, status')
        .in('status', ['active', 'completed', 'pending_votes']);

      if (matchData) {
        const totals = {};
        matchData.forEach(m => {
          const t = m.topic_title || 'Unknown';
          totals[t] = (totals[t] || 0) + 1;
        });
        setTopicTotals(totals);
        localStorage.setItem('myarena_totals', JSON.stringify(totals));
      }

      // 4. Fetch active user counts
      const { data: liveData } = await supabase
        .from('matches')
        .select('topic_title')
        .eq('status', 'active');

      if (liveData) {
        const counts = {};
        liveData.forEach(m => {
          const t = m.topic_title;
          if (t) counts[t] = (counts[t] || 0) + 2;
        });
        setActiveUserCounts(counts);
        localStorage.setItem('myarena_counts', JSON.stringify(counts));
      }
    };

    fetchFollows();
  }, [user]);

  // Unfollow a topic
  const handleUnfollow = async (topicId) => {
    // Optimistic UI
    setFollowedTopics(prev => prev.filter(t => t.id !== topicId));
    setFollowIds(prev => prev.filter(id => id !== topicId));

    const { error } = await supabase
      .from('topic_follows')
      .delete()
      .eq('user_id', user.id)
      .eq('topic_id', topicId);

    if (error) {
      console.error('[MyArena] Unfollow error:', error.message);
      // Revert on failure — re-fetch
      const { data: follows } = await supabase
        .from('topic_follows')
        .select('topic_id')
        .eq('user_id', user.id);
      const ids = (follows || []).map(f => f.topic_id);
      setFollowIds(ids);
      if (ids.length > 0) {
        const { data: topics } = await supabase.from('topics').select('*').in('id', ids);
        if (topics) setFollowedTopics(topics);
      }
    } else {
      // Sync cache
      localStorage.setItem('myarena_topics', JSON.stringify(followedTopics.filter(t => t.id !== topicId)));
      localStorage.setItem('myarena_follow_ids', JSON.stringify(followIds.filter(id => id !== topicId)));
    }
  };

  // Auto-derive domain tabs from followed topics
  const domainTabs = useMemo(() => {
    const domainSet = new Map();
    followedTopics.forEach(topic => {
      const d = getTopicDomain(topic.title);
      if (!domainSet.has(d.domain)) {
        domainSet.set(d.domain, d);
      }
    });
    return Array.from(domainSet.entries()).map(([domain, info]) => ({
      domain,
      color: info.color,
    }));
  }, [followedTopics]);

  // Filter topics by active tab and search
  const filteredTopics = useMemo(() => {
    let result = followedTopics;

    if (activeTab !== 'ALL') {
      result = result.filter(topic => getTopicDomain(topic.title).domain === activeTab);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(topic => topic.title.toLowerCase().includes(q));
    }

    return result;
  }, [followedTopics, activeTab, searchQuery]);

  const handleEnterLobby = (topic) => {
    navigate(`/lobby/${topic.id}`, { state: { topic } });
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-64px)] bg-[#0b0f19] text-slate-200 p-8">
      <div className="max-w-6xl mx-auto w-full">

        {/* Header */}
        <header className="mb-8">
          <h1 className="text-4xl font-extrabold text-slate-100 flex items-center gap-4">
            <div className="bg-gradient-to-br from-indigo-500 to-cyan-500 p-2.5 rounded-xl shadow-lg shadow-indigo-500/20">
              <Swords className="h-8 w-8 text-white" />
            </div>
            My Arena
          </h1>
          <p className="text-slate-400 mt-3 text-lg">Your personalized battleground. Only the topics you follow.</p>
        </header>

        {/* Subtab Bar */}
        <div className="mb-6">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
            {/* ALL tab */}
            <button
              onClick={() => setActiveTab('ALL')}
              className={`shrink-0 px-5 py-2 rounded-full text-sm font-bold uppercase tracking-wider transition-all duration-200 border ${
                activeTab === 'ALL'
                  ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white border-transparent shadow-lg shadow-indigo-500/30'
                  : 'bg-slate-900/60 text-slate-400 border-slate-700/50 hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              All ({followedTopics.length})
            </button>

            {/* Dynamic domain tabs */}
            {domainTabs.map(tab => {
              const count = followedTopics.filter(t => getTopicDomain(t.title).domain === tab.domain).length;
              return (
                <button
                  key={tab.domain}
                  onClick={() => setActiveTab(tab.domain)}
                  className={`shrink-0 px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all duration-200 border ${
                    activeTab === tab.domain
                      ? `${tab.color} shadow-lg`
                      : 'bg-slate-900/60 text-slate-400 border-slate-700/50 hover:text-slate-200 hover:border-slate-600'
                  }`}
                >
                  {tab.domain} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-8 relative flex items-center">
          <Search className="absolute left-4 h-5 w-5 text-slate-500" />
          <input
            type="text"
            placeholder="Search your followed arenas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl py-3 pl-12 pr-12 text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all text-sm"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-4 p-1 hover:bg-slate-800 rounded-full transition-colors">
              <X className="h-4 w-4 text-slate-400 hover:text-slate-200" />
            </button>
          )}
        </div>

        {/* Topics Grid */}
        {filteredTopics.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredTopics.map((topic) => {
              const domain = getTopicDomain(topic.title);
              return (
                <div
                  key={topic.id}
                  className="bg-slate-900/50 backdrop-blur-md border border-[#1e293b] rounded-2xl p-6 transition-all duration-300 hover:border-cyan-500/40 hover:shadow-[0_0_30px_rgba(34,211,238,0.08)] hover:-translate-y-1 flex flex-col h-full group"
                >
                  {/* Top row: title + domain + unfollow */}
                  <div className="flex justify-between items-start mb-4 gap-3">
                    <h3 className="text-xl font-bold text-slate-100 leading-snug flex-1">
                      {topic.title}
                    </h3>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full border ${domain.color}`}>
                        {domain.domain}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleUnfollow(topic.id); }}
                        className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 hover:bg-red-500/20 hover:border-red-500/30 transition-all group/btn"
                        title="Unfollow"
                      >
                        <BookmarkCheck className="h-4 w-4 text-cyan-400 group-hover/btn:text-red-400 transition-colors" />
                      </button>
                    </div>
                  </div>

                  {/* Stats footer */}
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
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[400px] bg-slate-900/30 border border-dashed border-slate-700/50 rounded-2xl p-12">
            <div className="bg-slate-800/50 p-6 rounded-2xl mb-6">
              <Bookmark className="h-12 w-12 text-slate-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-300 mb-2">
              {searchQuery || activeTab !== 'ALL' ? 'No matching topics found' : 'Your arena is empty'}
            </h3>
            <p className="text-slate-500 text-center max-w-md">
              {searchQuery || activeTab !== 'ALL'
                ? 'Try a different search or switch tabs.'
                : 'Head to Explore to discover arenas and bookmark the ones you want to track.'}
            </p>
            {!searchQuery && activeTab === 'ALL' && (
              <button
                onClick={() => navigate('/explore')}
                className="mt-6 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg shadow-lg shadow-indigo-500/20 transition-colors"
              >
                Explore Topics →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyArena;
