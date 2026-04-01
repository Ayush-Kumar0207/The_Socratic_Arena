import { useEffect, useState, lazy, Suspense, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { supabase } from './lib/supabaseClient';

// Core layout & critical pages (Keep static for instant first paint)
import Navbar from './components/Navbar';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import ErrorBoundary from './components/ErrorBoundary';
import OfflineToast from './components/OfflineToast';
import { useRegisterSW } from 'virtual:pwa-register/react';

// Heavy sub-pages (Lazy load to reduce initial bundle size)
const Explore = lazy(() => import('./components/Explore'));
const MyArena = lazy(() => import('./components/MyArena'));
const Lobby = lazy(() => import('./components/Lobby'));
const DebateArena = lazy(() => import('./components/DebateArena'));
const MatchReview = lazy(() => import('./components/MatchReview'));
const TopicMatches = lazy(() => import('./components/TopicMatches'));

// Singleton Socket (Auto-connect disabled until token is ready)
const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000', {
  transports: ['polling', 'websocket'], // Polling first for LAN compatibility
  autoConnect: false,
  reconnectionAttempts: 10,
  reconnectionDelay: 3000,
  timeout: 20000, // Extended timeout for slow LANs
});

const App = () => {
  const [session, setSession] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createTopic, setCreateTopic] = useState('');
  const [createQuestion, setCreateQuestion] = useState('');
  const [createStatus, setCreateStatus] = useState('idle');
  const [createFeedback, setCreateFeedback] = useState('');

  // Join Arena dialog state
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinStatus, setJoinStatus] = useState('idle');
  const [joinFeedback, setJoinFeedback] = useState('');

  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  // PWA Service Worker — lifted here so upgrade state flows into NotificationBell
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('[PWA] SW Registered:', r);
      // Periodic Update Heartbeat — check for new deployments every 20 mins
      if (r) {
        setInterval(() => {
          console.log('[PWA] Checking for updates...');
          r.update().catch(err => console.error('[PWA] Update Check Failed:', err));
        }, 20 * 60 * 1000);
      }
    },
    onRegisterError(error) { console.error('[PWA] SW Registration Error:', error); },
  });

  // Notification state
  const [notifications, setNotifications] = useState([]);
  const unreadCount = notifications.filter(n => !n.is_read).length;

  // Challenge flow state (when challenging from profile)
  const [challengeTarget, setChallengeTarget] = useState(null);

  // Fetch notifications from server
  const fetchNotifications = useCallback(() => {
    if (socket?.connected) socket.emit('fetch_notifications');
  }, []);

  useEffect(() => {
    // Auth Resilience: Retry with Exponential Backoff (500ms, 1s, 2s)
    const fetchSession = async (retryCount = 0) => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setIsAuthLoading(false);
        if (session) {
          socket.auth = { token: session.access_token };
          socket.connect();
        }
      } catch (err) {
        if (retryCount < 3) {
          const backoff = Math.pow(2, retryCount) * 500;
          console.warn(`[Auth] Retry ${retryCount + 1}/3 in ${backoff}ms...`);
          setTimeout(() => fetchSession(retryCount + 1), backoff);
        } else {
          setIsAuthLoading(false);
          console.error('[Auth] Session fetch failed after retries:', err);
        }
      }
    };

    fetchSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // CRITICAL: Detect password recovery BEFORE setting session
      // This prevents auto-redirect to Dashboard when user clicks the reset link in email
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
        setSession(session); // Still set session so Supabase auth context is valid for updateUser
        return; // Don't connect socket or do anything else
      }

      setSession(session);
      if (session) {
        if (socket.auth?.token !== session.access_token) {
          socket.auth = { token: session.access_token };
          if (socket.connected) {
            socket.disconnect().connect();
          } else {
            socket.connect();
          }
        }

      } else {
        socket.disconnect();
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Socket listeners for notifications & challenges
  useEffect(() => {
    if (!socket) return;

    const handleNotificationsList = ({ notifications: notifs }) => setNotifications(notifs || []);
    const handleChallengeReceived = (data) => {
      setNotifications(prev => [{
        id: `rt_${Date.now()}`,
        type: 'challenge_received',
        title: 'Challenge Received!',
        message: `${data.challengerName} challenged you on "${data.topicTitle}"`,
        metadata: data,
        is_read: false,
        created_at: new Date().toISOString()
      }, ...prev]);
    };
    const handleChallengeAccepted = (data) => {
      setNotifications(prev => [{
        id: `rt_${Date.now()}`,
        type: 'challenge_accepted',
        title: 'Challenge Accepted!',
        message: `${data.acceptorName} accepted your challenge!`,
        metadata: data,
        is_read: false,
        created_at: new Date().toISOString()
      }, ...prev]);
    };
    const handleChallengeExpired = ({ challengeId }) => {
      setNotifications(prev => prev.map(n =>
        n.metadata?.challengeId === challengeId ? { ...n, metadata: { ...n.metadata, expired: true } } : n
      ));
    };
    const handleConnect = () => fetchNotifications();

    socket.on('notifications_list', handleNotificationsList);
    socket.on('challenge_received', handleChallengeReceived);
    socket.on('challenge_accepted', handleChallengeAccepted);
    socket.on('challenge_expired', handleChallengeExpired);
    socket.on('connect', handleConnect);

    // Fetch on mount if already connected
    if (socket.connected) fetchNotifications();

    return () => {
      socket.off('notifications_list', handleNotificationsList);
      socket.off('challenge_received', handleChallengeReceived);
      socket.off('challenge_accepted', handleChallengeAccepted);
      socket.off('challenge_expired', handleChallengeExpired);
      socket.off('connect', handleConnect);
    };
  }, [fetchNotifications]);

  if (isAuthLoading) {
    return null; // index.html skeleton spinner is already visible
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Render persistent Navbar only for authenticated users */}
      {session && <Navbar user={session.user} socket={socket} needRefresh={needRefresh} setNeedRefresh={setNeedRefresh} updateServiceWorker={updateServiceWorker} onCreateArena={() => { setShowCreateDialog(true); setCreateTopic(''); setCreateQuestion(''); setCreateStatus('idle'); setCreateFeedback(''); }} onJoinArena={() => { setShowJoinDialog(true); setJoinCode(''); setJoinStatus('idle'); setJoinFeedback(''); }} notifications={notifications} unreadCount={unreadCount} onMarkRead={(ids) => { socket.emit('mark_notifications_read', { notificationIds: ids }); setNotifications(prev => prev.map(n => ids ? (ids.includes(n.id) ? { ...n, is_read: true } : n) : { ...n, is_read: true })); }} setChallengeTarget={setChallengeTarget} />}

      {/* GLOBAL CREATE ARENA DIALOG */}
      {showCreateDialog && <CreateArenaDialog
        createTopic={createTopic}
        setCreateTopic={setCreateTopic}
        createQuestion={createQuestion}
        setCreateQuestion={setCreateQuestion}
        createStatus={createStatus}
        setCreateStatus={setCreateStatus}
        createFeedback={createFeedback}
        setCreateFeedback={setCreateFeedback}
        setShowCreateDialog={setShowCreateDialog}
        socket={socket}
      />}

      {/* GLOBAL JOIN ARENA DIALOG */}
      {showJoinDialog && <JoinArenaDialog
        joinCode={joinCode}
        setJoinCode={setJoinCode}
        joinStatus={joinStatus}
        setJoinStatus={setJoinStatus}
        joinFeedback={joinFeedback}
        setJoinFeedback={setJoinFeedback}
        setShowJoinDialog={setShowJoinDialog}
        userId={session?.user?.id}
      />}

      <Suspense fallback={
        <div className="flex h-[calc(100vh-64px)] w-full items-center justify-center bg-slate-950">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-500"></div>
            <div className="text-slate-400 font-medium animate-pulse">Loading Arena Module...</div>
          </div>
        </div>
      }>
        <Routes>
          {/* Public / Entry Route */}
          <Route
            path="/"
            element={
              isPasswordRecovery
                ? <Login initialView="reset" onResetComplete={() => { setIsPasswordRecovery(false); }} />
                : session ? <Navigate to="/dashboard" replace /> : <Login />
            }
          />

          {/* Authenticated Routes — Wrapped in ErrorBoundaries for Chunk Load Failure recovery */}
          <Route
            path="/dashboard"
            element={session ? <Dashboard user={session.user} socket={socket} /> : <Navigate to="/" replace />}
          />
          <Route
            path="/explore"
            element={session ? <ErrorBoundary><Explore user={session.user} socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />}
          />
          <Route 
            path="/my-arena" 
            element={session ? <ErrorBoundary><MyArena user={session.user} socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />} 
          />
          <Route
            path="/lobby/:topicId"
            element={session ? <ErrorBoundary><Lobby user={session.user} socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />}
          />
          <Route
            path="/arena/:matchId"
            element={session ? <ErrorBoundary><DebateArena socket={socket} user={session.user} /></ErrorBoundary> : <Navigate to="/" replace />}
          />
          <Route
            path="/review/:matchId"
            element={session ? <ErrorBoundary><MatchReview /></ErrorBoundary> : <Navigate to="/" replace />}
          />
          <Route
            path="/topic/:topicTitle"
            element={session ? <ErrorBoundary><TopicMatches socket={socket} user={session.user} /></ErrorBoundary> : <Navigate to="/" replace />}
          />

          {/* Fallback routing */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>

      <OfflineToast session={session} />
    </div>
  );
};

