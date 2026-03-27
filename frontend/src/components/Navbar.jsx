import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Shield, Compass, LayoutDashboard, User, ChevronDown, Swords, Plus, Link2, Menu, X } from 'lucide-react';
import ProfileModal from './ProfileModal';

const Navbar = ({ user, onCreateArena, onJoinArena }) => {
  const location = useLocation();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const isActive = (path) => location.pathname === path;

  // Close menu on route change
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

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
            <Link to="/dashboard" className={`flex items-center gap-3 p-3 rounded-xl transition ${isActive('/dashboard') ? 'bg-cyan-500/10 text-cyan-400' : 'text-slate-300 active:bg-slate-800'}`}>
              <LayoutDashboard className="h-5 w-5" />
              <span className="font-semibold text-lg">Dashboard</span>
            </Link>
            <Link to="/explore" className={`flex items-center gap-3 p-3 rounded-xl transition ${isActive('/explore') ? 'bg-cyan-500/10 text-cyan-400' : 'text-slate-300 active:bg-slate-800'}`}>
              <Compass className="h-5 w-5" />
              <span className="font-semibold text-lg">Explore</span>
            </Link>
            <Link to="/my-arena" className={`flex items-center gap-3 p-3 rounded-xl transition ${isActive('/my-arena') ? 'bg-cyan-500/10 text-cyan-400' : 'text-slate-300 active:bg-slate-800'}`}>
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
      />
    </>
  );
};

export default Navbar;
