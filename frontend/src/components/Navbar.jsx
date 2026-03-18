import { Link, useLocation } from 'react-router-dom';
import { Shield, Compass, LayoutDashboard, User, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import ProfileModal from './ProfileModal';

const Navbar = ({ user }) => {
  const location = useLocation();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const isActive = (path) => location.pathname === path;

  return (
    <nav className="h-16 w-full bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40 flex items-center justify-between px-6">
      <div className="flex items-center gap-6">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="bg-gradient-to-br from-indigo-500 to-cyan-500 p-1.5 rounded-lg group-hover:shadow-[0_0_15px_rgba(99,102,241,0.5)] transition">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-100 to-slate-400 tracking-tight">Socratic Arena</span>
        </Link>
        
        {user && (
          <div className="flex items-center gap-2 sm:gap-4 ml-4 border-l border-slate-800 pl-6">
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
          </div>
        )}
      </div>

      {user && (
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsProfileOpen(true)}
            className="flex items-center gap-2.5 bg-slate-800 hover:bg-slate-700/80 transition-all rounded-full pl-3 pr-4 py-1.5 border border-slate-700 shadow-inner group cursor-pointer"
          >
            <div className="shrink-0 bg-cyan-600/10 rounded-full p-2 border border-cyan-500/20 group-hover:bg-cyan-600/20">
              <User className="h-5 w-5 text-cyan-400" />
            </div>
            <span className="text-slate-300 text-sm font-medium">Account</span>
            <ChevronDown className="h-4 w-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
          </button>
        </div>
      )}

      <ProfileModal 
        isOpen={isProfileOpen} 
        onClose={() => setIsProfileOpen(false)} 
        currentUser={user} 
      />
    </nav>
  );
};

export default Navbar;
