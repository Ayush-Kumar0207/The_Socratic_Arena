import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Shield, Swords, Bot, Square, Search, Users, Download, ArrowLeft, MessageCircle, Trophy, Loader2, Clock, Gavel, Scale, NotebookPen, ArrowRight, Target } from 'lucide-react';
import jsPDF from 'jspdf';
import useVoiceRecognition, { analyzeTextTone } from '../hooks/useVoiceRecognition';
import VoiceOrb from './VoiceOrb';
import { generateStances } from '../utils/stanceUtils';

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
  const { topic: initialTopic, isSpectator, stances: initialStances } = state || {};

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
  
  // Timer sync timestamp to prevent flickering from out-of-order events
  const lastTimeSyncRef = useRef(0);

  // Rehydrate stances if missing (e.g., on refresh)
  const stances = useMemo(() => {
    if (initialStances) return initialStances;
    if (topic) return generateStances(topic);
    return null;
  }, [initialStances, topic]);

  const [localTranscript, setLocalTranscript] = useState([]);
  const [inputText, setInputText] = useState('');

  // Voice of Reason: Scratchpad state (for off-turn voice drafts)
  const [scratchpadText, setScratchpadText] = useState('');
  const [showScratchpadPrompt, setShowScratchpadPrompt] = useState(false);

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

  // ── THE VOICE OF REASON ──
  const isMyTurn = !!(playerRole && activeSpeaker && playerRole.toLowerCase() === activeSpeaker.toLowerCase() && matchStatus === 'active');
  const isMyTurnRef = useRef(isMyTurn);
  useEffect(() => { isMyTurnRef.current = isMyTurn; }, [isMyTurn]);

  // Refs to always access latest functions (prevents stale closure in voice callbacks)
  const handleSendMessageRef = useRef(null);
  const localTranscriptRef = useRef(localTranscript);
  useEffect(() => { localTranscriptRef.current = localTranscript; }, [localTranscript]);

  // Voice command callbacks — use refs to always invoke the latest version
  const handleVoiceSubmit = useCallback(() => {
    if (isMyTurnRef.current && handleSendMessageRef.current) {
      // Small delay to allow any final transcript chunk to land first
      setTimeout(() => {
        if (handleSendMessageRef.current) handleSendMessageRef.current();
      }, 150);
    }
  }, []);

  const handleVoiceClear = useCallback(() => {
    if (isMyTurnRef.current) {
      setInputText('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } else {
      setScratchpadText('');
    }
  }, []);

  const handleVoiceObjection = useCallback(() => {
    if (!ENABLE_AI_OBJECTION || hasUsedLifeline || playerRole === 'Spectator') return;
    const opponentMessages = localTranscriptRef.current.filter(m => m.speaker !== playerRole);
    if (opponentMessages.length > 0) {
      const lastOpponentMsg = opponentMessages[opponentMessages.length - 1];
      if (lastOpponentMsg?.id) {
        handleSummonAIJudge(lastOpponentMsg.id);
      }
    }
  }, [ENABLE_AI_OBJECTION, hasUsedLifeline, playerRole]);

  // SAFETY NET #3: Functional state updates to prevent stale closures
  const handleTranscriptChunk = useCallback(({ text, tone }) => {
    if (isMyTurnRef.current) {
      setInputText(prev => prev ? prev + ' ' + text : text);
    } else {
      setScratchpadText(prev => prev ? prev + ' ' + text : text);
    }
    // We don't store tone per-chunk in state yet, but analyzeTextTone 
    // will re-evaluate the full buffer on send for perfect context.
  }, []);

  const voiceEnabled = playerRole !== 'Spectator' && matchStatus === 'active';

  const {
    isListening,
    interimText,
    audioStream,
    voiceError,
    isSupported: voiceSupported,
    startListening,
    stopListening: stopVoice,
    volume,
  } = useVoiceRecognition({
    onSubmit: handleVoiceSubmit,
    onClear: handleVoiceClear,
    onObjection: handleVoiceObjection,
    onTranscriptChunk: handleTranscriptChunk,
    enabled: voiceEnabled,
  });

  // Show scratchpad prompt when turn transitions to user and scratchpad has content
  useEffect(() => {
    if (isMyTurn && scratchpadText.trim()) {
      setShowScratchpadPrompt(true);
    } else {
      setShowScratchpadPrompt(false);
    }
  }, [isMyTurn, scratchpadText]);

  // Paste scratchpad into main input
  const useScratchpad = useCallback(() => {
    setInputText(prev => prev ? prev + ' ' + scratchpadText.trim() : scratchpadText.trim());
    setScratchpadText('');
    setShowScratchpadPrompt(false);
  }, [scratchpadText]);

  const dismissScratchpad = useCallback(() => {
    setScratchpadText('');
    setShowScratchpadPrompt(false);
  }, []);

  useEffect(() => {
    const initArena = async () => {
      if (!matchId) {
        setErrorMsg("Critical Error: No Match ID found in URL.");
        return;
      }

      // UUID Format Validation
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(matchId)) {
        setErrorMsg("🔴 Arena Error: Invalid Match ID format. Redirecting to Explore...");
        setTimeout(() => navigate('/explore'), 3000);
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
        setLoadingMsg("Securely initializing battle connection...");
        const { data: match, error } = await supabase
          .from('matches')
          .select('*')
          .eq('id', matchId)
          .maybeSingle(); // Use maybeSingle to avoid throw on missing record

        if (match?.status === 'abandoned') {
          setErrorMsg('🔴 Arena Error: This match was abandoned due to disconnection. Redirecting to Explore...');
          setTimeout(() => navigate('/explore'), 3000);
          return;
        }

        if (match) {
          setTopic(match.topic_title || match.topic);
          if (match.status !== 'abandoned') {
            setMatchStatus('active');
          }

          // Deterministic Role Assignment
          if (user?.id === match.critic_id) {
            setPlayerRole('Critic');
          } else if (user?.id === match.defender_id) {
            setPlayerRole('Defender');
          } else {
            setPlayerRole('Spectator');
          }
          setIsInitializing(false);
        } else {
          // Topic might be in location state if it's a fresh creation
          if (initialTopic) setTopic(initialTopic);

          // If match not in DB yet (Transient), we wait for handleMatchFound (Socket)
          setLoadingMsg("Synchronizing live stream with server...");
          // We don't setIsInitializing(false) yet; socket will trigger it via setMatchStatus('active')
        }
      } catch (err) {
        console.warn("Arena DB Fetch Warning (might be a transient match):", err);
        // Don't set errorMsg yet, let socket attempt to hydrate
        if (initialTopic) setTopic(initialTopic);
        setLoadingMsg("Synchronizing live stream with server...");
      }
    };

    initArena();
  }, [matchId, user, initialTopic]);

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
      // CRITICAL FIX: Determine role by user ID first (reliable), socket ID fallback (transient)
      let role = 'Unknown';
      if (user?.id) {
        if (data.criticUserId === user.id) {
          role = 'Critic';
        } else if (data.defenderUserId === user.id) {
          role = 'Defender';
        }
      }
      // Fallback to socket-based role detection for transient matches
      if (role === 'Unknown' && data.roles) {
        role = data.roles[socket.id] || 'Spectator';
      }
      
      setRoomId(data.roomId);
      setPlayerRole(role);
      setMatchStatus('active');
      setLocalTranscript(data.transcript || []);
      setActiveSpeaker(data.activeSpeaker || 'Critic');
      setTopic(data.topic || '');
      setIsInitializing(false); // Unlock UI for transient rooms
      // Reset timer sync on match found
      lastTimeSyncRef.current = 0;
    };

    const handleTimeSync = ({ criticTime: ct, defenderTime: dt, activeSpeaker: as, timestamp }) => {
      // Prevent flickering from out-of-order or duplicate time_sync events
      const ts = timestamp || Date.now();
      if (ts < lastTimeSyncRef.current) {
        return; // Ignore stale time_sync
      }
      lastTimeSyncRef.current = ts;
      
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

    setIsAutoScrollEnabled(true);

    // Apply Affective Tone Analysis (Text-Voice Parity)
    // This ensures typed "!!!" or "Are you sure" gains the same tone as voice.
    const { text, tone } = analyzeTextTone(inputText.trim());

    socket.emit('submit_turn', { 
      roomId, 
      message: text,
      tone: tone || 'neutral'
    });

    setInputText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  // Keep ref in sync so voice callbacks always call the latest version
  handleSendMessageRef.current = handleSendMessage;

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
        <div className="flex-1 flex flex-col min-h-0 relative">
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
              </div>
              {matchStatus === 'finished' && (
                <button onClick={() => setMatchStatus('idle')}
                  className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-950/40 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-cyan-200 hover:border-cyan-400 transition">
                  <Search className="h-4 w-4" /> New Match
                </button>
              )}
            </div>
          </div>

          {/* Mission Ribbon - Integrated into layout to prevent overlap */}
          {playerRole !== 'Spectator' && stances && (
             <div className="shrink-0 mb-4 animate-[slideDown_0.75s_ease-out]">
                <div className={`mx-auto max-w-full px-4 py-3 rounded-2xl border backdrop-blur-xl shadow-2xl flex items-center justify-between gap-3 ${
                  playerRole === 'Critic' 
                    ? 'bg-rose-950/30 border-rose-500/20 text-rose-100 shadow-rose-950/50' 
                    : 'bg-indigo-950/30 border-indigo-500/20 text-indigo-100 shadow-indigo-950/50'
                }`}>
                  <div className="flex items-center gap-2.5">
                    <Target className={`h-4 w-4 shrink-0 transition-transform hover:scale-120 ${playerRole === 'Critic' ? 'text-rose-400' : 'text-indigo-400'}`} />
                    <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] opacity-80">
                      Primary Directive
                    </p>
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-white tracking-wide">
                    {playerRole === 'Defender' ? stances.stanceA : stances.stanceB}
                  </p>
                  <div className={`h-2 w-2 rounded-full animate-pulse ${playerRole === 'Critic' ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]' : 'bg-indigo-500 shadow-[0_0_8px_#6366f1]'}`} />
                </div>

                {/* Sub-label for Topic under the ribbon */}
                {topic && (
                  <p className="mt-2 text-[10px] sm:text-[11px] text-cyan-400/80 font-bold uppercase tracking-[0.1em] flex items-center gap-1.5 px-2">
                    <MessageCircle className="h-3 w-3" /> {topic}
                  </p>
                )}
             </div>
          )}

          {/* Timers */}
          <div className="shrink-0 grid grid-cols-2 gap-2 sm:gap-4 mb-3 sm:mb-5">
            <div className={`rounded-xl border-2 p-2 sm:p-4 transition-all duration-300 ${activeSpeaker === 'Critic'
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

            <div className={`rounded-xl border-2 p-2 sm:p-4 transition-all duration-300 ${activeSpeaker === 'Defender'
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
            className={`flex-1 min-h-0 overflow-y-auto flex flex-col gap-5 pr-2 custom-scrollbar transition-all pt-2 pb-4`}
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
                      className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'} mb-2`}>
                      <div className={`max-w-[85%] sm:max-w-[72%] rounded-2xl px-4 py-3 sm:px-5 sm:py-4 transition-all duration-500 ${isMe
                          ? 'bg-indigo-600 text-white rounded-br-none shadow-lg'
                          : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none shadow-md'
                        } tone-${message?.tone || 'neutral'}`}>
                        <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center justify-between ${message?.speaker === 'Critic' ? 'text-rose-300' : 'text-indigo-300'
                          }`}>
                          <span>{message?.speaker}</span>
                          {message?.tone && message.tone !== 'neutral' && (
                             <span className="text-[9px] opacity-40 italic font-medium ml-2">
                               [{message.tone}]
                             </span>
                          )}
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
                              <><Loader2 className="h-3 w-3 animate-spin text-amber-500" /> Evaluating...</>
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

              {/* Scratchpad Prompt — appears when turn transitions to user with scratchpad content */}
              {showScratchpadPrompt && (
                <div className="mb-2 flex items-center gap-2 bg-amber-950/30 border border-amber-500/30 rounded-xl px-3 py-2 animate-in slide-in-from-bottom duration-300">
                  <NotebookPen className="h-4 w-4 text-amber-400 shrink-0" />
                  <p className="text-xs text-amber-200 flex-1 truncate">
                    <span className="font-bold">Scratchpad:</span> {scratchpadText.slice(0, 80)}{scratchpadText.length > 80 ? '…' : ''}
                  </p>
                  <button
                    onClick={useScratchpad}
                    className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1 rounded-lg border border-amber-500/30 transition-all flex items-center gap-1 cursor-pointer"
                  >
                    Use <ArrowRight className="h-3 w-3" />
                  </button>
                  <button
                    onClick={dismissScratchpad}
                    className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-300 px-2 py-1 rounded-lg transition-all cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Scratchpad Panel — visible during opponent's turn when listening */}
              {isListening && !isMyTurn && scratchpadText && (
                <div className="mb-2 bg-slate-900/70 border border-red-500/20 rounded-xl px-3 py-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <NotebookPen className="h-3 w-3 text-red-400" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-red-400">Private Scratchpad</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{scratchpadText}</p>
                </div>
              )}

              {/* Voice interim preview */}
              {isListening && interimText && (
                <div className="mb-2 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/30">
                  <p className="text-xs text-slate-500 italic truncate">
                    🎙️ {interimText}
                  </p>
                </div>
              )}

              <div className="flex w-full gap-2 sm:gap-3 items-end">
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
                          : isListening ? 'Listening… speak your argument'
                            : 'Type your argument… (Enter to send)'
                    }
                    className="w-full rounded-xl border border-slate-600 bg-slate-800 p-1 px-4 sm:p-3 sm:px-4 text-slate-100 placeholder-slate-500 transition focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-hidden"
                    style={{ minHeight: '40px', maxHeight: '120px' }}
                    rows={1}
                  />
                </div>

                {/* Voice Orb */}
                {voiceSupported && (
                  <VoiceOrb
                    volume={volume}
                    isListening={isListening}
                    isMyTurn={isMyTurn}
                    isDisabled={matchStatus !== 'active'}
                    onClick={startListening}
                    interimText={interimText}
                    scratchpadText={scratchpadText}
                    error={voiceError}
                  />
                )}

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
        </div>
      )}

      {/* Game Over Overlay */}
      {isMatchOver && (
        <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm">
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