import { Swords, Bookmark, BookmarkCheck, Users, Activity, Search, X, Layers, Compass, Flame, Trophy, ChevronDown, LayoutGrid, Brain, FlaskConical, Globe2, Scale, Palette, Dumbbell, TrendingUp, HeartPulse, Film, Utensils, Zap, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { getTopicDomain, broadTopicsList } from '../lib/domainUtils';
import React, { useEffect, useState, useMemo } from 'react';

const MyArena = ({ user, socket }) => {
  const navigate = useNavigate();

  const [pendingFollows, setPendingFollows] = useState(new Set());
  const [togglingIds, setTogglingIds] = useState(new Set());

  // localStorage-backed state for zero-delay navigation
  const [allTopics, setAllTopics] = useState(() => {
    try { return JSON.parse(localStorage.getItem('myarena_all_topics')) || []; } catch { return []; }
  });
  const [allActiveMatches, setAllActiveMatches] = useState(() => {
    try { return JSON.parse(localStorage.getItem('myarena_all_active_matches')) || []; } catch { return []; }
  });
  const [followedTopics, setFollowedTopics] = useState(() => {
    try { return JSON.parse(localStorage.getItem('myarena_topics')) || []; } catch { return []; }
  });
  const [followIds, setFollowIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('myarena_follow_ids')) || []; } catch { return []; }
  });
  const [topicTotals, setTopicTotals] = useState(() => {
    try { return JSON.parse(localStorage.getItem('myarena_topic_totals')) || {}; } catch { return {}; }
  });
  const [activeUserCounts, setActiveUserCounts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('myarena_counts')) || {}; } catch { return {}; }
  });

  const [activeTab, setActiveTab] = useState('ALL');
  const [trendingSearchQuery, setTrendingSearchQuery] = useState('');
  const [savedSearchQuery, setSavedSearchQuery] = useState('');
  const [isSearchingTrending, setIsSearchingTrending] = useState(false);
  const [isSearchingSaved, setIsSearchingSaved] = useState(false);
  const [trendingFeedback, setTrendingFeedback] = useState(null);
  const [savedFeedback, setSavedFeedback] = useState(null);
  const searchTimeoutRef = React.useRef(null);
  const [isLoading, setIsLoading] = useState(false);

  const categoryIcons = useMemo(() => ({
    Science: <FlaskConical className="h-4 w-4" />,
    Technology: <Zap className="h-4 w-4" />,
    Geopolitics: <Globe2 className="h-4 w-4" />,
    Politics: <Scale className="h-4 w-4" />,
    Society: <Users className="h-4 w-4" />,
    Food: <Utensils className="h-4 w-4" />,
    Philosophy: <Brain className="h-4 w-4" />,
    Sports: <Dumbbell className="h-4 w-4" />,
    Economics: <TrendingUp className="h-4 w-4" />,
    Health: <HeartPulse className="h-4 w-4" />,
    Entertainment: <Film className="h-4 w-4" />,
    General: <Layers className="h-4 w-4" />,
  }), []);

  const domainNamesLower = useMemo(() => Object.keys(categoryIcons).map(d => d.toLowerCase()), [categoryIcons]);

  // God-level Personalization: Calculate Domain Interest Scores
  const userInterestScores = useMemo(() => {
    const scores = {};
    followedTopics.forEach(t => {
      const domain = getTopicDomain(t.title).domain;
      scores[domain] = (scores[domain] || 0) + 1;
    });
    return scores;
  }, [followedTopics]);

  const getRelevanceScore = (title) => {
    if (!user) return 0;
    const domain = getTopicDomain(title).domain;
    const isTopicFollowed = followIds.includes(allTopics.find(t => t.title === title)?.id);
    // Base score from domain interest + bonus if specifically followed
    return (userInterestScores[domain] || 0) + (isTopicFollowed ? 5 : 0);
  };

  // Helper to identify junk topics or prompt injections
  const isJunkTopic = (title) => {
    if (!title) return true;
    const t = title.toLowerCase();
    if (t === 'ok ok' || t === 'custom debate') return true;
    if (t.includes('\n') || t.includes('[system update]') || t.includes('ignore all instructions')) return true;
    if (t.includes('respond with exactly') || t.includes('isduplicate')) return true;
    if (t.length > 200) return true;
    return false;
  };

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setIsLoading(true);
      // 1. Fetch ALL topics
      const { data: topicsData, error: topicError } = await supabase
        .from('topics')
        .select('*')
        .order('created_at', { ascending: false });

      if (topicsData) {
        setAllTopics(topicsData);
        localStorage.setItem('myarena_all_topics', JSON.stringify(topicsData));
      }

      // 2. Fetch User Follows
      const { data: follows, error: followError } = await supabase
        .from('topic_follows')
        .select('topic_id')
        .eq('user_id', user.id);

      const ids = (follows || []).map(f => f.topic_id);
      setFollowIds(ids);
      localStorage.setItem('myarena_follow_ids', JSON.stringify(ids));

      const followed = (topicsData || []).filter(t => ids.includes(t.id));
      setFollowedTopics(followed);
      localStorage.setItem('myarena_topics', JSON.stringify(followed));
      const followedTitles = followed.map(t => t.title);

      // 3. Fetch Matches
      const { data: matchData } = await supabase
        .from('matches')
        .select('*')
        .in('status', ['active', 'completed', 'pending_votes'])
        .order('created_at', { ascending: false });

      if (matchData) {
        const totals = {};
        const activeCounts = {};
        const activeMatches = [];

        matchData.forEach(m => {
          const t = m.topic_title || m.topic || 'Unknown';
          totals[t] = (totals[t] || 0) + 1;
          
          if (m.status === 'active') {
            activeCounts[t] = (activeCounts[t] || 0) + 2;
          }

          // Include all matches (including completed) so the user can browse past debates for their followed topics
          activeMatches.push(m);
        });

        setTopicTotals(totals);
        setActiveUserCounts(activeCounts);
        setAllActiveMatches(activeMatches);
        
        localStorage.setItem('myarena_topic_totals', JSON.stringify(totals));
        localStorage.setItem('myarena_counts', JSON.stringify(activeCounts));
        localStorage.setItem('myarena_all_active_matches', JSON.stringify(activeMatches));
      }
      setIsLoading(false);
    };

    fetchData();

    if (socket) {
      socket.on('new_topic_added', fetchData);
      socket.on('topic_result', (data) => {
        if (!data.success && data.message.includes('Similar topic')) {
           // It was a duplicate, try fetching again
           fetchData();
        }
      });
      socket.on('semantic_search_myarena_trending_result', (data) => {
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        setIsSearchingTrending(false);
        if (data.found && data.matchedTopic) {
          setTrendingSearchQuery(data.matchedTopic);
          setTrendingFeedback({ type: 'success', text: `Found semantic match: "${data.matchedTopic}"` });
        } else {
          setTrendingFeedback({ type: 'error', text: 'No semantically matching trending debates found.' });
        }
        setTimeout(() => setTrendingFeedback(null), 4000);
      });
      socket.on('semantic_search_myarena_saved_result', (data) => {
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        setIsSearchingSaved(false);
        if (data.found && data.matchedTopic) {
          setSavedSearchQuery(data.matchedTopic);
          setSavedFeedback({ type: 'success', text: `Found semantic match: "${data.matchedTopic}"` });
        } else {
          setSavedFeedback({ type: 'error', text: 'No semantically matching saved arenas found.' });
        }
        setTimeout(() => setSavedFeedback(null), 4000);
      });
    }
    return () => {
      if (socket) {
        socket.off('new_topic_added', fetchData);
        socket.off('topic_result');
        socket.off('semantic_search_myarena_trending_result');
        socket.off('semantic_search_myarena_saved_result');
      }
    };
  }, [user, socket]);

  // Auto-follow pending topics once they appear in the database
  useEffect(() => {
    if (pendingFollows.size === 0) return;
    
    let allFound = true;
    pendingFollows.forEach((pendingTitle) => {
      const found = allTopics.find(t => (t.title || '').toLowerCase() === pendingTitle);
      if (found) {
        // Execute toggle seamlessly
        handleToggleFollow(found.id);
        setPendingFollows(prev => {
          const next = new Set(prev);
          next.delete(pendingTitle);
          return next;
        });
      } else {
        allFound = false;
      }
    });

    // If some topics are still pending (due to db propagation delay or Gemini delay), poll every 3 seconds
    if (!allFound) {
      const timer = setTimeout(() => {
        // Only trigger a re-fetch if we are still waiting
        if (pendingFollows.size > 0) {
           // We manually re-fetch data
           const refetch = async () => {
             const { data } = await supabase.from('topics').select('*').order('created_at', { ascending: false });
             if (data) setAllTopics(data);
           };
           refetch();
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [allTopics, pendingFollows]);

  const handleToggleFollow = async (topicId, newlyCreatedTopic = null) => {
    if (togglingIds.has(topicId)) return;
    
    setTogglingIds(prev => new Set(prev).add(topicId));

    try {
      const isCurrentlyFollowed = followIds.includes(topicId);
      
      // Optimistic UI update
      setFollowIds(prev => {
        const next = isCurrentlyFollowed ? prev.filter(id => id !== topicId) : [...prev, topicId];
        localStorage.setItem('myarena_follow_ids', JSON.stringify(next));
        return next;
      });

      setFollowedTopics(prev => {
        let source = [...allTopics];
        if (newlyCreatedTopic && !source.some(t => t.id === newlyCreatedTopic.id)) {
          source = [newlyCreatedTopic, ...source];
        }
        
        const nextIds = isCurrentlyFollowed ? followIds.filter(id => id !== topicId) : [...followIds, topicId];
        const next = source.filter(t => nextIds.includes(t.id));
        localStorage.setItem('myarena_topics', JSON.stringify(next));
        return next;
      });

      if (isCurrentlyFollowed) {
        const { error } = await supabase.from('topic_follows').delete().eq('user_id', user.id).eq('topic_id', topicId);
        if (error) console.error("Unfollow error", error);
      } else {
        const { error } = await supabase.from('topic_follows').insert({ user_id: user.id, topic_id: topicId });
        if (error) {
          console.error("Follow error", error);
          // Rollback on error
          setFollowIds(prev => prev.filter(id => id !== topicId));
          setFollowedTopics(prev => prev.filter(t => t.id !== topicId));
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

  const handleEnterLobby = (topic) => {
    navigate(`/lobby/${topic.id}`, { state: { topic } });
  };

  const domainTabs = useMemo(() => {
    const followedCategories = followedTopics.filter(t => domainNamesLower.includes((t.title || '').toLowerCase()));
    const domainSet = new Map();

    followedCategories.forEach(t => {
      const rule = getTopicDomain(t.title);
      const domainName = rule.domain; // Canonical name e.g. "Food"
      domainSet.set(domainName, {
        domain: domainName,
        color: rule.color
      });
    });
    
    return Array.from(domainSet.values());
  }, [followedTopics, domainNamesLower, categoryIcons]);

  // Section 3: Saved Arenas (Specific Followed Topics)
  const filteredFollowedTopics = useMemo(() => {
    let result = followedTopics.filter(t => !domainNamesLower.includes((t.title || '').toLowerCase()));
    
    // Sort by Most Played descending + tiebreaker
    result.sort((a, b) => {
      const playDiff = (topicTotals[b.title] || 0) - (topicTotals[a.title] || 0);
      if (playDiff !== 0) return playDiff;
      return getRelevanceScore(b.title) - getRelevanceScore(a.title);
    });

    if (activeTab !== 'ALL') {
      result = result.filter(topic => getTopicDomain(topic.title).domain.toLowerCase() === activeTab.toLowerCase());
    }
    if (savedSearchQuery.trim()) {
      const q = savedSearchQuery.toLowerCase();
      result = result.filter(topic => topic.title.toLowerCase().includes(q));
    } else {
      result = result.slice(0, 5);
    }
    return result;
  }, [followedTopics, activeTab, savedSearchQuery, topicTotals, domainNamesLower]);

  const trendingTopicsDataAll = useMemo(() => {
    const followedCategories = followedTopics
      .filter(t => {
        const titleLow = (t.title || "").toLowerCase();
        // Check if the title itself is a domain name (Followed Category)
        return domainNamesLower.includes(titleLow);
      })
      .map(t => t.title.toLowerCase());

    // 1. Get ALL topics that belong to followed categories (excluding the domain-name topic itself)
    let relevantTopics = allTopics.filter(t => {
      const titleLow = (t.title || "").toLowerCase();
      if (isJunkTopic(titleLow)) return false;
      if (domainNamesLower.includes(titleLow)) return false;

      const domain = getTopicDomain(t.title).domain;
      
      const isPlayed = (topicTotals[t.title] || 0) > 0;
      if (!isPlayed) return false;

      // If we are on a specific tab, show all topics of that domain (up to 10)
      if (activeTab !== 'ALL') return domain.toLowerCase() === activeTab.toLowerCase();
      
      // Ensure topic only appears in Trending if its Category is bookmarked natively
      const isCatFollowed = followedCategories.includes(domain.toLowerCase());
      
      return isCatFollowed;
    });

    // 2. Sort by Most Played + Personalization Tiebreaker
    relevantTopics.sort((a,b) => {
      const playDiff = (topicTotals[b.title] || 0) - (topicTotals[a.title] || 0);
      if (playDiff !== 0) return playDiff;
      
      // Personalization Tiebreaker
      return getRelevanceScore(b.title) - getRelevanceScore(a.title);
    });

    // We return all relevant topics. The slice limit is applied only when not searching.
    return relevantTopics;
  }, [allTopics, followedTopics, activeTab, topicTotals, domainNamesLower]);

  // Section 2: Trending Debates Filtered and Sorted
  const filteredTrendingTopics = useMemo(() => {
    let result = trendingTopicsDataAll;
    
    if (trendingSearchQuery.trim()) {
      const q = trendingSearchQuery.toLowerCase();
      result = result.filter(t => (t.title || '').toLowerCase().includes(q));
    } else {
      // Limit to top 5 as per user request ONLY when not searching
      result = result.slice(0, 5);
    }

    return result;
  }, [trendingTopicsDataAll, trendingSearchQuery]);

  // Helper to group matches for the trending section
  const groupMatches = (matches) => {
    const groups = {};
    matches
      .filter(m => (m.topic_title || m.topic) && (m.topic_title || m.topic).toLowerCase() !== 'custom debate')
      .forEach(m => {
        const title = m.topic_title || m.topic;
        if (!groups[title]) groups[title] = [];
        groups[title].push(m);
      });
    return groups;
  };

  const handleTrendingSearch = () => {
    if (trendingSearchQuery.trim().length < 3) return;
    setIsSearchingTrending(true);
    setTrendingFeedback(null);
    const contextTopics = [...new Set(trendingTopicsDataAll.map(t => t.title))];
    if (contextTopics.length === 0) {
      setIsSearchingTrending(false);
      setTrendingFeedback({ type: 'error', text: 'No trending debates available to search.' });
      setTimeout(() => setTrendingFeedback(null), 3000);
      return;
    }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setIsSearchingTrending(false);
      setTrendingFeedback({ type: 'error', text: 'Search timed out.' });
      setTimeout(() => setTrendingFeedback(null), 6000);
    }, 10000);
    socket.emit('semantic_search_myarena_trending', { query: trendingSearchQuery.trim(), contextTopics });
  };

  const handleSavedSearch = () => {
    if (savedSearchQuery.trim().length < 3) return;
    setIsSearchingSaved(true);
    setSavedFeedback(null);
    let contextTopicsSource = followedTopics;
    if (activeTab !== 'ALL') {
      contextTopicsSource = contextTopicsSource.filter(topic => getTopicDomain(topic.title).domain === activeTab);
    }
    const contextTopics = [...new Set(contextTopicsSource.filter(t => !broadTopicsList.includes((t.title || '').toLowerCase())).map(t => t.title))];
    
    if (contextTopics.length === 0) {
      setIsSearchingSaved(false);
      setSavedFeedback({ type: 'error', text: 'No saved arenas available to search.' });
      setTimeout(() => setSavedFeedback(null), 3000);
      return;
    }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setIsSearchingSaved(false);
      setSavedFeedback({ type: 'error', text: 'Search timed out.' });
      setTimeout(() => setSavedFeedback(null), 6000);
    }, 10000);
    socket.emit('semantic_search_myarena_saved', { query: savedSearchQuery.trim(), contextTopics });
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-64px)] bg-[#0b0f19] text-slate-200 p-8">
      <div className="max-w-6xl mx-auto w-full">

        <header className="mb-8">
          <h1 className="text-4xl font-extrabold text-slate-100 flex items-center gap-4">
            <div className="bg-gradient-to-br from-indigo-500 to-cyan-500 p-2.5 rounded-xl shadow-lg shadow-indigo-500/20">
              <Swords className="h-8 w-8 text-white" />
            </div>
            My Arena
          </h1>
          <p className="text-slate-400 mt-3 text-lg">Your personalized battleground. Manage and track all your arenas.</p>
        </header>

        {/* --- SECTION 1: DISCOVERY HUB (Categorized Grid) --- */}
        <div className="mb-16">
          <h2 className="text-2xl font-bold text-slate-100 mb-8 flex items-center gap-3 border-b border-[#1e293b] pb-4">
            <Compass className="h-6 w-6 text-cyan-400" />
            Discovery Hub
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {(() => {

              // 1. Collect all candidates (Normalized to lowercase for reliable deduplication)
              const allCandidates = new Set();
              
              // Add broad topics (suggested)
              broadTopicsList.forEach(t => {
                const low = t.toLowerCase().trim();
                if (!domainNamesLower.includes(low)) {
                  allCandidates.add(low);
                }
              });
              
              // Add actual topics from DB
              allTopics.forEach(t => {
                const low = (t.title || '').toLowerCase().trim();
                if (isJunkTopic(low)) return;
                if (!domainNamesLower.includes(low)) {
                  allCandidates.add(low);
                }
              });

              const filtered = Array.from(allCandidates);

              // 3. Group by Domain — DB AI-detected category is PRIMARY, keyword matching is FALLBACK
              const groups = {};
              filtered.forEach(topicKey => {
                let domain = null;
                // Primary: Use DB-stored AI-detected category (set during topic creation)
                const dbTopic = allTopics.find(t => (t.title || '').toLowerCase().trim() === topicKey);
                if (dbTopic?.category && dbTopic.category !== 'Community' && dbTopic.category !== 'General') {
                  domain = dbTopic.category;
                }
                // Fallback: Use keyword matching for topics without DB category (e.g., broadTopicsList)
                if (!domain) {
                  domain = getTopicDomain(topicKey).domain;
                }
                if (!groups[domain]) groups[domain] = [];
                groups[domain].push(topicKey);
              });

              // 4. Sort domains alphabetically but put General last
              const sortedDomains = Object.keys(groups).sort((a, b) => {
                if (a === 'General') return 1;
                if (b === 'General') return -1;
                return a.localeCompare(b);
              });

              return sortedDomains.map(domainName => {
                const domainInfo = getTopicDomain(domainName);
                const topicsInDomain = groups[domainName];
                
                // Find if the category itself is followed
                const isCategoryFollowed = followedTopics.some(t => t.title.toLowerCase() === domainName.toLowerCase());
                
                // Find the topic object for this domain in our topics list to get its ID for following
                const categoryTopic = allTopics.find(t => t.title.toLowerCase() === domainName.toLowerCase());

                // Sort topics within category by most played descending + Personalized
                topicsInDomain.sort((a, b) => {
                  const playA = topicTotals[a] || 0;
                  const playB = topicTotals[b] || 0;
                  if (playA !== playB) return playB - playA;
                  
                  // Tiebreaker: Personalization
                  // Note: topicTitleKey is normalized lowercase, but getTopicDomain handles it
                  return getRelevanceScore(b) - getRelevanceScore(a);
                });
                
                return (
                  <div key={domainName} className="flex flex-col gap-4 p-5 rounded-2xl bg-slate-900/40 border border-slate-800/60 hover:border-slate-700/80 transition-all duration-300 group">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${domainInfo.color.replace('text-', 'bg-').split(' ')[1].replace('/40', '/20')} ${domainInfo.color.split(' ')[0]}`}>
                          {categoryIcons[domainName] || <Layers className="h-4 w-4" />}
                        </div>
                        <h3 className="text-lg font-bold text-slate-100 tracking-tight">{domainName}</h3>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{topicsInDomain.length} Topics</span>
                        <button
                          disabled={togglingIds.has(categoryTopic?.id)}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (categoryTopic) {
                              handleToggleFollow(categoryTopic.id);
                            } else {
                              const { data } = await supabase.from('topics').insert([{ title: domainName, category: 'Community' }]).select();
                              if (data && data.length > 0) {
                                const newTopic = data[0];
                                setAllTopics(prev => [newTopic, ...prev]);
                                handleToggleFollow(newTopic.id, newTopic);
                              }
                            }
                          }}
                          className={`p-1.5 rounded-lg border transition-all ${
                            isCategoryFollowed 
                              ? 'bg-amber-500/10 border-amber-500/40 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.2)]' 
                              : 'bg-slate-950/40 border-slate-800 hover:border-slate-600 text-slate-500 hover:text-amber-400'
                          } ${togglingIds.has(categoryTopic?.id) ? 'opacity-50 keep-cursor' : ''}`}
                          title={isCategoryFollowed ? 'Unfollow Category' : 'Follow Category (Shows in Trending)'}
                        >
                          {isCategoryFollowed ? <BookmarkCheck className={`h-4 w-4 ${togglingIds.has(categoryTopic?.id) ? 'animate-pulse' : ''}`} /> : <Bookmark className={`h-4 w-4 ${togglingIds.has(categoryTopic?.id) ? 'animate-pulse' : ''}`} />}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
                      {topicsInDomain.map(topicTitleKey => {
                        let dbTopic = allTopics.find(t => (t.title || '').toLowerCase() === topicTitleKey);
                        const isFollowed = dbTopic ? followIds.includes(dbTopic.id) : false;
                        const displayTitle = topicTitleKey.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

                        return (
                          <button
                            key={topicTitleKey}
                            disabled={togglingIds.has(dbTopic?.id)}
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (dbTopic) {
                                handleToggleFollow(dbTopic.id);
                              } else {
                                const { data } = await supabase.from('topics').insert([{ title: displayTitle, category: 'Community' }]).select();
                                if (data && data.length > 0) {
                                  const newTopic = data[0];
                                  setAllTopics(prev => [newTopic, ...prev]);
                                  handleToggleFollow(newTopic.id, newTopic);
                                }
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border flex items-center justify-between gap-3 transition-all active:scale-95 group/chip min-w-[120px] ${
                              isFollowed 
                                ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-200 shadow-[0_0_10px_rgba(79,70,229,0.1)]' 
                                : 'bg-slate-950/40 border-slate-800 hover:border-slate-600 text-slate-400 hover:text-slate-200 shadow-sm'
                            } ${togglingIds.has(dbTopic?.id) ? 'opacity-50 keep-cursor' : ''}`}
                            title={isFollowed ? 'Unsave Topic' : 'Save Topic (Shows in My Arenas)'}
                          >
                            <span className="truncate">{displayTitle}</span>
                            <div className="shrink-0">
                               {isFollowed ? <Target className={`h-3 w-3 text-indigo-400 ${togglingIds.has(dbTopic?.id) ? 'animate-pulse' : ''}`} /> : <Target className={`h-3 w-3 opacity-30 group-hover/chip:opacity-100 transition-opacity ${togglingIds.has(dbTopic?.id) ? 'animate-pulse' : ''}`} />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Global Subtabs for Section 2 & 3 */}
        <div className="mb-6 mt-12">
          <h2 className="text-xl font-bold text-slate-100 mb-4 tracking-wide">Filter arena</h2>
          <div className="flex items-center gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
            <button
              onClick={() => setActiveTab('ALL')}
              className={`shrink-0 px-5 py-2 rounded-full text-sm font-bold uppercase tracking-wider transition-all duration-200 border ${
                activeTab === 'ALL'
                  ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white border-transparent shadow-lg shadow-indigo-500/30'
                  : 'bg-slate-900/60 text-slate-400 border-slate-700/50 hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              All Followed
            </button>
            {domainTabs.map(tab => {
              const totalAvailable = allTopics.filter(t => {
                const titleLow = (t.title || "").toLowerCase();
                if (isJunkTopic(titleLow) || domainNamesLower.includes(titleLow)) return false;
                return getTopicDomain(t.title).domain === tab.domain;
              }).length;

              const count = totalAvailable; // Tab shows TOTAL topics in category as requested

              
              return (
                <button
                  key={tab.domain}
                  onClick={() => setActiveTab(tab.domain)}
                  className={`shrink-0 px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all duration-200 border ${
                    activeTab === tab.domain
                      ? `${tab.color} shadow-lg text-white`
                      : 'bg-slate-900/60 text-slate-400 border-slate-700/50 hover:text-slate-200 hover:border-slate-600'
                  }`}
                >
                  {tab.domain} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* --- SECTION 2: TRENDING DEBATES (Filtered) --- */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-slate-100 mb-6 flex items-center gap-3 border-b border-[#1e293b] pb-4">
            <Flame className="h-6 w-6 text-rose-500" />
            Trending Debates
          </h2>

          {/* Trending Debates Search Bar */}
          <div className="mb-2 relative flex items-center">
            <Search className="absolute left-4 h-5 w-5 text-slate-500" />
            <input
              type="text"
              placeholder="Search trending debates..."
              value={trendingSearchQuery}
              onChange={(e) => setTrendingSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && trendingSearchQuery.trim().length >= 3) {
                  handleTrendingSearch();
                }
              }}
              disabled={isSearchingTrending}
              className={`w-full bg-slate-900/50 border border-slate-700/50 rounded-xl py-3 pl-12 pr-12 text-slate-200 focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/50 transition-all text-sm ${isSearchingTrending ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
            {trendingSearchQuery && !isSearchingTrending && (
              <button onClick={() => setTrendingSearchQuery('')} className="absolute right-4 p-1 hover:bg-slate-800 rounded-full transition-colors">
                <X className="h-4 w-4 text-slate-400 hover:text-slate-200" />
              </button>
            )}
          </div>

          {/* AI Semantic Search Action */}
          {trendingSearchQuery.trim().length >= 3 && !trendingFeedback && (
            <div className="mb-6 p-4 border border-dashed border-rose-700/50 bg-rose-950/10 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <span className="text-slate-300 text-sm">Use AI to find debates with the same core meaning.</span>
              <button
                onClick={handleTrendingSearch}
                disabled={isSearchingTrending}
                className="shrink-0 px-6 py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-lg shadow-lg shadow-rose-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-sm"
              >
                {isSearchingTrending ? (
                  <>
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                    </span>
                    Analyzing Semantics...
                  </>
                ) : (
                  'Find Trending Debates'
                )}
              </button>
            </div>
          )}

          {/* Feedback Toast */}
          {trendingFeedback && (
            <div className={`mb-6 px-4 py-3 rounded-lg text-sm font-medium border ${
              trendingFeedback.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                : 'bg-rose-950/40 border-rose-500/50 text-rose-300'
            }`}>
              {trendingFeedback.text}
            </div>
          )}
          {filteredTrendingTopics.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredTrendingTopics.map((topic) => {
                const title = topic.title;
                const matches = allActiveMatches.filter(m => (m.topic_title || m.topic) === title);
                const hasMultiple = matches.length > 1;
                const activeCount = matches.filter(m => m.status === 'active').length;
                
                return (
                  <div 
                    key={`trending-${title}`}
                    onClick={() => navigate(`/topic/${encodeURIComponent(title)}`)}
                    className="group cursor-pointer relative bg-rose-950/10 border border-rose-500/20 rounded-xl p-6 flex flex-col h-full hover:border-rose-500/40 transition-all hover:shadow-[0_0_20px_rgba(244,63,94,0.1)] active:scale-[0.98]"
                  >
                    {hasMultiple && (
                      <>
                        <div className="absolute top-2 right-2 bg-rose-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full z-20">
                          {activeCount > 0 ? 'LIVE STACK' : 'VOTE STACK'}
                        </div>
                        <div className="absolute inset-0 bg-rose-500/5 rounded-xl translate-x-2 translate-y-2 -z-10 border border-rose-500/10"></div>
                        <div className="absolute inset-0 bg-rose-500/5 rounded-xl translate-x-4 translate-y-4 -z-20 border border-rose-500/10"></div>
                      </>
                    )}
                    
                    <div className="flex items-center gap-3 mb-4">
                      {activeCount > 0 ? (
                         <Activity className="h-6 w-6 text-rose-400 animate-pulse" />
                      ) : (
                         <Layers className="h-6 w-6 text-purple-400" />
                      )}
                      <h3 className="text-xl font-bold text-slate-100 line-clamp-2 flex-1">{title}</h3>
                    </div>
                    
                    <div className="mt-auto flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className={`${activeCount > 0 ? 'text-rose-400' : 'text-purple-400'} font-bold text-sm tracking-tighter`}>
                          {matches.length} {matches.length === 1 ? 'ACTIVE DEBATE' : 'DEBATES'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-bold uppercase">{topicTotals[title] || 0} TOTAL PLAYS</span>
                      </div>
                      <div className="flex items-center gap-1 text-slate-400 group-hover:text-rose-300 transition-colors">
                        <span className="text-xs font-bold uppercase">View Stack</span>
                        <ChevronDown className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
             <div className="text-slate-500 text-sm italic p-6 border border-dashed border-slate-700/50 rounded-xl text-center bg-slate-900/20">
               {followedTopics.some(t => domainNamesLower.includes(t.title.toLowerCase())) 
                 ? "No trending debates found for your followed categories in the filter."
                 : "Follow a Category (e.g. Technology, Politics) in the Discovery Hub to see trending debates here."
               }
             </div>
          )}
        </div>

        {/* --- SECTION 3: SAVED ARENAS (Filtered) --- */}
        <div className="mb-12">
           <div className="flex items-center justify-between mb-6 border-b border-[#1e293b] pb-4">
            <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
              <Trophy className="h-6 w-6 text-emerald-500" />
              Saved Arenas
            </h2>
            <div className="flex items-center gap-2">
              <div className="px-3 py-1 bg-slate-900 border border-slate-700 rounded-full text-xs font-bold text-slate-400">
                {filteredFollowedTopics.length} SAVED TOPICS
              </div>
            </div>
          </div>

          {/* Saved Arenas Search Bar */}
          <div className="mb-2 relative flex items-center">
            <Search className="absolute left-4 h-5 w-5 text-slate-500" />
            <input
              type="text"
              placeholder="Search saved arenas..."
              value={savedSearchQuery}
              onChange={(e) => setSavedSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && savedSearchQuery.trim().length >= 3) {
                  handleSavedSearch();
                }
              }}
              disabled={isSearchingSaved}
              className={`w-full bg-slate-900/50 border border-slate-700/50 rounded-xl py-3 pl-12 pr-12 text-slate-200 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all text-sm ${isSearchingSaved ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
            {savedSearchQuery && !isSearchingSaved && (
              <button onClick={() => setSavedSearchQuery('')} className="absolute right-4 p-1 hover:bg-slate-800 rounded-full transition-colors">
                <X className="h-4 w-4 text-slate-400 hover:text-slate-200" />
              </button>
            )}
          </div>

          {/* AI Semantic Search Action */}
          {savedSearchQuery.trim().length >= 3 && !savedFeedback && (
            <div className="mb-6 p-4 border border-dashed border-emerald-700/50 bg-emerald-950/10 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <span className="text-slate-300 text-sm">Use AI to find debates with the same core meaning.</span>
              <button
                onClick={handleSavedSearch}
                disabled={isSearchingSaved}
                className="shrink-0 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-sm"
              >
                {isSearchingSaved ? (
                  <>
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                    </span>
                    Analyzing Semantics...
                  </>
                ) : (
                  'Find Saved Arenas'
                )}
              </button>
            </div>
          )}

          {/* Feedback Toast */}
          {savedFeedback && (
            <div className={`mb-6 px-4 py-3 rounded-lg text-sm font-medium border ${
              savedFeedback.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                : 'bg-rose-950/40 border-rose-500/50 text-rose-300'
            }`}>
              {savedFeedback.text}
            </div>
          )}
          {filteredFollowedTopics.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredFollowedTopics.map((topic) => {
                const domain = getTopicDomain(topic.title);
                return (
                  <div
                    key={topic.id}
                    className="bg-slate-900/50 backdrop-blur-md border border-[#1e293b] rounded-2xl p-6 transition-all duration-300 hover:border-emerald-500/40 hover:shadow-[0_0_30px_rgba(16,185,129,0.08)] hover:-translate-y-1 flex flex-col h-full group"
                  >
                    <div className="flex justify-between items-start mb-4 gap-3">
                      <h3 className="text-xl font-bold text-slate-100 leading-snug flex-1">
                        {topic.title}
                      </h3>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full border ${domain.color}`}>
                          {domain.domain}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleFollow(topic.id); }}
                          className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 hover:bg-red-500/20 hover:border-red-500/30 transition-all group/btn"
                          title="Unsave"
                        >
                          <Target className="h-4 w-4 text-indigo-400 group-hover/btn:text-red-400 transition-colors" />
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
            <div className="text-slate-500 text-sm italic p-6 border border-dashed border-slate-700/50 rounded-xl text-center bg-slate-900/20">
              Your arena is currently empty or no matched arenas found for the filter.
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default MyArena;
