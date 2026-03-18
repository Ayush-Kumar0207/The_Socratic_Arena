import { Users, Clock, Shield, Swords, ArrowRight, Shuffle, Sparkles, AlertCircle, X } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';

const Lobby = ({ socket, user }) => {
  const { topicId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMatchmaking, setIsMatchmaking] = useState(false);
  const [selectedRole, setSelectedRole] = useState('Random');
  
  // Extract topic from route state (or fallback)
  const topic = location.state?.topic || { id: topicId, title: 'Unknown Topic' };

  useEffect(() => {
    if (!socket) return;

    const handleMatchFound = (data) => {
      const myRole = data.roles ? data.roles[socket.id] : null;
      navigate(`/arena/${data.roomId}`, { state: { ...data, assignedRole: myRole } });
    };

    const handleWaiting = () => {
      setIsMatchmaking(true);
    };

    socket.on('match_found', handleMatchFound);
    socket.on('waiting_for_opponent', handleWaiting);

    return () => {
      socket.off('match_found', handleMatchFound);
      socket.off('waiting_for_opponent', handleWaiting);
    };
  }, [socket, navigate]);

  const handleStartMatchmaking = () => {
    if (!socket) {
      window.alert('Socket not connected');
      return;
    }
    
    setIsMatchmaking(true);
    
    // Emit new payload expected by upgraded backend
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

  const roles = [
    {
      id: 'Critic',
      name: 'Criticize',
      icon: Swords,
      desc: 'Attack the idea with logic',
      color: 'from-rose-500 to-red-600',
      shadow: 'shadow-red-500/20',
      border: 'border-red-500/30'
    },
    {
      id: 'Defender',
      name: 'Defend',
      icon: Shield,
      desc: 'Protect and uphold the stance',
      color: 'from-cyan-500 to-blue-600',
      shadow: 'shadow-cyan-500/20',
      border: 'border-cyan-500/30'
    },
    {
      id: 'Random',
      name: 'Random',
      icon: Shuffle,
      desc: 'Let fate decide your duty',
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
          <header className="text-center mb-10 w-full">
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

          {!isMatchmaking ? (
            <div className="w-full space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {roles.map((role) => (
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
                  <span>Enter Arena</span>
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
                    Summoning Challenger...
                  </span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <p className="text-slate-400 flex items-center gap-2 italic">
                    Preferred Stance: <span className="text-slate-200 non-italic font-bold tracking-widest">{selectedRole}</span>
                  </p>
                  <div className="bg-slate-950/50 border border-slate-800 px-4 py-2 rounded-lg flex items-center gap-2 text-xs text-slate-500">
                    <AlertCircle className="h-3 w-3" />
                    Estimated wait time: &lt; 15 seconds
                  </div>
                </div>
              </div>
              
              <button 
                onClick={handleLeaveQueue}
                className="group flex items-center gap-2 text-slate-500 hover:text-rose-500 px-6 py-2 rounded-xl transition-all hover:bg-rose-500/5 font-black uppercase tracking-widest text-xs"
              >
                <X className="h-4 w-4 group-hover:scale-125 transition-transform" />
                Abort Mission
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Lobby;
