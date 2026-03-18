import { useEffect, useState, useRef } from 'react';
import { X, LogOut, Shield, Wifi, Copy, CheckCircle2, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';

const ProfileModal = ({ isOpen, onClose, currentUser }) => {
    const navigate = useNavigate();
    const [stats, setStats] = useState({ elo: 1000, matches: 0 });
    const [copied, setCopied] = useState(false);
    const modalRef = useRef(null);

    useEffect(() => {
        if (!isOpen || !currentUser) return;
        const fetchStats = async () => {
            const { data } = await supabase.rpc('get_user_stats', { p_user_id: currentUser.id });
            if (data) setStats({ elo: data.elo_rating || 1000, matches: data.total_matches || 0 });
        };
        fetchStats();
    }, [isOpen, currentUser]);

    useEffect(() => {
        const handleOutsideClick = (event) => {
            if (modalRef.current && !modalRef.current.contains(event.target)) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleOutsideClick);
        }

        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
        };
    }, [isOpen, onClose]);

    if (!isOpen || !currentUser) return null;

    const getRank = (rating) => {
        if (rating < 1100) return { name: 'Bronze | Novice', color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30' };
        if (rating < 1300) return { name: 'Silver | Challenger', color: 'text-slate-300', bg: 'bg-slate-300/10', border: 'border-slate-300/30' };
        if (rating < 1600) return { name: 'Gold | Gladiator', color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/30' };
        return { name: 'Diamond | Grandmaster', color: 'text-cyan-400', bg: 'bg-cyan-400/10', border: 'border-cyan-400/30' };
    };

    const rank = getRank(stats.elo);

    const handleCopyId = () => {
        navigator.clipboard.writeText(currentUser.id);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        onClose();
        navigate('/login');
    };

    return (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6">
            {/* 1. Backdrop */}
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"></div>

            {/* 2. Modal Card Container */}
            <div 
                ref={modalRef}
                className="relative z-10 w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col mt-8 animate-in slide-in-from-bottom-4 duration-300"
            >
                {/* Header Banner */}
                <div className="h-24 bg-gradient-to-br from-indigo-900 to-cyan-900 rounded-t-2xl relative">
                    <button 
                        onClick={onClose} 
                        className="absolute top-4 right-4 p-2 bg-slate-950/40 hover:bg-slate-950/80 text-slate-300 rounded-full transition-colors z-10"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Body Container */}
                <div className="px-6 pb-6 relative flex flex-col items-center">
                    {/* Floating Avatar */}
                    <div className="h-20 w-20 bg-slate-800 border-4 border-slate-900 rounded-full flex items-center justify-center shadow-lg z-10 -mt-10 mb-4">
                        <span className="text-3xl font-bold text-cyan-400 uppercase">
                            {currentUser?.email?.charAt(0) || '?'}
                        </span>
                    </div>

                    {/* User Identity */}
                    <div className="text-center w-full mb-6">
                        <h3 className="text-lg font-bold text-slate-100 truncate px-2">{currentUser?.email}</h3>
                        <p className="text-sm text-cyan-400/80 font-medium mt-1">Socratic Arena Member</p>
                    </div>

                    {/* Professional Features */}
                    <div className="flex flex-col gap-3 w-full mb-6">
                        {/* Rank Badge */}
                        <div className={`flex items-center gap-4 p-3 rounded-xl border ${rank.bg} ${rank.border}`}>
                            <Shield className={`h-6 w-6 shrink-0 ${rank.color}`} />
                            <div className="text-left overflow-hidden">
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Current Division</p>
                                <p className={`text-sm font-bold truncate ${rank.color}`}>{rank.name}</p>
                            </div>
                        </div>

                        {/* Player ID Copy */}
                        <button onClick={handleCopyId} className="flex items-center justify-between p-3 rounded-xl border border-slate-700 bg-slate-800/50 hover:bg-slate-700/50 transition-colors group w-full text-left">
                            <div className="flex items-center gap-4 overflow-hidden">
                                <div className="overflow-hidden">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Socratic ID</p>
                                    <p className="text-sm text-slate-300 font-mono truncate max-w-[180px]">{currentUser?.id?.split('-')[0]}...</p>
                                </div>
                            </div>
                            {copied ? <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" /> : <Copy className="h-5 w-5 text-slate-500 group-hover:text-cyan-400 transition-colors shrink-0" />}
                        </button>

                        {/* Network Status */}
                        <div className="flex items-center gap-4 p-3 rounded-xl border border-slate-700 bg-slate-800/20">
                            <Wifi className="h-5 w-5 text-emerald-400 animate-pulse shrink-0" />
                            <p className="text-sm font-medium text-slate-300">Live Server Connected</p>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 w-full">
                        <button 
                            onClick={onClose} 
                            className="flex-1 py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
                        >
                            <ArrowLeft className="h-5 w-5" /> Return
                        </button>
                        
                        <button 
                            onClick={handleSignOut} 
                            className="flex-1 py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-all"
                        >
                            <LogOut className="h-5 w-5" /> Sign Out
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
export default ProfileModal;
