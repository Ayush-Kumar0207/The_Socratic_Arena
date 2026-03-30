import { Users, Clock, Shield, Swords, ArrowRight, Shuffle, Sparkles, AlertCircle, X, Copy, CheckCircle2, Link2 } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState, useRef, useMemo } from 'react';
import { generateStances } from '../utils/stanceUtils';

const Lobby = ({ socket, user }) => {
  const { topicId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMatchmaking, setIsMatchmaking] = useState(false);
  const [selectedRole, setSelectedRole] = useState('Random');
  
  // Private Arena state
  const [arenaCode, setArenaCode] = useState(null);
  const [arenaId, setArenaId] = useState(null);
  const [isPaired, setIsPaired] = useState(false);
  const [opponentId, setOpponentId] = useState(null);
  const [myRole, setMyRole] = useState(null); // 'creator' or 'joiner'
  const myRoleRef = useRef(null);
  const [opponentStance, setOpponentStance] = useState(null);
  const [copied, setCopied] = useState(false);
  const [privateError, setPrivateError] = useState(null);
  const [isSocketConnected, setIsSocketConnected] = useState(socket?.connected || false);

  // Check if we arrived via "Join Arena" with an arenaCode in route state
  const incomingArenaCode = location.state?.arenaCode;
  
  // Extract topic from route state (or fallback)
  const topic = location.state?.topic || { id: topicId, title: 'Unknown Topic' };

  // Calculate dynamic stances
  const stances = useMemo(() => generateStances(topic.title), [topic.title]);

  useEffect(() => {
    if (!socket) return;

    // --- Normal matchmaking listeners ---
    const handleMatchFound = (data) => {
      const assignedRole = data.roles ? data.roles[socket.id] : null;
      navigate(`/arena/${data.roomId}`, { state: { ...data, assignedRole, stances } });
    };

    const handleWaiting = () => {
      setIsMatchmaking(true);
    };

    // --- Private Arena listeners ---
    const handleArenaCreated = ({ arenaCode: code, arenaId: id }) => {
      setArenaCode(code);
      setArenaId(id);
      setMyRole('creator');
      myRoleRef.current = 'creator';
      setPrivateError(null);
    };

    const handleArenaJoined = ({ arenaId: id, creatorId, joinerId, topicTitle }) => {
      setArenaId(id);
      setIsPaired(true);
      setPrivateError(null);
      if (creatorId === user?.id) {
        setMyRole('creator');
        myRoleRef.current = 'creator';
        setOpponentId(joinerId);
      } else {
        setMyRole('joiner');
        myRoleRef.current = 'joiner';
        setOpponentId(creatorId);
      }
    };

    const handleStanceUpdate = ({ creatorStance, joinerStance }) => {
      // Use ref to always get the latest myRole (avoids stale closure)
      if (myRoleRef.current === 'creator') {
        setOpponentStance(joinerStance);
      } else {
        setOpponentStance(creatorStance);
      }
    };

    const handlePrivateError = ({ message }) => {
      setPrivateError(message);
      setTimeout(() => setPrivateError(null), 4000);
    };

    const handleStatusChange = () => {
      setIsSocketConnected(socket.connected);
      // If we just connected and don't have an arena code yet, try again
      if (socket.connected) {
        if (!incomingArenaCode) {
          socket.emit('create_private_arena', {
            userId: user?.id,
            topicId: topic.id,
            topicTitle: topic.title
          });
        } else {
          setMyRole('joiner');
          myRoleRef.current = 'joiner';
          socket.emit('join_private_arena', {
            userId: user?.id,
            arenaCode: incomingArenaCode
          });
        }
      }
    };

    socket.on('connect', handleStatusChange);
    socket.on('disconnect', handleStatusChange);

    socket.on('match_found', handleMatchFound);
    socket.on('waiting_for_opponent', handleWaiting);
    socket.on('private_arena_created', handleArenaCreated);
    socket.on('private_arena_joined', handleArenaJoined);
    socket.on('private_arena_stance_update', handleStanceUpdate);
    socket.on('private_arena_error', handlePrivateError);

    // Initial attempt if connected
    if (socket.connected) {
      handleStatusChange();
    } else {
      // If not connected, it might be Render cold start — wait for 'connect' event
      console.log("[Lobby] Socket not connected, waiting for backend to wake up...");
    }

    return () => {
      socket.off('connect', handleStatusChange);
      socket.off('disconnect', handleStatusChange);
      socket.off('match_found', handleMatchFound);
      socket.off('waiting_for_opponent', handleWaiting);
      socket.off('private_arena_created', handleArenaCreated);
      socket.off('private_arena_joined', handleArenaJoined);
      socket.off('private_arena_stance_update', handleStanceUpdate);
      socket.off('private_arena_error', handlePrivateError);
    };
  }, [socket, navigate, incomingArenaCode, topic.id, topic.title]);

  // Broadcast stance changes when paired
  useEffect(() => {
    if (!socket || !isPaired || !arenaId || !myRole) return;
    socket.emit('private_arena_set_stance', {
      arenaId,
      stance: selectedRole,
      role: myRole
    });
  }, [selectedRole, isPaired, arenaId, myRole, socket]);

  const handleStartMatchmaking = () => {
    if (!socket) {
      window.alert('Socket not connected');
      return;
    }

    if (isPaired && arenaId) {
      // Private arena — start directly!
      socket.emit('start_private_debate', { arenaId });
      setIsMatchmaking(true);
      return;
    }
    
    // Normal queue matchmaking
    setIsMatchmaking(true);
    socket.emit('join_queue', { 
      userId: user?.id,
      topicId: topic.id,
      topicTitle: topic.title,
      preferredRole: selectedRole
    });
  };

  const handleLeaveQueue = () => {
    if (!socket) return;
    socket.emit('leave_queue');
    setIsMatchmaking(false);
  };

  const handleCopyCode = () => {
    if (!arenaCode) return;
    navigator.clipboard.writeText(arenaCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatSocraticId = (id) => {
    if (!id) return '...';
    return id.split('-')[0] + '...';
  };

  const displayRoles = [
    {
      id: 'Defender',
      name: stances.stanceA,
      icon: Shield,
      desc: stances.descA,
      color: 'from-cyan-500 to-blue-600',
      shadow: 'shadow-cyan-500/20',
      border: 'border-cyan-500/30'
    },
    {
      id: 'Critic',
      name: stances.stanceB,
      icon: Swords,
      desc: stances.descB,
      color: 'from-rose-500 to-red-600',
      shadow: 'shadow-red-500/20',
      border: 'border-red-500/30'
    },
    {
      id: 'Random',
      name: 'Random Duty',
      icon: Shuffle,
      desc: 'Let fate decide your mission',
      color: 'from-slate-600 to-slate-700',
      shadow: 'shadow-slate-500/20',
      border: 'border-slate-500/30'
    }
  ];

  return (
    <div className="flex flex-col min-h-[calc(100vh-64px)] bg-[#0b0f19] text-slate-200 p-8 items-center justify-center">
      <div className="max-w-4xl w-full bg-slate-900/50 backdrop-blur-md border border-[#1e293b] rounded-3xl p-8 sm:p-12 shadow-2xl relative overflow-hidden">
        
        {/* Decorative corner glows */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center">
          <header className="text-center mb-6 w-full">
            <div className="flex items-center justify-center gap-2 text-cyan-400 font-bold tracking-[0.2em] uppercase text-xs mb-4">
              <Sparkles className="h-4 w-4" />
              Arena Preparation
              <Sparkles className="h-4 w-4" />
            </div>
            
            <h1 className="text-3xl sm:text-5xl font-black text-slate-100 mb-4 leading-tight">
              {topic.title}
            </h1>
            <p className="text-slate-400 max-w-xl mx-auto">
              You are about to enter the ring. Choose your combat stance carefully.
            </p>
          </header>

          {/* Connection Status Banner (for Cold Starts) */}
          {!isSocketConnected && (
            <div className="w-full max-w-md mb-6 animate-pulse">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center gap-4">
                <div className="shrink-0 bg-amber-500/20 rounded-full p-2">
                  <Clock className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-amber-200">Waking up the Arena...</h3>
                  <p className="text-[11px] text-amber-500/80 leading-tight">Backend is spinning up (Render Cold Start). Please wait 30-50 seconds.</p>
                </div>
              </div>
            </div>
          )}

          {/* Arena Code Badge */}
          {arenaCode && !isPaired && (
            <div className="w-full max-w-md mb-6">
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="shrink-0 bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-2">
                    <Link2 className="h-5 w-5 text-indigo-400" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Arena Code — Share to invite</p>
                    <p className="text-lg font-mono font-black text-slate-100 tracking-widest">{arenaCode}</p>
                  </div>
                </div>
                <button 
                  onClick={handleCopyCode} 
                  className="shrink-0 bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 rounded-lg p-2.5 transition-all active:scale-90"
                  title="Copy Arena Code"
                >
                  {copied ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <Copy className="h-5 w-5 text-slate-400" />}
                </button>
              </div>
            </div>
          )}

          {/* Paired Mode — Opponent Connected Banner */}
          {isPaired && (
            <div className="w-full max-w-md mb-6">
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-emerald-300 font-bold text-sm uppercase tracking-wider">Opponent Connected!</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">You</p>
                    <p className="text-sm font-mono text-cyan-400">{formatSocraticId(user?.id)}</p>
                  </div>
                  <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/50">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Opponent</p>
                    <p className="text-sm font-mono text-rose-400">{formatSocraticId(opponentId)}</p>
                  </div>
                </div>
                {opponentStance && (
                  <p className="text-xs text-slate-400 text-center">
                    Opponent chose: <span className="font-bold text-slate-200">{opponentStance}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Error feedback */}
          {privateError && (
            <div className="w-full max-w-md mb-4 bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-medium px-4 py-3 rounded-xl">
              {privateError}
            </div>
          )}

          {!isMatchmaking ? (
            <div className="w-full space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {displayRoles.map((role) => (
                  <button
                    key={role.id}
                    onClick={() => setSelectedRole(role.id)}
                    className={`relative group flex flex-col items-center text-center p-6 rounded-2xl border transition-all duration-300 ${
                      selectedRole === role.id 
                        ? `bg-slate-800/80 ${role.border} ${role.shadow} ring-2 ring-offset-4 ring-offset-slate-900 ring-opacity-50 ${role.id === 'Critic' ? 'ring-red-500' : role.id === 'Defender' ? 'ring-cyan-500' : 'ring-slate-500'}`
                        : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
                    }`}
                  >
                    <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${role.color} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                      <role.icon className="h-6 w-6 text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-100 mb-1">{role.name}</h3>
                    <p className="text-xs text-slate-500 group-hover:text-slate-400 transition-colors uppercase tracking-wider font-semibold">
                      {role.desc}
                    </p>
                    
                    {selectedRole === role.id && (
                      <div className={`absolute -top-2 -right-2 h-6 w-6 rounded-full bg-gradient-to-r ${role.color} flex items-center justify-center shadow-lg border-2 border-slate-900`}>
                        <ArrowRight className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>

              <div className="flex flex-col items-center gap-6 pt-4">
                <button 
                  onClick={handleStartMatchmaking}
                  className="group relative w-full sm:w-80 flex items-center justify-center gap-3 bg-white text-slate-950 text-xl font-black px-10 py-5 rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:shadow-[0_0_50px_rgba(255,255,255,0.4)] overflow-hidden"
                >
                  <div className={`absolute inset-0 bg-gradient-to-r opacity-0 group-hover:opacity-10 transition-opacity duration-300 ${
                    selectedRole === 'Critic' ? 'from-red-500 to-rose-600' : 
                    selectedRole === 'Defender' ? 'from-cyan-500 to-blue-600' : 
                    'from-slate-400 to-slate-500'
                  }`} />
                  <span>{isPaired ? 'Start Debate' : 'Enter Arena'}</span>
                  <Swords className="h-6 w-6 group-hover:rotate-12 transition-transform" />
                </button>
                
                <button 
                  onClick={() => navigate('/explore')}
                  className="text-slate-500 hover:text-slate-300 transition-all text-sm font-bold uppercase tracking-widest flex items-center gap-2 px-4 py-2"
                >
                  <ArrowRight className="h-4 w-4 rotate-180" />
                  Change Topic
                </button>
              </div>
            </div>
          ) : (
            <div className="w-full flex flex-col items-center gap-8 py-8">
              <div className="relative">
                <div className="h-32 w-32 border-4 border-slate-800 border-t-cyan-500 rounded-full animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-24 w-24 border-4 border-slate-800 border-b-indigo-500 rounded-full animate-[spin_1.5s_linear_infinite_reverse]" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Clock className="h-8 w-8 text-slate-100 animate-pulse" />
                </div>
              </div>

              <div className="text-center space-y-4">
                <div className="flex items-center justify-center gap-3">
                  <div className={`h-3 w-3 rounded-full animate-ping ${selectedRole === 'Critic' ? 'bg-red-500' : selectedRole === 'Defender' ? 'bg-cyan-500' : 'bg-slate-400'}`} />
                  <span className="text-2xl font-black text-slate-100 uppercase tracking-tighter">
                    {isPaired ? 'Starting Debate...' : 'Summoning Challenger...'}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <p className="text-slate-400 flex items-center gap-2 italic">
                    Preferred Stance: <span className="text-slate-200 non-italic font-bold tracking-widest">{selectedRole}</span>
                  </p>
                  {!isPaired && (
                    <div className="bg-slate-950/50 border border-slate-800 px-4 py-2 rounded-lg flex items-center gap-2 text-xs text-slate-500">
                      <AlertCircle className="h-3 w-3" />
                      Estimated wait time: &lt; 15 seconds
                    </div>
                  )}
                </div>
              </div>
              
              {!isPaired && (
                <button 
                  onClick={handleLeaveQueue}
                  className="group flex items-center gap-2 text-slate-500 hover:text-rose-500 px-6 py-2 rounded-xl transition-all hover:bg-rose-500/5 font-black uppercase tracking-widest text-xs"
                >
                  <X className="h-4 w-4 group-hover:scale-125 transition-transform" />
                  Abort Mission
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Lobby;
