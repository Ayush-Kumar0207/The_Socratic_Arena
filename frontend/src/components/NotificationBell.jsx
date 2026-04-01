import { useState, useEffect, useRef } from 'react';
import { Bell, Swords, Check, X, Clock, CheckCircle2, XCircle, AlertTriangle, ChevronRight, Trash2, RefreshCw, Loader2, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

const NotificationBell = ({ socket, user, needRefresh, setNeedRefresh, updateServiceWorker }) => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`notifs_${user?.id}`)) || [];
    } catch { return []; }
  });
  const [isOpen, setIsOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [respondingIds, setRespondingIds] = useState(new Set());
  const [respondedActions, setRespondedActions] = useState(new Map()); // challengeId -> 'accept' | 'decline'
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [upgradeStatus, setUpgradeStatus] = useState('idle'); // 'idle' | 'upgrading' | 'done'
  const panelRef = useRef(null);

  const unreadCount = notifications.filter(n => !n.is_read).length + (needRefresh && upgradeStatus === 'idle' ? 1 : 0);

  // --- Fetch notifications on mount & socket connect ---
  useEffect(() => {
    if (!socket || !user) return;

    // Initial fetch
    socket.emit('fetch_notifications');

    const handleList = async ({ notifications: notifs }) => {
      if (!notifs) return;

      // PROACTIVE SYNC: Check match statuses for challenge_accepted items
      // This ensures "Enter Lobby" vanishes IMMEDIATELY if the debate ended
      const challengeAcceptedNotifs = notifs.filter(n => n.type === 'challenge_accepted' && n.metadata?.arena_id);
      
      if (challengeAcceptedNotifs.length > 0) {
        try {
          const arenaIds = challengeAcceptedNotifs.map(n => n.metadata.arena_id);
          
          // First get the match_id from private_arenas table
          const { data: arenas } = await supabase
            .from('private_arenas')
            .select('id, match_id, status')
            .in('id', arenaIds);

          if (arenas && arenas.length > 0) {
            // Get match IDs (filter out nulls - debate not started yet)
            const matchIds = arenas.filter(a => a.match_id).map(a => a.match_id);
            
            let matchStatusMap = {};
            if (matchIds.length > 0) {
              const { data: matches } = await supabase
                .from('matches')
                .select('id, status')
                .in('id', matchIds);
              
              if (matches) {
                matchStatusMap = Object.fromEntries(matches.map(m => [m.id, m.status]));
              }
            }

            // Map arena_id -> match status
            const arenaToMatchStatus = {};
            arenas.forEach(a => {
              if (a.match_id && matchStatusMap[a.match_id]) {
                arenaToMatchStatus[a.id] = matchStatusMap[a.match_id];
              } else if (a.status === 'paired') {
                // Arena is paired but debate hasn't started yet - show Enter Lobby
                arenaToMatchStatus[a.id] = 'waiting';
              } else if (a.status === 'started') {
                // Arena started but match not found - likely in progress
                arenaToMatchStatus[a.id] = 'active';
              } else {
                arenaToMatchStatus[a.id] = a.status || 'unknown';
              }
            });

            notifs.forEach(n => {
              if (n.type === 'challenge_accepted' && n.metadata?.arena_id) {
                n.metadata.match_status = arenaToMatchStatus[n.metadata.arena_id] || 'unknown';
              }
            });
          }
        } catch (err) {
          console.error('[NotificationBell] Failed to fetch match statuses for notifications:', err);
        }
      }

      setNotifications([...notifs]);
      localStorage.setItem(`notifs_${user?.id}`, JSON.stringify(notifs));
    };

    // Real-time: new challenge received
    const handleChallengeReceived = (data) => {
      socket.emit('fetch_notifications');
      setToast({
        type: 'challenge_invite',
        message: `⚔️ ${data.challenger_name || 'Someone'} challenged you to "${data.topic_title}"!`,
        challenge_id: data.challenge_id
      });
      setTimeout(() => setToast(null), 6000);
    };

    // Real-time: challenge accepted — navigate to lobby
    const handleChallengeAccepted = (data) => {
      socket.emit('fetch_notifications');
      setRespondingIds(new Set());
      setToast({
        type: 'challenge_accepted',
        message: `Challenge accepted! Heading to lobby for "${data.topic_title}"...`
      });
      // Auto-navigate to lobby with arenaCode in state (Fix #6)
      setTimeout(() => {
        setToast(null);
        setIsOpen(false);
        navigate(`/lobby/${data.topic_id}`, {
          state: {
            topic: { id: data.topic_id, title: data.topic_title },
            arenaCode: data.arena_code
          }
        });
      }, 1500);
    };

    const handleChallengeDeclined = (data) => {
      socket.emit('fetch_notifications');
      setRespondingIds(new Set());
      const declinedBy = data.declined_by || 'User';
      const isSelf = declinedBy === 'You';
      setToast({
        type: 'challenge_declined',
        message: isSelf 
          ? `You declined the challenge for "${data.topic_title}".`
          : `${declinedBy} declined your challenge for "${data.topic_title}".`
      });
      setTimeout(() => setToast(null), 5000);
    };

    const handleChallengeSent = (data) => {
      // Refresh notifications to show the new "Challenge Sent" entry
      socket.emit('fetch_notifications');
      setToast({
        type: 'challenge_sent',
        message: `Challenge sent to ${data.target_username} for "${data.topic_title}"!`
      });
      setTimeout(() => setToast(null), 4000);
    };

    const handleChallengeError = (data) => {
      setToast({
        type: 'error',
        message: data.message || 'Challenge error occurred.'
      });
      setRespondingIds(new Set());
      setTimeout(() => setToast(null), 5000);
    };

    const handleResponseConfirmed = () => {
      socket.emit('fetch_notifications');
      setRespondingIds(new Set());
    };

    const handleNotificationNew = () => {
      socket.emit('fetch_notifications');
    };

    const handleMarkedRead = () => {
      // Keep server as source of truth, but avoid perceived lag with local optimistic state.
      setNotifications(prev => {
        const updated = prev.map(n => ({ ...n, is_read: true }));
        localStorage.setItem(`notifs_${user?.id}`, JSON.stringify(updated));
        return updated;
      });
      socket.emit('fetch_notifications');
    };

    // Listen for match_ended to refresh notification statuses (remove stale "Enter Lobby" buttons)
    const handleMatchEnded = ({ matchId }) => {
      console.log('[NotificationBell] match_ended received, refreshing notifications...');
      socket.emit('fetch_notifications');
    };

    socket.on('notifications_list', handleList);
    socket.on('challenge_received', handleChallengeReceived);
    socket.on('challenge_accepted', handleChallengeAccepted);
    socket.on('challenge_declined', handleChallengeDeclined);
    socket.on('challenge_sent', handleChallengeSent);
    socket.on('challenge_error', handleChallengeError);
    socket.on('challenge_response_confirmed', handleResponseConfirmed);
    socket.on('notification_new', handleNotificationNew);
    socket.on('notifications_marked_read', handleMarkedRead);
    socket.on('match_ended', handleMatchEnded);

    return () => {
      socket.off('notifications_list', handleList);
      socket.off('challenge_received', handleChallengeReceived);
      socket.off('challenge_accepted', handleChallengeAccepted);
      socket.off('challenge_declined', handleChallengeDeclined);
      socket.off('challenge_sent', handleChallengeSent);
      socket.off('challenge_error', handleChallengeError);
      socket.off('challenge_response_confirmed', handleResponseConfirmed);
      socket.off('notification_new', handleNotificationNew);
      socket.off('notifications_marked_read', handleMarkedRead);
      socket.off('match_ended', handleMatchEnded);
    };
  }, [socket, user, navigate]);

  // --- Close panel on outside click ---
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setIsOpen(false);
        setShowClearConfirm(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleRespond = (challengeId, action) => {
    if (!socket || respondingIds.has(challengeId)) return;
    setRespondingIds(prev => new Set(prev).add(challengeId));
    setRespondedActions(prev => new Map(prev).set(challengeId, action));
    socket.emit('respond_challenge', { challengeId, action });
    
    // Close the notification panel for cleaner UX
    setIsOpen(false);
  };

  const handleMarkAllRead = () => {
    if (!socket) return;
    // Optimistic update for instant UI feedback.
    setNotifications(prev => {
      const updated = prev.map(n => ({ ...n, is_read: true }));
      localStorage.setItem(`notifs_${user?.id}`, JSON.stringify(updated));
      return updated;
    });
    socket.emit('mark_notifications_read', { notificationIds: [] });
  };

  const handleClearAll = () => {
    if (!socket) return;
    socket.emit('clear_notifications', { notificationIds: [] });
    setShowClearConfirm(false);
    setNotifications([]);
    localStorage.setItem(`notifs_${user?.id}`, JSON.stringify([]));
  };

  const handleClearOne = (notifId) => {
    if (!socket) return;
    socket.emit('clear_notifications', { notificationIds: [notifId] });
    // Optimistic removal
    setNotifications(prev => {
      const updated = prev.filter(n => n.id !== notifId);
      localStorage.setItem(`notifs_${user?.id}`, JSON.stringify(updated));
      return updated;
    });
  };

  const getTimeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const getNotifIcon = (type) => {
    switch (type) {
      case 'challenge_invite': return <Swords className="h-4 w-4 text-cyan-400" />;
      case 'challenge_sent': return <Swords className="h-4 w-4 text-indigo-400" />;
      case 'challenge_accepted': return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
      case 'challenge_declined': return <XCircle className="h-4 w-4 text-rose-400" />;
      case 'challenge_expired': return <Clock className="h-4 w-4 text-amber-400" />;
      case 'system_announcement': return <Sparkles className="h-4 w-4 text-purple-400" />;
      case 'system_upgrade': return <RefreshCw className="h-4 w-4 text-teal-400" />;
      default: return <Bell className="h-4 w-4 text-slate-400" />;
    }
  };

  const getNotifBorder = (type) => {
    switch (type) {
      case 'challenge_invite': return 'border-l-cyan-500';
      case 'challenge_sent': return 'border-l-indigo-500';
      case 'challenge_accepted': return 'border-l-emerald-500';
      case 'challenge_declined': return 'border-l-rose-500';
      case 'challenge_expired': return 'border-l-amber-500';
      case 'system_announcement': return 'border-l-purple-500';
      case 'system_upgrade': return 'border-l-teal-500';
      default: return 'border-l-slate-600';
    }
  };

  const getToastStyle = (type) => {
    switch (type) {
      case 'challenge_invite': return 'bg-cyan-950/90 border-cyan-500/50 text-cyan-300';
      case 'challenge_accepted': return 'bg-emerald-950/90 border-emerald-500/50 text-emerald-300';
      case 'challenge_declined': return 'bg-rose-950/90 border-rose-500/50 text-rose-300';
      case 'challenge_sent': return 'bg-indigo-950/90 border-indigo-500/50 text-indigo-300';
      case 'challenge_expired': return 'bg-amber-950/90 border-amber-500/50 text-amber-300';
      case 'system_announcement': return 'bg-purple-950/90 border-purple-500/50 text-purple-300';
      case 'system_upgrade': return 'bg-teal-950/90 border-teal-500/50 text-teal-300';
      case 'error': return 'bg-red-950/90 border-red-500/50 text-red-300';
      default: return 'bg-slate-900/90 border-slate-500/50 text-slate-300';
    }
  };

  // Check if a challenge_invite or challenge_sent notification is expired
  const isExpired = (notif) => {
    if (notif.type !== 'challenge_invite' && notif.type !== 'challenge_sent') return false;
    const expires = notif.metadata?.expires_at;
    if (!expires) return false;
    return new Date(expires) < new Date();
  };

  return (
    <>
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-4 fade-in duration-300">
          <div className={`px-5 py-3 rounded-xl border shadow-2xl backdrop-blur-md flex items-center gap-3 max-w-md ${getToastStyle(toast.type)}`}>
            {toast.type === 'challenge_invite' && <Swords className="h-5 w-5 shrink-0" />}
            {toast.type === 'challenge_accepted' && <CheckCircle2 className="h-5 w-5 shrink-0" />}
            {toast.type === 'challenge_declined' && <XCircle className="h-5 w-5 shrink-0" />}
            {toast.type === 'challenge_sent' && <Check className="h-5 w-5 shrink-0" />}
            {toast.type === 'error' && <AlertTriangle className="h-5 w-5 shrink-0" />}
            <p className="font-semibold text-sm">{toast.message}</p>
            <button onClick={() => setToast(null)} className="shrink-0 p-1 hover:bg-white/10 rounded-full transition">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Bell Button + Dropdown */}
      <div className="relative" ref={panelRef}>
        <button
          onClick={() => {
            setIsOpen(!isOpen);
            setShowClearConfirm(false);
            if (!isOpen && socket) socket.emit('fetch_notifications');
          }}
          className="relative p-2 text-slate-400 hover:text-slate-100 transition-colors bg-slate-800/50 hover:bg-slate-700/50 rounded-lg border border-slate-700"
          title="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center bg-cyan-500 text-[10px] font-black text-slate-950 rounded-full animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.6)]">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Dropdown Panel */}
        {isOpen && (
          <div className="fixed sm:absolute right-2 sm:right-0 left-2 sm:left-auto top-16 sm:top-full sm:mt-2 sm:w-[380px] max-h-[420px] overflow-hidden bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl z-50 flex flex-col animate-in slide-in-from-top-2 fade-in duration-200">
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
                <Bell className="h-4 w-4 text-cyan-400" /> Notifications
              </h3>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 hover:text-cyan-300 transition px-2 py-1 hover:bg-cyan-500/10 rounded-md"
                  >
                    Mark all read
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition"
                    title="Clear all notifications"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Clear All Confirmation */}
            {showClearConfirm && (
              <div className="px-4 py-3 border-b border-slate-800 bg-rose-950/30 flex items-center justify-between gap-3 shrink-0">
                <p className="text-xs text-rose-300 font-medium">Clear all notifications?</p>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="px-3 py-1 text-[10px] font-bold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md transition uppercase tracking-wider"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleClearAll}
                    className="px-3 py-1 text-[10px] font-bold text-rose-950 bg-rose-500 hover:bg-rose-400 rounded-md transition uppercase tracking-wider"
                  >
                    Clear All
                  </button>
                </div>
              </div>
            )}

            {/* Notification List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {notifications.length === 0 && !needRefresh ? (
                <div className="px-6 py-10 text-center">
                  <Bell className="h-8 w-8 text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm font-medium">No notifications yet</p>
                  <p className="text-slate-600 text-xs mt-1">Challenge someone from their profile!</p>
                </div>
              ) : (
                <div className="py-1">
                  {/* PWA Upgrade Card — pinned at top */}
                  {needRefresh && (
                    <div className={`px-4 py-3 border-l-2 transition-all ${
                      upgradeStatus === 'done' ? 'border-l-emerald-500 bg-emerald-950/20' : 'border-l-indigo-500 bg-indigo-950/20'
                    }`}>
                      <div className="flex items-start gap-3">
                        <div className={`shrink-0 mt-0.5 rounded-lg p-1.5 border ${
                          upgradeStatus === 'done'
                            ? 'bg-emerald-500/10 border-emerald-500/30'
                            : 'bg-indigo-500/10 border-indigo-500/30'
                        }`}>
                          {upgradeStatus === 'upgrading' ? (
                            <Loader2 className="h-4 w-4 text-indigo-400 animate-spin" />
                          ) : upgradeStatus === 'done' ? (
                            <Sparkles className="h-4 w-4 text-emerald-400" />
                          ) : (
                            <RefreshCw className="h-4 w-4 text-indigo-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-200">
                            {upgradeStatus === 'upgrading'
                              ? 'Upgrading Arena...'
                              : upgradeStatus === 'done'
                                ? 'Arena Upgraded ✨'
                                : 'Upgrade Available'}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                            {upgradeStatus === 'upgrading'
                              ? 'Applying the latest improvements...'
                              : upgradeStatus === 'done'
                                ? 'Socratic Arena is now running the latest version.'
                                : 'A newer, more powerful version of Socratic Arena is ready.'}
                          </p>

                          {upgradeStatus === 'idle' && (
                            <div className="flex items-center gap-2 mt-2.5">
                              <button
                                onClick={async () => {
                                  setUpgradeStatus('upgrading');
                                  try {
                                    await updateServiceWorker(true);
                                    setUpgradeStatus('done');
                                    setTimeout(() => {
                                      window.location.reload();
                                    }, 1500);
                                  } catch {
                                    setUpgradeStatus('done');
                                    setTimeout(() => window.location.reload(), 1500);
                                  }
                                }}
                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 font-bold text-[11px] rounded-lg border border-indigo-500/30 transition-all"
                              >
                                <RefreshCw className="h-3 w-3" />
                                Upgrade
                              </button>
                              <button
                                onClick={() => {
                                  setNeedRefresh(false);
                                }}
                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[11px] rounded-lg border border-slate-600/50 transition-all"
                              >
                                <X className="h-3 w-3" />
                                Dismiss
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  {notifications.map((notif) => {
                    const expired = isExpired(notif);
                    const challengeId = notif.metadata?.challenge_id;
                    const isResponding = respondingIds.has(challengeId);
                    const respondedAction = respondedActions.get(challengeId);

                    return (
                      <div
                        key={notif.id}
                        className={`group px-4 py-3 border-l-2 transition-colors ${getNotifBorder(notif.type)} ${
                          notif.is_read ? 'bg-transparent' : 'bg-slate-800/30'
                        } hover:bg-slate-800/50`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="shrink-0 mt-0.5 bg-slate-800 border border-slate-700 rounded-lg p-1.5">
                            {getNotifIcon(notif.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                              <p className="text-xs font-bold text-slate-200 truncate">{notif.title}</p>
                              <div className="flex items-center gap-1 shrink-0">
                                <span className="text-[10px] text-slate-500 font-medium">
                                  {getTimeAgo(notif.created_at)}
                                </span>
                                {/* Individual dismiss button */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleClearOne(notif.id);
                                  }}
                                  className="p-0.5 text-slate-600 hover:text-rose-400 rounded opacity-0 group-hover:opacity-100 transition-all"
                                  title="Remove notification"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                            <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{notif.message}</p>

                            {/* Inline Accept/Decline for challenge invites */}
                            {notif.type === 'challenge_invite' && !expired && !respondedAction && (
                              <div className="flex items-center gap-2 mt-2.5">
                                <button
                                  onClick={() => handleRespond(challengeId, 'accept')}
                                  disabled={isResponding}
                                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 font-bold text-[11px] rounded-lg border border-emerald-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isResponding ? (
                                    <span className="h-3 w-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <Check className="h-3 w-3" />
                                  )}
                                  Accept
                                </button>
                                <button
                                  onClick={() => handleRespond(challengeId, 'decline')}
                                  disabled={isResponding}
                                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[11px] rounded-lg border border-slate-600/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <X className="h-3 w-3" />
                                  Decline
                                </button>
                              </div>
                            )}

                            {/* System Upgrade notification with Upgrade/Dismiss buttons */}
                            {notif.type === 'system_upgrade' && !notif.metadata?.dismissed && (
                              <div className="flex items-center gap-2 mt-2.5">
                                <button
                                  onClick={() => {
                                    window.location.reload();
                                  }}
                                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 font-bold text-[11px] rounded-lg border border-teal-500/30 transition-all"
                                >
                                  <RefreshCw className="h-3 w-3" />
                                  Upgrade
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleClearOne(notif.id);
                                  }}
                                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[11px] rounded-lg border border-slate-600/50 transition-all"
                                >
                                  <X className="h-3 w-3" />
                                  Dismiss
                                </button>
                              </div>
                            )}

                            {/* Status text after responding (Fix #4) */}
                            {notif.type === 'challenge_invite' && !expired && respondedAction && (
                              <div className={`mt-2 flex items-center gap-1.5 text-[11px] font-bold ${
                                respondedAction === 'accept' 
                                  ? 'text-emerald-400' 
                                  : 'text-rose-400'
                              }`}>
                                {respondedAction === 'accept' ? (
                                  <><CheckCircle2 className="h-3.5 w-3.5" /> You accepted this challenge</>
                                ) : (
                                  <><XCircle className="h-3.5 w-3.5" /> You declined this challenge</>
                                )}
                              </div>
                            )}

                            {/* Expired badge for challenge invites */}
                            {notif.type === 'challenge_invite' && expired && (
                              <div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-500 font-bold uppercase">
                                <Clock className="h-3 w-3" /> Challenge Expired
                              </div>
                            )}

                            {/* Pending/Expired status for challenge_sent (challenger's view) */}
                            {notif.type === 'challenge_sent' && (
                              expired ? (
                                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-500 font-bold uppercase">
                                  <Clock className="h-3 w-3" /> Challenge Expired
                                </div>
                              ) : (
                                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-indigo-400 font-medium">
                                  <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                                  </span>
                                  Awaiting Response...
                                </div>
                              )
                            )}

                            {/* Navigate to lobby for accepted challenges (Fix #6 & #7: works for both users) */}
                            {notif.type === 'challenge_accepted' && notif.metadata?.arena_code && (() => {
                              const matchStatus = notif.metadata?.match_status;
                              // Match ended if it's completed or awaiting votes
                              const isEnded = matchStatus === 'completed' || matchStatus === 'pending_votes';
                              // Match expired if it was abandoned (timed out or everyone left)
                              const isExpired = matchStatus === 'abandoned';
                              // Show Enter Lobby for: active, waiting (paired but not started), or unknown
                              const isActive = !matchStatus || matchStatus === 'active' || matchStatus === 'waiting' || matchStatus === 'unknown' || matchStatus === 'paired';
                              // Only hide if explicitly ended/expired/abandoned
                              const isInactive = isEnded || isExpired || matchStatus === 'abandoned';
                              
                              if (isInactive) {
                                let statusText = 'Debate Closed';
                                let statusColor = 'text-slate-500';
                                if (isEnded) {
                                  statusText = 'Debate Ended';
                                  statusColor = 'text-emerald-400';
                                } else if (isExpired) {
                                  statusText = 'Debate Expired';
                                  statusColor = 'text-amber-500';
                                }

                                return (
                                  <div className={`mt-2.5 flex items-center gap-1.5 text-[10px] ${statusColor} font-bold uppercase tracking-wider`}>
                                    <Clock className={`h-3 w-3 ${statusColor}`} /> {statusText}
                                  </div>
                                );
                              }

                              return (
                                <button
                                  onClick={() => {
                                    setIsOpen(false);
                                    navigate(`/lobby/${notif.metadata.topic_id}`, {
                                      state: {
                                        topic: { id: notif.metadata.topic_id, title: notif.metadata.topic_title },
                                        arenaCode: notif.metadata.arena_code
                                      }
                                    });
                                  }}
                                  className="mt-2.5 flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-bold transition-all hover:translate-x-0.5"
                                >
                                  Enter Lobby <ChevronRight className="h-3 w-3" />
                                </button>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default NotificationBell;
