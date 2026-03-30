import { useState, useEffect, useRef } from 'react';
import { Bell, Swords, Check, X, Clock, CheckCircle2, XCircle, AlertTriangle, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const NotificationBell = ({ socket, user }) => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`notifs_${user?.id}`)) || [];
    } catch { return []; }
  });
  const [isOpen, setIsOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [respondingIds, setRespondingIds] = useState(new Set());
  const [handledChallenges, setHandledChallenges] = useState(new Set());
  const panelRef = useRef(null);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // --- Fetch notifications on mount & socket connect ---
  useEffect(() => {
    if (!socket || !user) return;

    // Initial fetch
    socket.emit('fetch_notifications');

    const handleList = ({ notifications: notifs }) => {
      if (notifs) {
        setNotifications(notifs);
        localStorage.setItem(`notifs_${user?.id}`, JSON.stringify(notifs));
      }
    };

    // Real-time: new challenge received
    const handleChallengeReceived = (data) => {
      // Refresh list
      socket.emit('fetch_notifications');
      // Show toast
      setToast({
        type: 'challenge_invite',
        message: `${data.challenger_name || 'Someone'} challenged you to "${data.topic_title}"!`,
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
      // Auto-navigate to lobby
      setTimeout(() => {
        setToast(null);
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
      const senderName = data.declined_by || 'User';
      const isSelf = senderName === 'You';
      setToast({
        type: 'challenge_declined',
        message: isSelf 
          ? `You declined the challenge for "${data.topic_title}".`
          : `${senderName} declined your challenge for "${data.topic_title}".`
      });
      setTimeout(() => setToast(null), 5000);
    };

    const handleChallengeSent = (data) => {
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
    };
  }, [socket, user, navigate]);

  // --- Close panel on outside click ---
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleRespond = (challengeId, action) => {
    if (!socket || respondingIds.has(challengeId)) return;
    setRespondingIds(prev => new Set(prev).add(challengeId));
    setHandledChallenges(prev => new Set(prev).add(challengeId)); // Disable buttons locally forever
    socket.emit('respond_challenge', { challengeId, action });
    
    // Immediately close the notification panel for a cleaner UX
    setIsOpen(false);
  };

  const handleMarkAllRead = () => {
    if (!socket) return;
    socket.emit('mark_notifications_read', { notificationIds: [] });
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
      case 'challenge_accepted': return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
      case 'challenge_declined': return <XCircle className="h-4 w-4 text-rose-400" />;
      case 'challenge_expired': return <Clock className="h-4 w-4 text-amber-400" />;
      default: return <Bell className="h-4 w-4 text-slate-400" />;
    }
  };

  const getNotifBorder = (type) => {
    switch (type) {
      case 'challenge_invite': return 'border-l-cyan-500';
      case 'challenge_accepted': return 'border-l-emerald-500';
      case 'challenge_declined': return 'border-l-rose-500';
      case 'challenge_expired': return 'border-l-amber-500';
      default: return 'border-l-slate-600';
    }
  };

  const getToastStyle = (type) => {
    switch (type) {
      case 'challenge_invite': return 'bg-cyan-950/90 border-cyan-500/50 text-cyan-300';
      case 'challenge_accepted': return 'bg-emerald-950/90 border-emerald-500/50 text-emerald-300';
      case 'challenge_declined': return 'bg-rose-950/90 border-rose-500/50 text-rose-300';
      case 'challenge_sent': return 'bg-indigo-950/90 border-indigo-500/50 text-indigo-300';
      case 'error': return 'bg-red-950/90 border-red-500/50 text-red-300';
      default: return 'bg-slate-900/90 border-slate-500/50 text-slate-300';
    }
  };

  // Check if a challenge_invite notification is still actionable
  const isExpired = (notif) => {
    if (notif.type !== 'challenge_invite') return false;
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
          <div className="absolute right-0 top-full mt-2 w-[340px] sm:w-[380px] max-h-[420px] overflow-hidden bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl z-50 flex flex-col animate-in slide-in-from-top-2 fade-in duration-200">
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
                <Bell className="h-4 w-4 text-cyan-400" /> Notifications
              </h3>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 hover:text-cyan-300 transition px-2 py-1 hover:bg-cyan-500/10 rounded-md"
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* Notification List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {notifications.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <Bell className="h-8 w-8 text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm font-medium">No notifications yet</p>
                  <p className="text-slate-600 text-xs mt-1">Challenge someone from their profile!</p>
                </div>
              ) : (
                <div className="py-1">
                  {notifications.map((notif) => {
                    const expired = isExpired(notif);
                    const isResponding = respondingIds.has(notif.metadata?.challenge_id);

                    return (
                      <div
                        key={notif.id}
                        className={`px-4 py-3 border-l-2 transition-colors ${getNotifBorder(notif.type)} ${
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
                              <span className="text-[10px] text-slate-500 font-medium shrink-0">
                                {getTimeAgo(notif.created_at)}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{notif.message}</p>

                            {/* Inline Accept/Decline for challenge invites */}
                            {notif.type === 'challenge_invite' && !expired && !handledChallenges.has(notif.metadata?.challenge_id) && (
                              <div className="flex items-center gap-2 mt-2.5">
                                <button
                                  onClick={() => handleRespond(notif.metadata.challenge_id, 'accept')}
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
                                  onClick={() => handleRespond(notif.metadata.challenge_id, 'decline')}
                                  disabled={isResponding}
                                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[11px] rounded-lg border border-slate-600/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <X className="h-3 w-3" />
                                  Decline
                                </button>
                              </div>
                            )}

                            {/* Expired badge for challenge invites */}
                            {notif.type === 'challenge_invite' && expired && (
                              <div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-500 font-bold uppercase">
                                <Clock className="h-3 w-3" /> Challenge Expired
                              </div>
                            )}

                            {/* Navigate to lobby for accepted challenges */}
                            {notif.type === 'challenge_accepted' && notif.metadata?.arena_code && (
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
                                className="mt-2 flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-bold transition"
                              >
                                Enter Lobby <ChevronRight className="h-3 w-3" />
                              </button>
                            )}
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