export default App;

// --- Create Arena Dialog Component ---
import { Plus, X, Loader2 } from 'lucide-react';

function CreateArenaDialog({ createTopic, setCreateTopic, createQuestion, setCreateQuestion, createStatus, setCreateStatus, createFeedback, setCreateFeedback, setShowCreateDialog, socket }) {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={() => createStatus !== 'creating' && setShowCreateDialog(false)}>
      <div className="bg-[#0f172a] border border-slate-700/50 rounded-2xl shadow-2xl w-full max-w-lg p-5 sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-100 flex items-center gap-3">
            <div className="bg-gradient-to-br from-indigo-500 to-cyan-500 p-2 rounded-lg">
              <Plus className="h-5 w-5 text-white" />
            </div>
            Create Arena
          </h2>
          <button onClick={() => createStatus !== 'creating' && setShowCreateDialog(false)} className="text-slate-400 hover:text-slate-200 transition-colors p-1 hover:bg-slate-800 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">Topic Category</label>
            <input
              type="text"
              placeholder='e.g. Education, Technology, Geopolitics...'
              value={createTopic}
              onChange={(e) => setCreateTopic(e.target.value)}
              disabled={createStatus === 'creating'}
              className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl py-3 px-4 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all text-sm disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">Debate Question</label>
            <input
              type="text"
              placeholder='e.g. Is online education better than offline education?'
              value={createQuestion}
              onChange={(e) => setCreateQuestion(e.target.value)}
              disabled={createStatus === 'creating'}
              className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl py-3 px-4 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all text-sm disabled:opacity-50"
            />
          </div>

          {createFeedback && (
            <div className={`text-sm font-medium px-4 py-3 rounded-xl border ${
              createStatus === 'error'
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : createStatus === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}>
              {createFeedback}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setShowCreateDialog(false)}
              disabled={createStatus === 'creating'}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (!createQuestion.trim() || createQuestion.trim().length < 5) {
                  setCreateStatus('error');
                  setCreateFeedback('Please enter a debate question (at least 5 characters).');
                  return;
                }
                setCreateStatus('creating');
                setCreateFeedback('');

                const questionText = createQuestion.trim();
                const categoryText = createTopic.trim();

                // Helper: find or create topic in DB, then navigate to lobby
                const navigateToLobby = async (topicTitle) => {
                  // Poll for the topic to appear in DB (it may take a moment after socket insert)
                  let topic = null;
                  for (let i = 0; i < 5; i++) {
                    const { data } = await supabase.from('topics').select('*').eq('title', topicTitle).single();
                    if (data) { topic = data; break; }
                    await new Promise(r => setTimeout(r, 800));
                  }
                  setShowCreateDialog(false);
                  if (topic) {
                    navigate(`/lobby/${topic.id}`, { state: { topic } });
                  } else {
                    // Absolute fallback: navigate to explore
                    navigate('/explore');
                  }
                };

                // 1. Check if this exact topic already exists
                const { data: existingTopics } = await supabase
                  .from('topics')
                  .select('*')
                  .order('created_at', { ascending: false });

                if (existingTopics) {
                  const match = existingTopics.find(t =>
                    t.title && t.title.toLowerCase() === questionText.toLowerCase()
                  );
                  if (match) {
                    setCreateStatus('success');
                    setCreateFeedback(`Arena "${match.title}" already exists! Redirecting to lobby...`);
                    setTimeout(() => {
                      setShowCreateDialog(false);
                      navigate(`/lobby/${match.id}`, { state: { topic: match } });
                    }, 1000);
                    return;
                  }

                  // Also ensure the category topic exists in DB for Discover Topics
                  if (categoryText) {
                    const categoryExists = existingTopics.find(t =>
                      t.title && t.title.toLowerCase() === categoryText.toLowerCase()
                    );
                    if (!categoryExists) {
                      await supabase.from('topics').insert({ title: categoryText, category: 'General' });
                    }
                  }
                }

                // 2. Use socket for AI semantic check, with a timeout fallback
                if (socket) {
                  let handled = false;

                  const handleResult = async (data) => {
                    if (handled) return;
                    handled = true;
                    socket.off('topic_result', handleResult);

                    if (data.success) {
                      setCreateStatus('success');
                      setCreateFeedback('Arena created! Redirecting to lobby...');
                      setTimeout(() => navigateToLobby(questionText), 800);
                    } else if (data.matchedTopic) {
                      setCreateStatus('success');
                      setCreateFeedback(`Similar arena found: "${data.matchedTopic}". Redirecting...`);
                      setTimeout(() => navigateToLobby(data.matchedTopic), 800);
                    } else {
                      setCreateStatus('error');
                      setCreateFeedback(data.message || 'Failed to create arena. Please try again.');
                    }
                  };

                  socket.on('topic_result', handleResult);
                  socket.emit('propose_topic', { newTopic: questionText });

                  // Timeout fallback: if socket doesn't respond within 15 seconds,
                  // directly insert the topic and redirect
                  setTimeout(async () => {
                    if (handled) return;
                    handled = true;
                    socket.off('topic_result', handleResult);
                    console.warn('[Create Arena] Socket timeout — falling back to direct insert');

                    // Direct insert as fallback
                    const { data: checkAgain } = await supabase.from('topics').select('*').eq('title', questionText).single();
                    if (!checkAgain) {
                      await supabase.from('topics').insert({ title: questionText, category: 'General' });
                    }
                    setCreateStatus('success');
                    setCreateFeedback('Arena created! Redirecting to lobby...');
                    setTimeout(() => navigateToLobby(questionText), 800);
                  }, 15000);
                } else {
                  // No socket: direct insert
                  await supabase.from('topics').insert({ title: questionText, category: 'General' });
                  setCreateStatus('success');
                  setCreateFeedback('Arena created! Redirecting to lobby...');
                  setTimeout(() => navigateToLobby(questionText), 800);
                }
              }}
              disabled={createStatus === 'creating' || !createQuestion.trim()}
              className="flex-1 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {createStatus === 'creating' ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing...</>
              ) : (
                'Create'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Join Arena Dialog Component ---
import { Link2 } from 'lucide-react';

function JoinArenaDialog({ joinCode, setJoinCode, joinStatus, setJoinStatus, joinFeedback, setJoinFeedback, setShowJoinDialog, userId }) {
  const navigate = useNavigate();

  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code || code.length < 5) {
      setJoinStatus('error');
      setJoinFeedback('Please enter a valid Arena Code (e.g. 1AB6-X9K2).');
      return;
    }

    setJoinStatus('joining');
    setJoinFeedback('Validating arena code...');

    // Validate via Supabase directly — don't do the socket join here
    // The Lobby will handle the actual socket join
    const { data: arena, error } = await supabase
      .from('private_arenas')
      .select('*')
      .eq('arena_code', code)
      .in('status', ['waiting', 'paired'])
      .single();

    if (error || !arena) {
      setJoinStatus('error');
      setJoinFeedback('Invalid or expired Arena Code. Please check and try again.');
      return;
    }

    if (arena.creator_id === userId) {
      setJoinStatus('error');
      setJoinFeedback('You cannot join your own arena!');
      return;
    }

    setJoinStatus('success');
    setJoinFeedback('Arena found! Redirecting to lobby...');
    setTimeout(() => {
      setShowJoinDialog(false);
      navigate(`/lobby/${arena.topic_id}`, {
        state: {
          topic: { id: arena.topic_id, title: arena.topic_title },
          arenaCode: code
        }
      });
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={() => joinStatus !== 'joining' && setShowJoinDialog(false)}>
      <div className="bg-[#0f172a] border border-slate-700/50 rounded-2xl shadow-2xl w-full max-w-md p-5 sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-100 flex items-center gap-3">
            <div className="bg-gradient-to-br from-emerald-500 to-cyan-500 p-2 rounded-lg">
              <Link2 className="h-5 w-5 text-white" />
            </div>
            Join Arena
          </h2>
          <button onClick={() => joinStatus !== 'joining' && setShowJoinDialog(false)} className="text-slate-400 hover:text-slate-200 transition-colors p-1 hover:bg-slate-800 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">Arena Code</label>
            <input
              type="text"
              placeholder='e.g. 1AB6-X9K2'
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              disabled={joinStatus === 'joining'}
              className="w-full bg-slate-900/80 border border-slate-700/50 rounded-xl py-3 px-4 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all text-lg font-mono tracking-widest text-center disabled:opacity-50"
              maxLength={9}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
            <p className="text-xs text-slate-500 mt-2">Paste the Arena Code shared by the debate creator.</p>
          </div>

          {joinFeedback && (
            <div className={`text-sm font-medium px-4 py-3 rounded-xl border ${
              joinStatus === 'error'
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : joinStatus === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}>
              {joinFeedback}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setShowJoinDialog(false)}
              disabled={joinStatus === 'joining'}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleJoin}
              disabled={joinStatus === 'joining' || !joinCode.trim()}
              className="flex-1 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {joinStatus === 'joining' ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Connecting...</>
              ) : (
                'Join'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

