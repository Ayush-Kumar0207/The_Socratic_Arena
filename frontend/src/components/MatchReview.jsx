import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { ArrowLeft, User, Clock, Trophy, Vote, BarChart3, Target, Play, Square, Loader2, Share2, Download, Sparkles, Quote } from 'lucide-react';
import html2canvas from 'html2canvas';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const MatchReview = () => {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const [match, setMatch] = useState(null);
  const ENABLE_AI_HIGHLIGHTS = false; // Toggle to true to reveal highlights section
  const [loading, setLoading] = useState(true);
  const [hasVoted, setHasVoted] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [popularTopics, setPopularTopics] = useState([]);
  const [displayedTranscript, setDisplayedTranscript] = useState([]);
  const isPlayingRef = useRef(false);
  const messagesEndRef = useRef(null);
  const [exportingId, setExportingId] = useState(null);

  // Memoize the chart data to prevent flickering
  const radarData = useMemo(() => {
    if (!match?.ai_scores) return [];
    
    // Helper to extract numeric score safely
    const getScore = (player, metric) => {
      const val = player?.[metric.toLowerCase()] ?? player?.[metric] ?? 0;
      return Number(val) || 0;
    };

    return [
      {
        subject: 'Logic',
        Critic: getScore(match.ai_scores.critic, 'Logic'),
        Defender: getScore(match.ai_scores.defender, 'Logic'),
        fullMark: 10
      },
      {
        subject: 'Facts',
        Critic: getScore(match.ai_scores.critic, 'Facts'),
        Defender: getScore(match.ai_scores.defender, 'Facts'),
        fullMark: 10
      },
      {
        subject: 'Relevance',
        Critic: getScore(match.ai_scores.critic, 'Relevance'),
        Defender: getScore(match.ai_scores.defender, 'Relevance'),
        fullMark: 10
      },
    ];
  }, [match?.ai_scores]);

  // Block the chart from re-rendering unless the data actually changes
  const memoizedRadarChart = useMemo(() => (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
        <PolarGrid stroke="#334155" />
        <PolarAngleAxis 
          dataKey="subject" 
          tick={{ fill: '#94a3b8', fontSize: 14, fontWeight: 500 }} 
        />
        <PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} />
        <Radar name="Critic" dataKey="Critic" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.5} isAnimationActive={false} />
        <Radar name="Defender" dataKey="Defender" stroke="#6366f1" fill="#6366f1" fillOpacity={0.5} isAnimationActive={false} />
      </RadarChart>
    </ResponsiveContainer>
  ), [radarData]);

  const exportHighlight = async (index) => {
    setExportingId(index);
    try {
      const element = document.getElementById(`highlight-card-${index}`);
      if (!element) return;
      
      const canvas = await html2canvas(element, {
        backgroundColor: '#020617', // Match slate-950 background
        scale: 2, 
        logging: false,
        useCORS: true
      });
      
      const image = canvas.toDataURL('image/png', 1.0);
      const link = document.createElement('a');
      link.download = `SocraticArena_Highlight_${index + 1}.png`;
      link.href = image;
      link.click();
    } catch (err) {
      console.error("Failed to export highlight:", err);
      alert("Failed to export highlight image.");
    } finally {
      setExportingId(null);
    }
  };

  const fetchVotes = async (matchIdArg, userIdArg) => {
    const targetMatchId = matchIdArg || matchId;
    const { data: voteData, error: voteError } = await supabase
      .from('votes')
      .select('*')
      .eq('match_id', targetMatchId)
      .eq('voter_id', userIdArg || currentUser?.id);
    if (voteData?.length > 0 && !voteError) {
      setHasVoted(true);
    }
    // Re-fetch match to get the latest aggregated vote counts
    const { data: freshMatch } = await supabase.from('matches').select('*').eq('id', targetMatchId).single();
    if (freshMatch) setMatch(freshMatch);
  };

  const fetchPopularTopics = async () => {
    try {
      console.log('🔍 [POPULAR TOPICS] Fetching popular topics...');

      // Count matches per topic (including active matches)
      const { data: topicCounts, error } = await supabase
        .from('matches')
        .select('topic_title, status')
        .in('status', ['active', 'completed', 'pending_votes']);

      if (error) throw error;

      console.log('📊 [POPULAR TOPICS] Raw topic data:', topicCounts);

      // Count matches per topic
      const topicMap = {};
      topicCounts?.forEach(match => {
        const topic = match.topic_title || 'Unknown Topic';
        topicMap[topic] = (topicMap[topic] || 0) + 1;
      });

      console.log('🗺️ [POPULAR TOPICS] Topic counts map:', topicMap);

      // Convert to array and sort by count (descending)
      const sortedTopics = Object.entries(topicMap)
        .map(([topic, count]) => ({ topic, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5); // Top 5 topics

      console.log('🏆 [POPULAR TOPICS] Sorted topics:', sortedTopics);
      setPopularTopics(sortedTopics);
    } catch (err) {
      console.error('❌ [POPULAR TOPICS] Error fetching popular topics:', err);
    }
  };

  useEffect(() => {
    let pollCount = 0;
    let pollInterval;

    const fetchMatchData = async () => {
      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          navigate('/');
          return;
        }
        setCurrentUser(user);

        // Fetch match data
        const { data: matchData, error: matchError } = await supabase
          .from('matches')
          .select('*')
          .eq('id', matchId)
          .single();

        if (matchError) {
          console.error('Error fetching match:', matchError);
          setLoading(false);
          return;
        }

        console.log("Fetched Match Data:", matchData);
        setMatch(matchData);
        setDisplayedTranscript(matchData.transcript || []);

        // Check if user has already voted
        const { data: voteData, error: voteError } = await supabase
          .from('votes')
          .select('*')
          .eq('match_id', matchId)
          .eq('voter_id', user.id)
          .single();

        if (voteData && !voteError) {
          setHasVoted(true);
        }

        // Poll for AI scores if match is completed but scores are missing
        if (matchData.status === 'completed' && !matchData.ai_scores) {
          pollCount++;
          if (pollCount >= 10) {
            clearInterval(pollInterval);
            setMatch(prev => ({ ...prev, legacy_fallback: true }));
          }
        } else if (matchData.ai_scores) {
          clearInterval(pollInterval);
        }

      } catch (err) {
        console.error('Error fetching match data:', err);
      } finally {
        setLoading(false);
      }
    };

    if (matchId) {
      fetchMatchData();
      fetchPopularTopics(); // Fetch popular topics
      pollInterval = setInterval(fetchMatchData, 3000);
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [matchId, navigate]);

  // Real-time listener for match updates (votes & AI scores)
  useEffect(() => {
    if (!matchId) return;

    const channel = supabase
      .channel(`match_updates_${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches',
          filter: `id=eq.${matchId}`,
        },
        (payload) => {
          console.log('Real-time match update:', payload.new);
          setMatch(payload.new);
          if (payload.new.transcript) {
            setDisplayedTranscript(payload.new.transcript);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  const hasScrolledRef = useRef(false);

  // Auto-scroll to bottom only once when transcript initial load happens
  useEffect(() => {
    if (match && match.transcript && !hasScrolledRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      hasScrolledRef.current = true;
    }
  }, [match?.transcript]);

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const startReplay = async () => {
    if (!match?.transcript) return;
    setIsPlaying(true);
    isPlayingRef.current = true;
    setDisplayedTranscript([]);

    for (let i = 0; i < match.transcript.length; i++) {
      if (!isPlayingRef.current) break;

      const message = match.transcript[i];

      if (i === 0) {
        await sleep(500);
      } else {
        const prevMessage = match.transcript[i - 1];
        const prevTime = new Date(prevMessage.timestamp).getTime();
        const currTime = new Date(message.timestamp).getTime();
        const diff = (prevTime && currTime) ? (currTime - prevTime) : 1000;
        const clampedDelay = Math.max(800, Math.min(2500, diff));

        await sleep(clampedDelay);
      }

      if (!isPlayingRef.current) break;

      setDisplayedTranscript(prev => [...prev, message]);
    }

    setIsPlaying(false);
    isPlayingRef.current = false;
  };

  const stopReplay = () => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    setDisplayedTranscript(match?.transcript || []);
  };

  const handleVote = async (votedForId) => {
    if (!currentUser || !match) return;

    try {
      const { error } = await supabase
        .from('votes')
        .insert({
          match_id: match.id,
          voter_id: currentUser.id,
          voted_for: votedForId
        });

      if (error) {
        console.error('Error voting:', error);
        return;
      }

      // ── ATOMIC UPDATE: count actual vote rows instead of incrementing stale local value ──
      // This prevents the race condition where two clients both read 0 and write 0+1=1.
      const { data: allVotes, error: countError } = await supabase
        .from('votes')
        .select('voted_for')
        .eq('match_id', match.id);

      if (!countError && allVotes) {
        const criticCount = allVotes.filter(v => v.voted_for === match.critic_id).length;
        const defenderCount = allVotes.filter(v => v.voted_for === match.defender_id).length;
        await supabase.from('matches').update({
          audience_votes_critic: criticCount,
          audience_votes_defender: defenderCount
        }).eq('id', match.id);
      }

      setHasVoted(true);
      // Force a fresh fetch from DB to get the true total
      await fetchVotes(match.id, currentUser.id);
    } catch (err) {
      console.error('Error submitting vote:', err);
    }
  };

  const handleResolveMatch = async () => {
    if (!match || isResolving) return;

    console.log('🧪 [ELO TEST] Starting match resolution...');
    console.log('📊 [ELO TEST] Match Data:', {
      id: match.id,
      critic_id: match.critic_id,
      defender_id: match.defender_id,
      status: match.status,
      ai_scores: match.ai_scores,
      audience_votes_critic: match.audience_votes_critic,
      audience_votes_defender: match.audience_votes_defender
    });

    try {
      setIsResolving(true);

      // 0. Double-check match status right before resolving (prevents race conditions)
      const { data: latestMatch, error: statusError } = await supabase
        .from('matches')
        .select('status')
        .eq('id', match.id)
        .single();

      if (statusError || !latestMatch || latestMatch.status !== 'pending_votes') {
        console.warn('⚠️ [ELO TEST] Conflict detected: Match already resolved or and no longer pending.');
        if (latestMatch) setMatch(prev => ({ ...prev, ...latestMatch }));
        setIsResolving(false);
        return;
      }

      // 1. Calculate Scores and Tally Votes
      const criticVotes = match.audience_votes_critic || 0;
      const defenderVotes = match.audience_votes_defender || 0;
      const totalVotes = criticVotes + defenderVotes;

      console.log('🗳️ [ELO TEST] Vote Tally:', { criticVotes, defenderVotes, totalVotes });

      // Safety check for AI scores
      if (!match.ai_scores || !match.ai_scores.critic || !match.ai_scores.defender) {
        throw new Error('AI scores are missing or incomplete');
      }

      // AI Weights: Logic (40%), Facts (40%), Relevance (20%)
      const criticAi = (match.ai_scores.critic.logic * 0.4) + (match.ai_scores.critic.facts * 0.4) + (match.ai_scores.critic.relevance * 0.2) || 0;
      const defenderAi = (match.ai_scores.defender.logic * 0.4) + (match.ai_scores.defender.facts * 0.4) + (match.ai_scores.defender.relevance * 0.2) || 0;

      console.log('🤖 [ELO TEST] AI Scores:', {
        criticAi,
        defenderAi,
        criticBreakdown: match.ai_scores.critic,
        defenderBreakdown: match.ai_scores.defender
      });

      // Normalize AI diff (-1.0 to 1.0 scale)
      const nAi = (criticAi - defenderAi) / 10;

      // Calculate Audience Sentiment (-1.0 to 1.0 scale)
      const sAudience = totalVotes > 0 ? (criticVotes - defenderVotes) / totalVotes : 0;

      console.log('📈 [ELO TEST] Normalized Scores:', { nAi, sAudience });

      // Composite Score (AI 70% / Audience 30%)
      const composite = (nAi * 0.7) + (sAudience * 0.3);

      console.log('🎯 [ELO TEST] Composite Score:', composite);

      // Determine Match Score (S)
      let sCritic, sDefender, winnerId = null;
      if (composite > 0.1) {
        sCritic = 1; sDefender = 0; winnerId = match.critic_id;
      } else if (composite < -0.1) {
        sCritic = 0; sDefender = 1; winnerId = match.defender_id;
      } else {
        sCritic = 0.5; sDefender = 0.5; winnerId = null;
      }

      console.log('🏆 [ELO TEST] Match Result:', {
        sCritic,
        sDefender,
        winnerId,
        winner: winnerId === match.critic_id ? 'Critic' : winnerId === match.defender_id ? 'Defender' : 'Tie'
      });

      // 2. Fetch Player Profiles for Elo Calculation
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, elo_rating')
        .in('id', [match.critic_id, match.defender_id]);

      if (profileError || !profiles || profiles.length < 2) {
        console.error('Error fetching player profiles:', profileError);
        throw new Error('Failed to fetch player profiles for Elo calculation');
      }

      const criticProfile = profiles.find(p => p.id === match.critic_id);
      const defenderProfile = profiles.find(p => p.id === match.defender_id);

      if (!criticProfile || !defenderProfile) {
        throw new Error('Missing player profile data');
      }

      const rCritic = criticProfile.elo_rating || 1200;
      const rDefender = defenderProfile.elo_rating || 1200;

      console.log('👤 [ELO TEST] Player Ratings:', {
        critic: { id: match.critic_id, rating: rCritic },
        defender: { id: match.defender_id, rating: rDefender }
      });

      // 3. Expected Probability (E)
      const eCritic = 1 / (1 + Math.pow(10, (rDefender - rCritic) / 400));
      const eDefender = 1 - eCritic;

      console.log('📊 [ELO TEST] Expected Probabilities:', { eCritic, eDefender });

      // 4. Fetch Match Counts for K-Factor
      const getKFactor = async (userId, rating) => {
        try {
          const { count } = await supabase.from('matches').select('*', { count: 'exact', head: true }).or(`critic_id.eq.${userId},defender_id.eq.${userId}`).eq('status', 'completed');
          if (rating > 1800) return 15;
          if ((count || 0) < 10) return 50;
          return 30;
        } catch (err) {
          console.warn('Error fetching match count for K-factor, using default:', err);
          return 30;
        }
      };

      const kCritic = await getKFactor(match.critic_id, rCritic);
      const kDefender = await getKFactor(match.defender_id, rDefender);

      console.log('⚖️ [ELO TEST] K-Factors:', { kCritic, kDefender });

      // 5. Calculate New Ratings
      let newCriticRating = Math.round(rCritic + kCritic * (sCritic - eCritic));
      let newDefenderRating = Math.round(rDefender + kDefender * (sDefender - eDefender));

      console.log('🧮 [ELO TEST] Rating Calculations:', {
        critic: { old: rCritic, new: newCriticRating, change: newCriticRating - rCritic },
        defender: { old: rDefender, new: newDefenderRating, change: newDefenderRating - rDefender }
      });

      // 6. Performance Bonus (+5 Elo for >90% Audience Vote)
      if (totalVotes >= 5) { // Minimum votes for bonus
        if (sCritic === 1 && (criticVotes / totalVotes) > 0.9) {
          newCriticRating += 5;
          console.log('🎁 [ELO TEST] Critic bonus +5 (90%+ audience support)');
        }
        if (sDefender === 1 && (defenderVotes / totalVotes) > 0.9) {
          newDefenderRating += 5;
          console.log('🎁 [ELO TEST] Defender bonus +5 (90%+ audience support)');
        }
      }

      console.log('💰 [ELO TEST] Final Ratings:', {
        critic: { final: newCriticRating, totalChange: newCriticRating - rCritic },
        defender: { final: newDefenderRating, totalChange: newDefenderRating - rDefender }
      });

      // 7. Atomic Updates
      const updatePromises = [
        supabase.from('profiles').update({ elo_rating: newCriticRating }).eq('id', match.critic_id),
        supabase.from('profiles').update({ elo_rating: newDefenderRating }).eq('id', match.defender_id),
        supabase.from('matches').update({
          status: 'completed',
          winner_id: winnerId,
          end_reason: 'standard'
        }).eq('id', match.id)
      ];

      console.log('💾 [ELO TEST] Executing database updates...');
      await Promise.all(updatePromises);

      // Update local state
      setMatch(prev => ({ ...prev, status: 'completed', winner_id: winnerId }));
      setIsResolving(false);

      // Refresh popular topics after match resolution
      await fetchPopularTopics();

      console.log('✅ [ELO TEST] Match resolved successfully!');
      console.log(`🏆 [ELO TEST] Winner: ${winnerId === match.critic_id ? 'Critic' : winnerId === match.defender_id ? 'Defender' : 'Tie'}`);
      console.log(`📈 [ELO TEST] Elo Updated: Critic ${rCritic} → ${newCriticRating}, Defender ${rDefender} → ${newDefenderRating}`);

    } catch (err) {
      console.error('❌ [ELO TEST] Match resolution error:', err);
      console.error('❌ [ELO TEST] Error details:', {
        message: err.message,
        stack: err.stack,
        matchId: match?.id,
        matchStatus: match?.status
      });
      setIsResolving(false);

      // Show user-friendly error message
      alert(`Failed to resolve match: ${err.message || 'Unknown error occurred. Check console for details.'}`);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-screen bg-slate-950 text-slate-200 p-8">
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
            <p className="text-slate-400">Loading match data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="flex flex-col h-screen bg-slate-950 text-slate-200 p-8">
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-slate-100 mb-4">Match Not Found</h1>
            <p className="text-slate-400">The match you're looking for doesn't exist or you don't have access to it.</p>
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-500/40 bg-slate-950/40 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-slate-200 transition hover:border-slate-400 hover:text-slate-100 mt-6"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Calculate scores for winner dynamically with safety checks
  const criticAiTotal = match?.ai_scores?.critic
    ? (match.ai_scores.critic.logic || 0) + (match.ai_scores.critic.facts || 0) + (match.ai_scores.critic.relevance || 0)
    : 0;
  const defenderAiTotal = match?.ai_scores?.defender
    ? (match.ai_scores.defender.logic || 0) + (match.ai_scores.defender.facts || 0) + (match.ai_scores.defender.relevance || 0)
    : 0;

  const final_score_critic = criticAiTotal + ((match?.audience_votes_critic || 0) * 2);
  const final_score_defender = defenderAiTotal + ((match?.audience_votes_defender || 0) * 2);
  const winner = final_score_critic > final_score_defender ? 'Critic' : (final_score_defender > final_score_critic ? 'Defender' : 'Tie');

  // Safety check: if match is null or undefined, return loading
  if (!match) {
    return (
      <div className="flex flex-col h-screen bg-slate-950 text-slate-200 p-8">
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
            <p className="text-slate-400">Loading match data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-200 pb-12">
      {/* Header (Fixed Top) */}
      <div className="flex-none p-6 pb-2">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-500/40 bg-slate-950/40 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-slate-200 transition hover:border-slate-400 hover:text-slate-100"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>

            <div className="flex items-center gap-4">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${match.status === 'pending_votes'
                ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                : 'bg-green-500/20 text-green-300 border border-green-500/30'
                }`}>
                {match.status === 'pending_votes' ? 'Pending Votes' : 'Completed'}
              </span>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Clock className="h-4 w-4" />
                {new Date(match.created_at).toLocaleDateString()}
              </div>
            </div>
          </div>

          <h1 className="text-4xl font-bold text-slate-100">{match.topic}</h1>
        </div>
      </div>

      {/* AI Highlights (Viral Loop) */}
      <div className="p-6 pt-0 space-y-4">
        <div className="max-w-4xl mx-auto">
          {/* AI Highlights Section - Managed by Feature Flag */}
          {ENABLE_AI_HIGHLIGHTS && (
            <>
              {match.status === 'pending_votes' ? (
            <div className="mb-8">
              <h3 className="text-xl font-bold text-slate-100 mb-4 flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-yellow-400" /> AI Highlights
              </h3>
              <div className="p-6 bg-slate-800/50 border border-slate-700 rounded-xl text-center text-slate-400 italic">
                Highlights will be generated by the AI Judge once the voting period concludes.
              </div>
            </div>
          ) : match.status === 'completed' ? (
            <div className="mb-8">
              <h3 className="text-xl font-bold text-slate-100 mb-4 flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-yellow-400" /> AI Highlights
              </h3>
              {match.highlights && match.highlights.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {match.highlights.map((highlight, idx) => (
                    <div key={idx} className="flex flex-col gap-3">
                      <div 
                        id={`highlight-card-${idx}`}
                        className="relative overflow-hidden rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-950 p-6 shadow-2xl"
                      >
                        <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-cyan-500/10 blur-3xl"></div>
                        <div className="absolute -bottom-12 -left-12 h-32 w-32 rounded-full bg-rose-500/10 blur-3xl"></div>
                        
                        <Quote className="h-8 w-8 text-slate-700 mb-4 opacity-50" />
                        
                        <p className="text-lg md:text-xl font-medium text-slate-200 mb-6 italic leading-relaxed relative z-10">
                          "{highlight.quote}"
                        </p>
                        
                        <div className="flex items-center justify-between border-t border-slate-800 pt-4 mt-auto relative z-10">
                          <div className="flex flex-col">
                            <span className={`text-sm font-bold uppercase tracking-wider ${highlight.author_role?.toLowerCase() === 'critic' ? 'text-rose-400' : 'text-cyan-400'}`}>
                              {highlight.author_role}
                            </span>
                            <span className="text-xs text-slate-500 max-w-[200px] truncate" title={match.topic}>
                              The Socratic Arena
                            </span>
                          </div>
                          
                          <div className="bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-2 max-w-[150px]">
                            <span className="text-xs text-slate-300 truncate" title={highlight.context}>
                              {highlight.context}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-end gap-3 px-2">
                        <button 
                          onClick={() => exportHighlight(idx)}
                          disabled={exportingId === idx}
                          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-sm font-semibold text-slate-300 transition-colors disabled:opacity-50"
                        >
                          {exportingId === idx ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                          Export Card
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 rounded-2xl border border-slate-700 bg-slate-900/20 flex flex-col items-center justify-center text-center">
                  <Sparkles className="h-8 w-8 text-slate-600 mb-3" />
                  <h3 className="text-lg font-medium text-slate-400">No highlights available for this match.</h3>
                  <p className="text-sm text-slate-500">The AI Judge did not find suitable mic-drop moments or evaluation failed.</p>
                </div>
              )}
            </div>
          ) : null}
            </>
          )}
        </div>
      </div>

      {/* Transcript (Middle - Natural Height) */}
      <div className="p-6 space-y-4">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold text-slate-100 flex items-center gap-2">
              <User className="h-6 w-6 text-cyan-400" />
              Debate Transcript
            </h2>
            <div className="flex items-center">
              {!isPlaying ? (
                <button
                  onClick={startReplay}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-500/30 rounded-lg text-sm font-bold uppercase tracking-wider transition-colors"
                >
                  <Play className="h-4 w-4" />
                  Watch Replay
                </button>
              ) : (
                <button
                  onClick={stopReplay}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 rounded-lg text-sm font-bold uppercase tracking-wider transition-colors"
                >
                  <Square className="h-4 w-4" />
                  Stop Replay
                </button>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {displayedTranscript && displayedTranscript.length > 0 ? (
              displayedTranscript.map((message, index) => (
                <div
                  key={message.id || index}
                  className={`flex ${message.speaker === 'Critic' ? 'justify-start' : 'justify-end'
                    }`}
                >
                  <div
                    className={`max-w-[70%] rounded-xl border p-4 backdrop-blur-sm ${message.speaker === 'Critic'
                      ? 'bg-rose-950/40 border-rose-500/30 text-rose-100'
                      : 'bg-cyan-950/40 border-cyan-500/30 text-cyan-100'
                      }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wide opacity-70">
                        {message.speaker}
                      </span>
                      <span className="text-xs opacity-50">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap text-sm">
                      {message.text}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-400">
                No transcript available for this match.
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {/* Temporary Debug Block */}
      {!match?.ai_scores && match?.status === 'completed' && !match?.legacy_fallback && (
        <div className="text-amber-400 p-4 border border-amber-400/50 rounded-xl text-center">
          Retrieving AI Analysis from database... (If this stays here, ai_scores is null)
        </div>
      )}

      {/* Legacy Fallback Block */}
      {!match?.ai_scores && match?.status === 'completed' && match?.legacy_fallback && (
        <div className="text-amber-400 p-4 border border-amber-400/50 rounded-xl text-center font-semibold">
          Legacy Match: Detailed AI Analytics are unavailable for matches played before the v2.0 update.
        </div>
      )}

      {/* AI Analysis Section */}
      {match?.ai_scores && (
        <div className="w-full max-w-4xl mx-auto mt-8 space-y-6">
          <h2 className="text-2xl font-bold text-center text-slate-200">AI Cognitive Analysis</h2>

          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1 w-full min-h-[300px] flex items-center justify-center bg-[#0b0f19] p-4 rounded-xl border border-slate-800 shadow-lg">
              {memoizedRadarChart}
            </div>

            {/* Detailed Feedback Cards */}
            <div className="flex-1 flex flex-col gap-4">
              <div className="bg-[#0b0f19] p-6 rounded-xl border border-rose-900/50 shadow-lg">
                <h3 className="text-rose-400 font-bold mb-2">Critic Feedback</h3>
                <p className="text-slate-300 text-sm">{match.ai_scores.critic?.feedback}</p>
              </div>
              <div className="bg-[#0b0f19] p-6 rounded-xl border border-indigo-900/50 shadow-lg">
                <h3 className="text-indigo-400 font-bold mb-2">Defender Feedback</h3>
                <p className="text-slate-300 text-sm">{match.ai_scores.defender?.feedback}</p>
              </div>
            </div>
          </div>

          {/* Audience Sentiment (Added Below AI Radar) */}
          <div className="bg-[#0b0f19] p-6 rounded-xl border border-slate-800 shadow-lg mt-8">
            <h2 className="text-2xl font-bold text-center text-slate-200 mb-6 flex items-center justify-center gap-2">
              <BarChart3 className="h-6 w-6 text-purple-400" /> Audience Sentiment
            </h2>
            {((match?.audience_votes_critic || 0) + (match?.audience_votes_defender || 0)) > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[{ name: 'Votes', Critic: match?.audience_votes_critic || 0, Defender: match?.audience_votes_defender || 0 }]} margin={{ top: 20, right: 30, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="name" stroke="#64748b" tick={{ fill: '#94a3b8', fontWeight: 600 }} />
                    <YAxis allowDecimals={false} stroke="#64748b" tick={{ fill: '#64748b' }} />
                    <Tooltip cursor={{ fill: '#0f172a' }} contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} />
                    <Bar dataKey="Critic" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={60} />
                    <Bar dataKey="Defender" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={60} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-slate-500 italic bg-[#0b0f19]/50 rounded-lg border border-slate-800/50">
                No audience votes were cast during the 48-hour voting window.
              </div>
            )}
          </div>

        </div>
      )}

      {/* Footer / Voting (Natural Flow) */}
      <div className="p-6 bg-slate-900 border-t border-slate-800">
        <div className="max-w-4xl mx-auto">
          {/* DEV MODE: Temporarily allowing players to vote on their own matches for testing purposes. Re-enable before production. */}
          {match.status === 'pending_votes' && !hasVoted ? (
            <div>
              <h2 className="text-2xl font-semibold text-slate-100 mb-6 flex items-center gap-2">
                <Vote className="h-6 w-6 text-purple-400" />
                Cast Your Vote
              </h2>

              <p className="text-slate-400 mb-6">
                Who do you think won this debate? Your vote will help determine the winner.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => handleVote(match.critic_id)}
                  className="p-6 rounded-xl border border-rose-500/40 bg-rose-950/40 hover:border-rose-400 hover:bg-rose-950/60 transition-all text-left group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-lg font-semibold text-rose-300">Critic</span>
                    <Trophy className="h-5 w-5 text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-sm text-rose-200 opacity-80">
                    Arguments against the proposition
                  </p>
                </button>

                <button
                  onClick={() => handleVote(match.defender_id)}
                  className="p-6 rounded-xl border border-cyan-500/40 bg-cyan-950/40 hover:border-cyan-400 hover:bg-cyan-950/60 transition-all text-left group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-lg font-semibold text-cyan-300">Defender</span>
                    <Trophy className="h-5 w-5 text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-sm text-cyan-200 opacity-80">
                    Arguments in favor of the proposition
                  </p>
                </button>
              </div>
            </div>
          ) : hasVoted ? (
            <div className="flex items-center gap-3">
              <Trophy className="h-6 w-6 text-green-400" />
              <div>
                <h3 className="text-lg font-semibold text-green-300">Vote Submitted</h3>
                <p className="text-green-200 opacity-80">
                  ✅ Your vote has been recorded.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Winner Celebration - Premium Design */}
        {match.status === 'completed' && (
          <div className="relative overflow-hidden">
            {/* Animated Background Gradient */}
            <div className={`absolute inset-0 ${
              winner === 'Critic' 
                ? 'bg-gradient-to-br from-rose-950/90 via-rose-900/50 to-slate-950' 
                : winner === 'Defender' 
                  ? 'bg-gradient-to-br from-indigo-950/90 via-indigo-900/50 to-slate-950' 
                  : 'bg-gradient-to-br from-amber-950/90 via-yellow-900/50 to-slate-950'
            }`} />
            
            {/* Subtle Animated Glow Orbs */}
            <div className={`absolute top-0 left-1/4 w-96 h-96 rounded-full blur-3xl animate-pulse ${
              winner === 'Critic' ? 'bg-rose-500/20' : winner === 'Defender' ? 'bg-indigo-500/20' : 'bg-amber-500/20'
            }`} style={{ animationDuration: '3s' }} />
            <div className={`absolute bottom-0 right-1/4 w-80 h-80 rounded-full blur-3xl animate-pulse ${
              winner === 'Critic' ? 'bg-pink-500/15' : winner === 'Defender' ? 'bg-cyan-500/15' : 'bg-orange-500/15'
            }`} style={{ animationDuration: '4s', animationDelay: '1s' }} />
            
            <div className="relative z-10 py-12 px-6">
              <div className="max-w-2xl mx-auto text-center">
                
                {/* Premium Trophy SVG */}
                <div className="relative inline-block mb-6">
                  {/* Outer Glow Ring */}
                  <div className={`absolute inset-0 rounded-full blur-xl animate-pulse ${
                    winner === 'Critic' ? 'bg-rose-400/40' : winner === 'Defender' ? 'bg-indigo-400/40' : 'bg-amber-400/40'
                  }`} style={{ transform: 'scale(1.5)', animationDuration: '2s' }} />
                  
                  {/* Trophy Icon Container */}
                  <div className={`relative w-24 h-24 rounded-full flex items-center justify-center ${
                    winner === 'Tie' 
                      ? 'bg-gradient-to-br from-amber-400 via-yellow-500 to-orange-500' 
                      : winner === 'Critic' 
                        ? 'bg-gradient-to-br from-rose-400 via-pink-500 to-rose-600' 
                        : 'bg-gradient-to-br from-indigo-400 via-blue-500 to-indigo-600'
                  } shadow-2xl`}>
                    <Trophy className={`w-12 h-12 ${winner === 'Tie' ? 'text-amber-900' : 'text-white'} drop-shadow-lg`} />
                  </div>
                  
                  {/* Sparkle Decorations */}
                  <Sparkles className={`absolute -top-2 -right-2 w-6 h-6 animate-bounce ${
                    winner === 'Critic' ? 'text-rose-300' : winner === 'Defender' ? 'text-indigo-300' : 'text-amber-300'
                  }`} style={{ animationDuration: '1.5s' }} />
                  <Sparkles className={`absolute -bottom-1 -left-3 w-5 h-5 animate-bounce ${
                    winner === 'Critic' ? 'text-pink-300' : winner === 'Defender' ? 'text-cyan-300' : 'text-yellow-300'
                  }`} style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
                </div>
                
                {/* Winner Title */}
                <h2 className={`text-4xl md:text-5xl font-black mb-3 tracking-tight ${
                  winner === 'Critic' 
                    ? 'bg-gradient-to-r from-rose-300 via-pink-200 to-rose-300 bg-clip-text text-transparent' 
                    : winner === 'Defender' 
                      ? 'bg-gradient-to-r from-indigo-300 via-cyan-200 to-indigo-300 bg-clip-text text-transparent' 
                      : 'bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-300 bg-clip-text text-transparent'
                }`}>
                  {winner === 'Tie' ? 'MATCH TIED' : `${winner.toUpperCase()} WINS`}
                </h2>
                
                {/* Subtitle */}
                <p className={`text-lg md:text-xl font-medium mb-8 ${
                  winner === 'Critic' ? 'text-rose-200/80' : winner === 'Defender' ? 'text-indigo-200/80' : 'text-amber-200/80'
                }`}>
                  {winner === 'Tie' 
                    ? `An evenly matched debate • ${final_score_critic} points each` 
                    : `Decisive victory with ${winner === 'Critic' ? final_score_critic : final_score_defender} points`
                  }
                </p>
                
                {/* ELO Change Display - Glassmorphism Card */}
                <div className={`inline-flex items-center gap-6 px-8 py-5 rounded-2xl backdrop-blur-xl border ${
                  winner === 'Critic' 
                    ? 'bg-rose-500/10 border-rose-400/30 shadow-rose-500/20' 
                    : winner === 'Defender' 
                      ? 'bg-indigo-500/10 border-indigo-400/30 shadow-indigo-500/20' 
                      : 'bg-amber-500/10 border-amber-400/30 shadow-amber-500/20'
                } shadow-2xl`}>
                  
                  {/* Critic ELO */}
                  <div className="text-center">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Critic</p>
                    <p className={`text-2xl font-bold ${
                      (match.elo_change_critic || 0) > 0 
                        ? 'text-emerald-400' 
                        : (match.elo_change_critic || 0) < 0 
                          ? 'text-red-400' 
                          : 'text-slate-300'
                    }`}>
                      {(match.elo_change_critic || 0) > 0 ? '+' : ''}{match.elo_change_critic || 0}
                      <span className="text-sm font-medium text-slate-400 ml-1">ELO</span>
                    </p>
                  </div>
                  
                  {/* Divider */}
                  <div className={`w-px h-12 ${
                    winner === 'Critic' ? 'bg-rose-400/30' : winner === 'Defender' ? 'bg-indigo-400/30' : 'bg-amber-400/30'
                  }`} />
                  
                  {/* Defender ELO */}
                  <div className="text-center">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Defender</p>
                    <p className={`text-2xl font-bold ${
                      (match.elo_change_defender || 0) > 0 
                        ? 'text-emerald-400' 
                        : (match.elo_change_defender || 0) < 0 
                          ? 'text-red-400' 
                          : 'text-slate-300'
                    }`}>
                      {(match.elo_change_defender || 0) > 0 ? '+' : ''}{match.elo_change_defender || 0}
                      <span className="text-sm font-medium text-slate-400 ml-1">ELO</span>
                    </p>
                  </div>
                </div>
                
                {/* Winner Badge - Only show if not a tie */}
                {winner !== 'Tie' && (
                  <div className="mt-6">
                    <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${
                      winner === 'Critic' 
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-400/30' 
                        : 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/30'
                    }`}>
                      <Target className="w-4 h-4" />
                      {winner === 'Critic' 
                        ? `Critic dominated by ${final_score_critic - final_score_defender} points` 
                        : `Defender prevailed by ${final_score_defender - final_score_critic} points`
                      }
                    </span>
                  </div>
                )}
                
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MatchReview;
