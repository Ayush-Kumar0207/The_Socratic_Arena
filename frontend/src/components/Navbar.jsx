import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, Shield, Compass, LayoutDashboard, User, ChevronDown, Swords, Plus, Link2, Menu, X, BrainCircuit, Sparkles } from 'lucide-react';
import ProfileModal from './ProfileModal';
import NotificationBell from './NotificationBell';
import { COMMERCIAL_UI_ENABLED } from '../lib/commercial';

const Navbar = ({ user, onCreateArena, onJoinArena, socket, needRefresh, setNeedRefresh, updateServiceWorker, upgradeNotice }) => {
  const location = useLocation();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const isActive = (path) => location.pathname === path;

  return (
    <>
      <nav className="sticky top-0 z-40 h-16 w-full border-b border-slate-800 bg-slate-900/85 backdrop-blur-xl">
        <div className="mx-auto flex h-full w-full max-w-[1720px] items-center justify-between gap-4 px-4 sm:px-6 2xl:px-8">
        <div className="flex min-w-0 items-center">
          <Link to="/" onClick={() => setIsMenuOpen(false)} className="group flex shrink-0 items-center gap-2.5">
            <div className="bg-gradient-to-br from-indigo-500 to-cyan-500 p-1.5 rounded-lg group-hover:shadow-[0_0_15px_rgba(99,102,241,0.5)] transition">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <span className="whitespace-nowrap bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-lg font-bold tracking-tight text-transparent sm:text-xl">Socratic Arena</span>
          </Link>
          
          {user && (
            <div className="ml-5 hidden items-center gap-1 border-l border-slate-800 pl-5 xl:flex 2xl:ml-8 2xl:gap-2 2xl:pl-8">
              <Link 
                to="/dashboard" 
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${isActive('/dashboard') || isActive('/') ? 'bg-slate-800 text-cyan-400' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}
              >
                <LayoutDashboard className="h-4 w-4" /> Dashboard
              </Link>
              <Link 
                to="/explore" 
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${isActive('/explore') ? 'bg-slate-800 text-cyan-400' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}
              >
                <Compass className="h-4 w-4" /> Explore
              </Link>
              <Link 
                to="/my-arena" 
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${isActive('/my-arena') ? 'bg-slate-800 text-cyan-400' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}
              >
                <Swords className="h-4 w-4" /> My Arena
              </Link>
              <Link
                to="/arena-os"
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${isActive('/arena-os') || isActive('/practice') || isActive('/evidence-arena') ? 'bg-slate-800 text-cyan-400' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}
              >
                <BrainCircuit className="h-4 w-4" /> Arena OS
              </Link>
            </div>
          )}
        </div>

        {user && (
          <div className="flex shrink-0 items-center gap-2">
            {COMMERCIAL_UI_ENABLED && (
              <Link
                to="/pro-studio"
                title="Open Pro Studio"
                className={`hidden items-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm font-black transition lg:flex ${isActive('/pro-studio') || isActive('/billing') || isActive('/pricing') ? 'border-violet-400/40 bg-violet-500/15 text-violet-200' : 'border-violet-500/20 bg-violet-500/5 text-violet-300 hover:bg-violet-500/15'}`}
              >
                <Sparkles className="h-4 w-4" /> Pro
              </Link>
            )}
            {/* Desktop-only Buttons */}
            <div className="hidden items-center gap-1 xl:flex 2xl:gap-2">
              <button
                onClick={onCreateArena}
                aria-label="Create Arena"
                title="Create Arena"
                className="flex items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium text-slate-400 transition hover:bg-slate-800/50 hover:text-slate-200 2xl:px-3"
              >
                <Plus className="h-4 w-4" /> <span className="hidden 2xl:inline">Create Arena</span>
              </button>
              <button
                onClick={onJoinArena}
                aria-label="Join Arena"
                title="Join Arena"
                className="flex items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium text-slate-400 transition hover:bg-slate-800/50 hover:text-slate-200 2xl:px-3"
              >
                <Link2 className="h-4 w-4" /> <span className="hidden 2xl:inline">Join Arena</span>
              </button>
            </div>

            {/* Notification Bell */}
            {user && <NotificationBell socket={socket} user={user} needRefresh={needRefresh} setNeedRefresh={setNeedRefresh} updateServiceWorker={updateServiceWorker} upgradeNotice={upgradeNotice} />}

            {/* Desktop Account Button */}
            <button
              onClick={() => setIsProfileOpen(true)}
              aria-label="Open account"
              className="group hidden items-center rounded-full border border-slate-700 bg-slate-800 p-1.5 shadow-inner transition-all hover:bg-slate-700/80 sm:flex 2xl:gap-2.5 2xl:py-1.5 2xl:pl-2 2xl:pr-4"
            >
              <div className="shrink-0 bg-cyan-600/10 rounded-full p-2 border border-cyan-500/20 group-hover:bg-cyan-600/20">
                <User className="h-5 w-5 text-cyan-400" />
              </div>
              <span className="hidden text-sm font-bold text-slate-300 2xl:inline-block">Account</span>
              <ChevronDown className="hidden h-4 w-4 text-slate-500 transition-colors group-hover:text-cyan-400 2xl:block" />
            </button>

            {/* Mobile Menu Toggle */}
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="flex rounded-lg border border-slate-700 bg-slate-800/50 p-2 text-slate-400 transition-colors hover:text-slate-100 xl:hidden"
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        )}
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {isMenuOpen && user && (
        <div className="fixed inset-0 top-16 z-30 flex flex-col overflow-y-auto bg-slate-950 p-6 pb-12 animate-in slide-in-from-right duration-200 xl:hidden">
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
            <Link to="/arena-os" onClick={() => setIsMenuOpen(false)} className={`flex items-center gap-3 p-3 rounded-xl transition ${isActive('/arena-os') || isActive('/practice') || isActive('/evidence-arena') ? 'bg-cyan-500/10 text-cyan-400' : 'text-slate-300 active:bg-slate-800'}`}>
              <BrainCircuit className="h-5 w-5" />
              <span className="font-semibold text-lg">Arena OS</span>
            </Link>
            {COMMERCIAL_UI_ENABLED && <Link to="/pro-studio" onClick={() => setIsMenuOpen(false)} className={`flex items-center gap-3 rounded-xl p-3 transition ${isActive('/pro-studio') ? 'bg-violet-500/10 text-violet-300' : 'text-slate-300 active:bg-slate-800'}`}><Sparkles className="h-5 w-5" /><span className="text-lg font-semibold">Pro Studio</span></Link>}
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
