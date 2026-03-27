import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Shield, Swords, Bot, Square, Search, Users, Download, ArrowLeft, MessageCircle, Trophy, Loader2, Clock, Gavel, Scale } from 'lucide-react';
import jsPDF from 'jspdf';

/**
 * TypewriterMessage
 * Streams text character-by-character for a live feel.
 */
const TypewriterMessage = ({ text, scrollToBottom, isAutoScrollEnabled, isLastMessage }) => {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    if (!text) { setDisplayedText(''); return; }
    if (!isLastMessage) { setDisplayedText(text); return; }
    let i = 0;
    const interval = setInterval(() => {
      setDisplayedText(text.substring(0, i));
      i++;
      if (i > text.length) clearInterval(interval);
    }, 15);
    return () => clearInterval(interval);
  }, [text, isLastMessage]);

  useEffect(() => {
    if (displayedText && scrollToBottom && isAutoScrollEnabled) scrollToBottom();
  }, [displayedText, scrollToBottom, isAutoScrollEnabled]);

  return <div className="whitespace-pre-wrap">{displayedText}</div>;
};

/**
 * DebateArena
 * Full-screen, server-authoritative 1v1 debate UI.
 */
const DebateArena = ({
  transcript = [],
  isLoading = false,
  isSocketConnected = false,
  canStopDebate = false,
  onStopDebate = null,
  socket = null,
  user = null,
}) => {
  const navigate = useNavigate();
  const { matchId } = useParams();
  const { state } = useLocation();
  const { topic: initialTopic, isSpectator } = state || {};

  const chatContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  const [isMatchOver, setIsMatchOver] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [pauseMessage, setPauseMessage] = useState('');
  const [pauseCountdown, setPauseCountdown] = useState(30);
  const [isInitializing, setIsInitializing] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState('Initializing Arena...');
  const [errorMsg, setErrorMsg] = useState(null);

  // Server-authoritative multiplayer state
  const [criticTime, setCriticTime] = useState(300);
  const [defenderTime, setDefenderTime] = useState(300);
  const [activeSpeaker, setActiveSpeaker] = useState('Critic');
  const [playerRole, setPlayerRole] = useState(null);
  const [matchStatus, setMatchStatus] = useState(isSpectator ? 'active' : 'searching');
  const [roomId, setRoomId] = useState(matchId || null);
  const [topic, setTopic] = useState(initialTopic || '');
  const [localTranscript, setLocalTranscript] = useState([]);
  const [inputText, setInputText] = useState('');

  // Phase 3: AI Judge Lifeline state
  const [hasUsedLifeline, setHasUsedLifeline] = useState(false);
  const [objectionLoadingId, setObjectionLoadingId] = useState(null);
  const [interventions, setInterventions] = useState({});
  const ENABLE_AI_OBJECTION = false; // Toggle to true to reveal the button

  const handleSummonAIJudge = (messageId) => {
    if (hasUsedLifeline || playerRole === 'Spectator') return;
    setObjectionLoadingId(messageId);
    socket.emit('summon_ai_judge', { roomId, targetMessageId: messageId });
  };

  useEffect(() => {
    const initArena = async () => {
        if (!matchId) {
            setErrorMsg("Critical Error: No Match ID found in URL.");
            return;
        }
        
        // CRITICAL: Wait for the user object to exist before calculating roles!
        if (!user && !user?.id) { 
            const cachedId = localStorage.getItem('socratic_user_id') || localStorage.getItem('supabase.auth.token');
            if (!cachedId) {
                setLoadingMsg("Waiting for authentication...");
                return; 
            }
        }

        try {
            setLoadingMsg("Fetching battle data from database...");
            const { data: match, error } = await supabase
                .from('matches')
                .select('*')
                .eq('id', matchId)
                .single();

            if (error) throw error;

            if (match?.status === 'abandoned') {
                // Match is already dead — show specific error and redirect
                setErrorMsg('🔴 Arena Error: This match was abandoned due to disconnection. Redirecting to Explore...');
                setTimeout(() => navigate('/explore'), 3000);
                return;
            }

            if (match) {
                setTopic(match.topic_title || match.topic);
                
                // THE PARADOX FIX: Stop waiting for the socket event that already passed.
                if (match.status !== 'abandoned') {
                    setMatchStatus('active');
                }

                // Deterministic Role Assignment
                if (user.id === match.critic_id) {
                    setPlayerRole('Critic');
                } else if (user.id === match.defender_id) {
                    setPlayerRole('Defender');
                } else {
                    setPlayerRole('Spectator');
                }
            }
            setIsInitializing(false);
        } catch (err) {
            console.error("Arena Initialization Failed:", err);
            setErrorMsg(err.message || "Failed to load match data.");
        }
    };

    initArena();
  }, [matchId, user]);

  const scrollToBottomSafe = () => {
      if (chatContainerRef.current) {
          const { scrollHeight } = chatContainerRef.current;
          chatContainerRef.current.scrollTo({ top: scrollHeight, behavior: 'smooth' });
      }
  };

  // Auto-scroll when transcript updates
  useEffect(() => {
    if (isAutoScrollEnabled) scrollToBottomSafe();
  }, [localTranscript, isAutoScrollEnabled]);

  useEffect(() => {
    if (socket && isSpectator && roomId) {
      socket.emit('join_as_spectator', roomId);
    }
  }, [socket, isSpectator, roomId]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    const handleMatchFound = (data) => {
      const role = data.roles?.[socket.id] || 'Unknown';
      setRoomId(data.roomId);
      setPlayerRole(role);
      setMatchStatus('active');
      setLocalTranscript(data.transcript || []); // Fix: Prevent local clear on rejoin
      setActiveSpeaker(data.activeSpeaker || 'Critic');
      setTopic(data.topic || '');
    };

    const handleTimeSync = ({ criticTime: ct, defenderTime: dt, activeSpeaker: as }) => {
      setCriticTime(ct);
      setDefenderTime(dt);
      setActiveSpeaker(as);
    };

    const handleNewTurn = ({ transcript: t, activeSpeaker: as }) => {
      setIsAutoScrollEnabled(true); // Force auto-scroll on new message
      setLocalTranscript(t);
      setActiveSpeaker(as);
    };

    const handleMatchOver = ({ finalState }) => {
      setMatchStatus('finished');
      setLocalTranscript(finalState.transcript);
      setCriticTime(finalState.criticTime);
      setDefenderTime(finalState.defenderTime);
      
      setIsMatchOver(true);
      setTimeout(() => {
        navigate('/review/' + roomId);
      }, 4000);
    };

    const handleSpectatorSync = (data) => {
      setLocalTranscript(data.transcript || []);
      setCriticTime(data.criticTime);
      setDefenderTime(data.defenderTime);
      setActiveSpeaker(data.activeSpeaker);
      setIsAutoScrollEnabled(true);
    };

    const handleOpponentDisconnected = (data) => {
      // Handle both string (legacy) and object (new) formats
      const disconnectInfo = typeof data === 'string' ? { message: data, type: 'legacy' } : data;
      
      setMatchStatus('abandoned');
      setIsPaused(false);
      
      // Determine specific error message based on who disconnected
      let errorMessage = '';
      if (disconnectInfo.type === 'abandoned') {
        if (playerRole === 'Spectator') {
          errorMessage = `👁️ Arena Error: ${disconnectInfo.leaverRole} disconnected. Match abandoned.`;
        } else if (disconnectInfo.leaverRole === playerRole) {
          errorMessage = `🔴 Arena Error: You disconnected. Match abandoned.`;
        } else {
          errorMessage = `🔴 Arena Error: Opponent (${disconnectInfo.leaverRole}) disconnected. Match abandoned.`;
        }
      } else {
        // Legacy fallback
        errorMessage = '🔴 Arena Error: ' + (disconnectInfo.message || 'Match disconnected unexpectedly.');
      }
      
      setErrorMsg(errorMessage);
      
      // Redirect after delay
      const redirectDelay = disconnectInfo.redirectDelay || 3000;
      setTimeout(() => navigate('/explore'), redirectDelay);
    };

    const handleOpponentPaused = ({ role, message }) => {
      setIsPaused(true);
      setPauseMessage(message);
      setPauseCountdown(30);
    };

    const handleMatchResumed = ({ role }) => {
      setIsPaused(false);
      setPauseMessage('');
    };

    const handleSelfDisconnect = () => {
      setIsPaused(true);
      setPauseMessage('You lost connection. Attempting to rejoin...');
      setPauseCountdown(30);
      
      // Fix: DO NOT set errorMsg here. Let the graceful isPaused UI handle it. 
      // This ensures the user sees the beautiful 30s spinner countdown instead of a fatal error.
    };
    
    const handleSelfReconnect = () => {
      if (user?.id && roomId && !isSpectator) {
        console.log('[DebateArena] Reconnected! Emitting rejoin_match...');
        socket.emit('rejoin_match', { roomId, userId: user.id });
      } else if (roomId && isSpectator) {
        console.log('[DebateArena] Reconnected as spectator! Emitting join_as_spectator...');
        socket.emit('join_as_spectator', roomId);
      }
    };

    const handleWaitingForOpponent = () => setMatchStatus('searching');

    const handleSocketError = ({ message }) => {
      setObjectionLoadingId(null); // Reset spinner on any error
      // If rejoining fails because the match is gone, redirect
      if (message && (message.includes('no longer exists') || message.includes('expired'))) {
        setErrorMsg('Match session expired or no longer available.');
        setTimeout(() => navigate('/explore'), 3000);
      } else {
        window.alert(message || 'An error occurred');
      }
    };

    const handleAiProcessing = ({ caller, targetMessageId }) => {
      if (caller === playerRole) setHasUsedLifeline(true);
      setObjectionLoadingId(targetMessageId);
      setIsAutoScrollEnabled(true);
    };

    const handleAiResult = (result) => {
      setObjectionLoadingId(null);
      setInterventions(prev => ({
        ...prev,
        [result.targetMessageId]: result
      }));
      setIsAutoScrollEnabled(true);
    };

    socket.on('match_found', handleMatchFound);
    socket.on('time_sync', handleTimeSync);
    socket.on('new_turn', handleNewTurn);
    socket.on('match_over', handleMatchOver);
    socket.on('spectator_sync', handleSpectatorSync);
    socket.on('opponent_disconnected', handleOpponentDisconnected);
    socket.on('opponent_paused', handleOpponentPaused);
    socket.on('match_resumed', handleMatchResumed);
    socket.on('waiting_for_opponent', handleWaitingForOpponent);
    socket.on('error', handleSocketError);
    socket.on('disconnect', handleSelfDisconnect);
    socket.on('connect', handleSelfReconnect);
    socket.on('ai_intervention_processing', handleAiProcessing);
    socket.on('ai_intervention_result', handleAiResult);
    socket.on('ai_intervention', handleAiResult);

    // 🚀 PROACTIVE REJOIN: If we mount and socket is already connected, rejoin immediately
    if (socket.connected && user?.id && roomId && !isSpectator) {
      console.log('[DebateArena] Already connected on mount. Emitting rejoin_match...');
      socket.emit('rejoin_match', { roomId, userId: user.id });
    }

    return () => {
      socket.off('match_found', handleMatchFound);
      socket.off('time_sync', handleTimeSync);
      socket.off('new_turn', handleNewTurn);
      socket.off('match_over', handleMatchOver);
      socket.off('spectator_sync', handleSpectatorSync);
      socket.off('opponent_disconnected', handleOpponentDisconnected);
      socket.off('opponent_paused', handleOpponentPaused);
      socket.off('match_resumed', handleMatchResumed);
      socket.off('waiting_for_opponent', handleWaitingForOpponent);
      socket.off('error', handleSocketError);
      socket.off('disconnect', handleSelfDisconnect);
      socket.off('connect', handleSelfReconnect);
      socket.off('ai_intervention_processing', handleAiProcessing);
      socket.off('ai_intervention_result', handleAiResult);
      socket.off('ai_intervention', handleAiResult);
    };
  }, [socket, user, roomId, isSpectator]);

  // Pause Countdown Effect
  useEffect(() => {
    let interval;
    if (isPaused) {
      interval = setInterval(() => {
        setPauseCountdown(prev => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPaused]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleSendMessage = () => {
    if (!inputText.trim() || matchStatus !== 'active') return;
    if (!playerRole || !activeSpeaker || playerRole.toLowerCase() !== activeSpeaker.toLowerCase()) return;
    
    setIsAutoScrollEnabled(true); // Force auto-scroll when sending
    socket.emit('submit_turn', { roomId, message: inputText.trim() });
    
    setInputText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleTextareaChange = (e) => {
    setInputText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  const isInputDisabled = matchStatus !== 'active' || playerRole !== activeSpeaker;

  const buildTranscriptText = () =>
    localTranscript.map(({ speaker, text }, i) => `Turn ${i + 1}\n${speaker}:\n${text}\n`).join('\n');

  const downloadTxt = () => {
    const blob = new Blob([buildTranscriptText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `debate-${Date.now()}.txt`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    if (!localTranscript.length) { window.alert('No transcript yet.'); return; }
    const doc = new jsPDF('p', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const m = 15;
    let y = m;
    const bg = () => { doc.setFillColor(15, 23, 42); doc.rect(0, 0, pw, ph, 'F'); };
    bg();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(241, 245, 249);
    doc.text('Blitz Debate Transcript', m, y + 6); y += 15;
    localTranscript.forEach(({ speaker, text }) => {
      const lines = doc.splitTextToSize(text, pw - m * 2 - 20);
      const h = lines.length * 4.5 + 12;
      if (y + h > ph - m) { doc.addPage(); bg(); y = m; }
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(speaker === 'Critic' ? [253, 164, 175] : speaker === 'Defender' ? [165, 180, 252] : [203, 213, 225]);
      doc.text(speaker.toUpperCase(), m + 6, y + 9);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(241, 245, 249);
      doc.text(lines, m + 6, y + 15);
      y += h + 6;
    });
    doc.save(`debate-${Date.now()}.pdf`);
  };

  // FAILSAFE 1: Error State
  if (errorMsg) {
      return (
          <div className="flex flex-col items-center justify-center min-h-[80vh] bg-[#0b0f19] text-rose-400">
              <div className="text-center max-w-md mx-4">
                  <div className="mb-6">
                      <div className="inline-flex items-center justify-center w-16 h-16 bg-rose-500/20 rounded-full mb-4">
                          <span className="text-3xl">⚠️</span>
                      </div>
                      <h2 className="text-3xl font-bold text-rose-400 mb-2">Arena Error</h2>
                      <p className="text-lg text-rose-300 mb-4">{errorMsg}</p>
                      <div className="text-sm text-rose-200/70 animate-pulse">
                          Redirecting to Explore page...
                      </div>
                  </div>
              </div>
          </div>
      );
  }

  // FAILSAFE 2: Loading State (Must catch everything while calculating roles)
  if (isInitializing || !playerRole) {
      return (
          <div className="flex flex-col items-center justify-center min-h-[80vh] bg-[#0b0f19] text-slate-300">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
              <h2 className="text-xl font-bold">Entering the Arena...</h2>
              <p className="text-sm text-slate-500 mt-2">Securing connection and verifying roles.</p>
          </div>
      );
  }

  return (
    <div className="w-full max-w-5xl mx-auto px-3 sm:px-6 pt-3 sm:pt-6 pb-4 flex flex-col h-dvh overflow-hidden bg-slate-950 text-slate-200">
      {/* Pause Overlay */}
      {isPaused && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-cyan-500/50 p-10 rounded-3xl shadow-2xl text-center max-w-md mx-4 transform animate-in fade-in zoom-in duration-300">
            <div className="relative mb-6 mx-auto w-20 h-20">
              <div className="absolute inset-0 border-4 border-cyan-500/20 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Clock className="h-8 w-8 text-cyan-400 animate-pulse" />
              </div>
            </div>
            <h2 className="text-2xl font-black text-slate-100 uppercase tracking-tighter mb-2">Match Paused</h2>
            <p className="text-slate-400 mb-6 font-medium">{pauseMessage || 'Network interruption detected...'}</p>
            <div className="bg-slate-950/50 rounded-xl px-4 py-3 border border-slate-800">
              <span className="text-xs text-slate-500 uppercase font-black tracking-widest block mb-1">Abandonment in</span>
              <span className="text-3xl font-mono font-bold text-cyan-400">{pauseCountdown}s</span>
            </div>
          </div>
        </div>
      )}

      {playerRole === 'Spectator' && (
        <div className="bg-red-900/40 text-red-200 p-2 text-center text-sm font-semibold border border-red-500/30 rounded-lg mb-4">
          👁️ You are spectating this match live. Read-only mode.
        </div>
      )}

      {/* ── SEARCHING / SYNCING STATE ── */}
      {matchStatus === 'searching' && (
          <div className="flex flex-col items-center justify-center flex-1 text-slate-400">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-cyan-500 mb-4"></div>
              <p>Syncing match state with server...</p>
          </div>
      )}

      {/* ── ACTIVE / FINISHED ── */}
      {(matchStatus === 'active' || matchStatus === 'finished') && (
        <>
          {/* Header */}
          <div className="shrink-0 mb-3 sm:mb-5">
            <div className="flex items-start justify-between gap-3 sm:gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-100 truncate">Blitz Debate Arena</h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                  Playing as:{' '}
                  <span className={`font-semibold ${playerRole === 'Critic' ? 'text-rose-300' : 'text-indigo-300'}`}>
                    {playerRole}
                  </span>
                </p>
                {topic && (
                  <p className="mt-1 text-xs sm:text-sm text-cyan-300 font-medium flex items-center gap-1.5 line-clamp-1">
                    <MessageCircle className="h-3.5 w-3.5 shrink-0" />{topic}
                  </p>
                )}
              </div>
              {matchStatus === 'finished' && (
                <button onClick={() => setMatchStatus('idle')}
                  className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-950/40 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-cyan-200 hover:border-cyan-400 transition">
                  <Search className="h-4 w-4" /> New Match
                </button>
              )}
            </div>
          </div>

          {/* Timers */}
          <div className="shrink-0 grid grid-cols-2 gap-2 sm:gap-4 mb-3 sm:mb-5">
            <div className={`rounded-xl border-2 p-2 sm:p-4 transition-all duration-300 ${
              activeSpeaker === 'Critic'
                ? 'border-rose-500/60 bg-rose-950/30 shadow-lg shadow-rose-500/20'
                : 'border-slate-700/50 bg-slate-800/40'}`}>
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Swords className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-rose-300" />
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-rose-300">Critic</span>
                </div>
                {activeSpeaker === 'Critic' && <div className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-rose-400 animate-pulse" />}
              </div>
              <div className={`text-xl sm:text-4xl font-mono font-bold ${criticTime <= 15 ? 'animate-pulse text-rose-500' : criticTime <= 60 ? 'text-amber-400' : 'text-slate-100'}`}>
                {formatTime(criticTime)}
              </div>
            </div>

            <div className={`rounded-xl border-2 p-2 sm:p-4 transition-all duration-300 ${
              activeSpeaker === 'Defender'
                ? 'border-indigo-500/60 bg-indigo-950/30 shadow-lg shadow-indigo-500/20'
                : 'border-slate-700/50 bg-slate-800/40'}`}>
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Shield className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-indigo-300" />
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-indigo-300">Defender</span>
                </div>
                {activeSpeaker === 'Defender' && <div className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-indigo-400 animate-pulse" />}
              </div>
              <div className={`text-xl sm:text-4xl font-mono font-bold ${defenderTime <= 15 ? 'animate-pulse text-rose-500' : defenderTime <= 60 ? 'text-amber-400' : 'text-slate-100'}`}>
                {formatTime(defenderTime)}
              </div>
            </div>
          </div>

          {/* Chat */}
          <div
            ref={chatContainerRef}
            onScroll={() => {
              const c = chatContainerRef?.current;
              if (c) setIsAutoScrollEnabled(c.scrollTop + c.clientHeight >= c.scrollHeight - 50);
            }}
            className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-5 pr-2"
          >
            {localTranscript?.length === 0 ? (
              playerRole !== 'Spectator' && (
                <div className="flex flex-1 h-full items-center justify-center text-center flex-col gap-2">
                  <MessageCircle className="h-9 w-9 text-cyan-400 opacity-40" />
                  <p className="text-sm text-cyan-300">Send your first argument as {playerRole}!</p>
                </div>
              )
            ) : (
              <>
                {(localTranscript || []).map((message, index) => {
                  const isMe = message?.speaker === playerRole;
                  return (
                    <div key={message?.id || `${message?.speaker}-${index}`}
                      className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] sm:max-w-[72%] rounded-2xl px-4 py-3 sm:px-5 sm:py-4 ${
                        isMe
                          ? 'bg-indigo-600 text-white rounded-br-none'
                          : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none'
                      }`}>
                        <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${
                          message?.speaker === 'Critic' ? 'text-rose-300' : 'text-indigo-300'
                        }`}>
                          {message?.speaker}
                        </p>
                        <TypewriterMessage
                          text={message?.text ?? ''}
                          isAutoScrollEnabled={isAutoScrollEnabled}
                          isLastMessage={index === localTranscript?.length - 1}
                          scrollToBottom={scrollToBottomSafe}
                        />

                        {/* AI Judge Interventions (Result or Processing) */}
                        {objectionLoadingId === message?.id && (
                           <div className="mt-3 p-3 rounded-xl border border-amber-500/30 bg-amber-950/20 text-amber-200 animate-pulse">
                               <div className="flex items-center gap-2 mb-1">
                                   <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                                   <span className="text-xs font-bold uppercase text-amber-500">AI Judge Deliberating...</span>
                               </div>
                               <p className="text-sm italic opacity-80">"Analyzing the logical structure and factual merit of this claim. Please wait."</p>
                           </div>
                        )}

                        {interventions[message?.id] && (
                           <div className="mt-3 p-3 rounded-xl border border-rose-500/50 bg-rose-950/30 text-rose-200">
                               <div className="flex items-center gap-2 mb-1">
                                   <Scale className="h-4 w-4 text-amber-500" />
                                   <span className="text-xs font-bold uppercase text-amber-500">AI Judge Ruling</span>
                               </div>
                               {interventions[message?.id].flagged ? (
                                   <p className="text-sm">
                                     <span className="font-bold text-rose-400 uppercase mr-2">[{interventions[message.id].type}]</span>
                                     {interventions[message.id].reason}
                                   </p>
                               ) : (
                                   <p className="text-sm text-emerald-400 italic">"Objection overruled. The claim holds logical merit."</p>
                               )}
                           </div>
                        )}

                        {/* Objection Button */}
                        {ENABLE_AI_OBJECTION && playerRole !== 'Spectator' && message?.speaker !== playerRole && !hasUsedLifeline && !interventions[message?.id] && (
                            <button
                                onClick={() => handleSummonAIJudge(message?.id)}
                                disabled={objectionLoadingId !== null}
                                className="mt-3 text-xs font-bold uppercase text-slate-500 hover:text-amber-500 flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {objectionLoadingId === message?.id ? (
                                    <><Loader2 className="h-3 w-3 animate-spin text-amber-500"/> Evaluating...</>
                                ) : (
                                    <><Gavel className="h-3 w-3" /> Objection!</>
                                )}
                            </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Input */}
          {playerRole !== 'Spectator' && (
            <div className="shrink-0 border-t border-slate-700/60 pt-2 pb-2 sm:pt-4 sm:pb-4 mt-auto">
              <div className="flex w-full gap-3">
                <div className="flex-1 min-w-0">
                  <textarea
                    ref={textareaRef}
                    value={inputText}
                    onChange={handleTextareaChange}
                    onKeyDown={handleKeyDown}
                    disabled={isInputDisabled}
                    placeholder={
                      matchStatus === 'finished' ? 'Match concluded'
                      : isInputDisabled ? `Waiting for ${activeSpeaker}'s turn…`
                      : 'Type your argument… (Enter to send)'
                    }
                    className="w-full rounded-xl border border-slate-600 bg-slate-800 p-1 px-4 sm:p-3 sm:px-4 text-slate-100 placeholder-slate-500 transition focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-hidden"
                    style={{ minHeight: '40px', maxHeight: '120px' }}
                    rows={1}
                  />
                </div>
                  <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={!inputText.trim() || isInputDisabled}
                    className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-950/40 px-3 py-2 sm:px-5 sm:py-3 text-xs sm:text-sm font-semibold uppercase tracking-wide text-cyan-200 hover:border-cyan-400 hover:text-cyan-100 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 transition"
                  >
                    <Swords className="h-4 w-4 hidden sm:inline" /> 
                    <span>Send</span>
                  </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Game Over Overlay */}
      {isMatchOver && (
        <div className="absolute inset-0 z-100 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="text-center bg-slate-900 border border-slate-700/50 p-8 rounded-2xl shadow-2xl">
            <Loader2 className="h-12 w-12 animate-spin text-cyan-500 mx-auto mb-6" />
            <h2 className="text-3xl font-bold text-slate-100 mb-2">DEBATE CONCLUDED!</h2>
            <p className="text-lg text-slate-400">Heading to Deliberation...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DebateArena;