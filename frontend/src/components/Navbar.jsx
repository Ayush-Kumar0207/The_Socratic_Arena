import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Shield, Compass, LayoutDashboard, User, ChevronDown, Swords, Plus, Link2, Menu, X, Bell } from 'lucide-react';
import ProfileModal from './ProfileModal';
import NotificationBell from './NotificationBell';

const Navbar = ({ user, onCreateArena, onJoinArena, notifications = [], unreadCount = 0, socket, onMarkRead, needRefresh, setNeedRefresh, updateServiceWorker }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  const isActive = (path) => location.pathname === path;

  // Close menu on route change
  useEffect(() => {
    setIsMenuOpen(false);
    setIsNotifOpen(false);
  }, [location.pathname]);

  const handleAcceptChallenge = (notif) => {
    if (!socket || !notif.metadata?.challengeId) return;
    socket.emit('accept_challenge', { challengeId: notif.metadata.challengeId });
    // Navigate to lobby with challenge context
    navigate(`/lobby/${notif.metadata.topicId || 'challenge'}`, {
      state: {
        topic: { id: notif.metadata.topicId, title: notif.metadata.topicTitle },
        challengeId: notif.metadata.challengeId,
        arenaCode: notif.metadata.arenaCode
      }
    });
    setIsNotifOpen(false);
    if (onMarkRead) onMarkRead([notif.id]);
  };

  const handleViewChallenge = (notif) => {
    navigate(`/lobby/${notif.metadata?.topicId || 'challenge'}`, {
      state: {
        topic: { id: notif.metadata?.topicId, title: notif.metadata?.topicTitle },
        challengeId: notif.metadata?.challengeId
      }
    });
    setIsNotifOpen(false);
    if (onMarkRead) onMarkRead([notif.id]);
  };

  const formatTimeAgo = (dateStr) => {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <>
      <nav className="h-16 w-full bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40 flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-4 sm:gap-6">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="bg-gradient-to-br from-indigo-500 to-cyan-500 p-1.5 rounded-lg group-hover:shadow-[0_0_15px_rgba(99,102,241,0.5)] transition">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg sm:text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-100 to-slate-400 tracking-tight whitespace-nowrap">Socratic Arena</span>
          </Link>
          
          {user && (
            <div className="hidden md:flex items-center gap-2 sm:gap-4 ml-4 border-l border-slate-800 pl-6">
              <Link 
                to="/dashboard" 
                className={`flex items-center gap-2 px-3 py-2 rounded-md transition text-sm font-medium ${isActive('/dashboard') || isActive('/') ? 'bg-slate-800 text-cyan-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
              >
                <LayoutDashboard className="h-4 w-4" /> Dashboard
              </Link>
              <Link 
                to="/explore" 
                className={`flex items-center gap-2 px-3 py-2 rounded-md transition text-sm font-medium ${isActive('/explore') ? 'bg-slate-800 text-cyan-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
              >
                <Compass className="h-4 w-4" /> Explore
              </Link>
              <Link 
                to="/my-arena" 
                className={`flex items-center gap-2 px-3 py-2 rounded-md transition text-sm font-medium ${isActive('/my-arena') ? 'bg-slate-800 text-cyan-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
              >
                <Swords className="h-4 w-4" /> My Arena
              </Link>
            </div>
          )}
        </div>

        {user && (
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Desktop-only Buttons */}
            <div className="hidden lg:flex items-center gap-2">
              <button
                onClick={onCreateArena}
                className="flex items-center gap-2 px-3 py-2 rounded-md transition text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              >
                <Plus className="h-4 w-4" /> Create Arena
              </button>
              <button
                onClick={onJoinArena}
                className="flex items-center gap-2 px-3 py-2 rounded-md transition text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              >
                <Link2 className="h-4 w-4" /> Join Arena
              </button>
            </div>

            {/* Notification Bell (combines local SW-aware NotificationBell with remote notification dropdown if desired, but here we just use the remote one or keep the local component since it's cleaner) */}
            <div className="relative">
              <button
                onClick={() => setIsNotifOpen(!isNotifOpen)}
                className="relative p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-all"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-5 w-5 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center animate-pulse shadow-lg shadow-rose-500/40">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
                {/* Visual indicator for PWA updates if any */}
                {needRefresh && !unreadCount && (
                   <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-emerald-500 rounded-full animate-bounce shadow-[0_0_10px_rgba(16,185,129,0.5)]"></span>
                )}
              </button>

              {/* Notification Dropdown */}
              {isNotifOpen && (
                <div className="absolute right-0 top-12 w-80 sm:w-96 bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden z-50">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                    <h3 className="text-sm font-bold text-slate-100">Notifications</h3>
                    <div className="flex gap-3">
                      {needRefresh && (
                        <button
                          onClick={() => updateServiceWorker(true)}
                          className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 uppercase tracking-wider"
                        >
                          Update App
                        </button>
                      )}
                      {unreadCount > 0 && (
                        <button
                          onClick={() => onMarkRead && onMarkRead(null)}
                          className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 uppercase tracking-wider"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-slate-500 text-sm">No notifications yet</div>
                    ) : (
                      notifications.slice(0, 10).map(notif => (
                        <div
                          key={notif.id}
                          className={`px-4 py-3 border-b border-slate-800/50 transition-colors ${
                            !notif.is_read ? 'bg-indigo-500/5' : ''
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`shrink-0 mt-1 h-2 w-2 rounded-full ${!notif.is_read ? 'bg-cyan-400' : 'bg-slate-700'}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">{notif.title}</p>
                              <p className="text-sm text-slate-400 mt-0.5 line-clamp-2">{notif.message}</p>
                              <div className="flex items-center gap-2 mt-2">
                                <span className="text-[10px] text-slate-600">{formatTimeAgo(notif.created_at)}</span>

                                {notif.type === 'challenge_received' && !notif.metadata?.expired && (
                                  <button
                                    onClick={() => handleAcceptChallenge(notif)}
                                    className="text-[10px] font-black uppercase tracking-wider px-3 py-1 bg-cyan-500 hover:bg-cyan-400 text-slate-900 rounded-lg transition-all shadow-lg shadow-cyan-500/20"
                                  >
                                    Accept
                                  </button>
                                )}
                                {notif.type === 'challenge_accepted' && (
                                  <button
                                    onClick={() => handleViewChallenge(notif)}
                                    className="text-[10px] font-black uppercase tracking-wider px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-lg transition-all"
                                  >
                                    Enter Arena
                                  </button>
                                )}
                                {notif.type === 'user_joined_arena' && (
                                  <button
                                    onClick={() => handleViewChallenge(notif)}
                                    className="text-[10px] font-black uppercase tracking-wider px-3 py-1 bg-indigo-500 hover:bg-indigo-400 text-white rounded-lg transition-all"
                                  >
                                    Join Now
                                  </button>
                                )}
                                {notif.metadata?.expired && (
                                  <span className="text-[10px] font-bold text-rose-400 uppercase">Expired</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Desktop Account Button */}
            <button
              onClick={() => setIsProfileOpen(true)}
              className="hidden sm:flex items-center gap-2.5 bg-slate-800 hover:bg-slate-700/80 transition-all rounded-full pl-3 pr-4 py-1.5 border border-slate-700 shadow-inner group cursor-pointer"
            >
              <div className="shrink-0 bg-cyan-600/10 rounded-full p-2 border border-cyan-500/20 group-hover:bg-cyan-600/20">
                <User className="h-5 w-5 text-cyan-400" />
              </div>
              <span className="text-slate-300 text-sm font-medium font-bold lg:inline-block">Account</span>
              <ChevronDown className="h-4 w-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
            </button>

            {/* Mobile Menu Toggle */}
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="flex md:hidden p-2 text-slate-400 hover:text-slate-100 transition-colors bg-slate-800/50 rounded-lg border border-slate-700"
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        )}
      </nav>

      {/* Mobile Menu Overlay */}
      {isMenuOpen && user && (
        <div className="fixed inset-0 top-16 z-30 bg-slate-950 flex flex-col p-6 animate-in slide-in-from-right duration-200 md:hidden overflow-y-auto pb-12">
          <div className="flex flex-col gap-2 mb-8">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 px-2">Navigation</p>
            <Link to="/dashboard" onClick={() => setIsMenuOpen(false)} className={`flex items-center gap-3 p-3 rounded-xl transition ${isActive('/dashboard') ? 'bg-cyan-500/10 text-cyan-400' : 'text-slate-300 active:bg-slate-800'}`}>
              <LayoutDashboard className="h-5 w-5" />
              <span className="font-semibold text-lg">Dashboard</span>
            </Link>
            <Link to="/explore" onClick={() => setIsMenuOpen(false)} className={`flex items-center gap-3 p-3 rounded-xl transition ${isActive('/explore') ? 'bg-cyan-500/10 text-cyan-400' : 'text-slate-300 active:bg-slate-800'}`}>
              <Compass className="h-5 w-5" />
              <span className="font-semibold text-lg">Explore</span>
            </Link>
            <Link to="/my-arena" onClick={() => setIsMenuOpen(false)} className={`flex items-center gap-3 p-3 rounded-xl transition ${isActive('/my-arena') ? 'bg-cyan-500/10 text-cyan-400' : 'text-slate-300 active:bg-slate-800'}`}>
              <Swords className="h-5 w-5" />
              <span className="font-semibold text-lg">My Arena</span>
            </Link>
          </div>

          <div className="flex flex-col gap-2 mb-8">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 px-2">Actions</p>
            <button 
              onClick={() => { onCreateArena(); setIsMenuOpen(false); }}
              className="flex items-center gap-3 p-3 rounded-xl text-slate-300 active:bg-slate-800 text-left"
            >
              <Plus className="h-5 w-5 text-indigo-400" />
              <span className="font-semibold text-lg">Create Arena</span>
            </button>
            <button 
              onClick={() => { onJoinArena(); setIsMenuOpen(false); }}
              className="flex items-center gap-3 p-3 rounded-xl text-slate-300 active:bg-slate-800 text-left"
            >
              <Link2 className="h-5 w-5 text-emerald-400" />
              <span className="font-semibold text-lg">Join Arena</span>
            </button>
            <button 
              onClick={() => { setIsMenuOpen(false); }}
              className="flex items-center gap-3 p-3 rounded-xl text-slate-300 active:bg-slate-800 text-left"
            >
              <Bell className="h-5 w-5 text-amber-400" />
              <span className="font-semibold text-lg">Notifications</span>
              {/* Mobile users use the bell in the top bar */}
            </button>
          </div>

          <div className="mt-8 border-t border-slate-800 pt-6">
            <button 
              onClick={() => { setIsProfileOpen(true); setIsMenuOpen(false); }}
              className="w-full flex items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl"
            >
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-cyan-600/10 border border-cyan-500/20 flex items-center justify-center">
                  <User className="h-6 w-6 text-cyan-400" />
                </div>
                <div>
                  <p className="text-slate-200 font-bold">My Account</p>
                  <p className="text-xs text-slate-500 uppercase font-black">View Profile</p>
                </div>
              </div>
              <ChevronDown className="h-5 w-5 text-slate-600 -rotate-90" />
            </button>
          </div>
        </div>
      )}

      {/* Close notification dropdown when clicking outside */}
      {isNotifOpen && (
        <div className="fixed inset-0 z-30" onClick={() => setIsNotifOpen(false)} />
      )}

      <ProfileModal 
        isOpen={isProfileOpen} 
        onClose={() => setIsProfileOpen(false)} 
        viewUser={user} 
        currentUserId={user?.id}
        socket={socket}
      />
    </>
  );
};

export default Navbar;
