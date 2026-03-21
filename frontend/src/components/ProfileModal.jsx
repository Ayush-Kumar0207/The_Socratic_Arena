import { useEffect, useState, useRef } from 'react';
import { X, LogOut, Shield, Wifi, Copy, CheckCircle2, ArrowLeft, UserPlus, UserCheck, Swords } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';

const ProfileModal = ({ isOpen, onClose, viewUser, currentUserId, currentUser }) => {
    const navigate = useNavigate();
    const [stats, setStats] = useState({ elo: 1000, matches: 0 });
    const [copied, setCopied] = useState(false);
    const [isFollowing, setIsFollowing] = useState(false);
    const [isToggling, setIsToggling] = useState(false);
    const modalRef = useRef(null);

    // Determine which user to display
    const activeUser = viewUser || currentUser;
    const isOwnProfile = activeUser?.id === currentUserId || (!viewUser && currentUser);

    useEffect(() => {
        const checkFollowStatus = async () => {
            if (!currentUserId || !activeUser || isOwnProfile) return;
            const { data } = await supabase
                .from('user_follows')
                .select('*')
                .eq('follower_id', currentUserId)
                .eq('followed_id', activeUser.id)
                .maybeSingle();
            if (data) setIsFollowing(true);
            else setIsFollowing(false);
        };
        if (isOpen) checkFollowStatus();
    }, [isOpen, currentUserId, activeUser, isOwnProfile]);

    const handleFollowToggle = async () => {
        if (!currentUserId || !activeUser) return;
        setIsToggling(true);
        if (isFollowing) {
            await supabase.from('user_follows').delete()
                .eq('follower_id', currentUserId)
                .eq('followed_id', activeUser.id);
            setIsFollowing(false);
        } else {
            await supabase.from('user_follows').insert({
                follower_id: currentUserId,
                followed_id: activeUser.id
            });
            setIsFollowing(true);
        }
        setIsToggling(false);
    };

    useEffect(() => {
        if (!isOpen || !activeUser) return;

        const fetchStats = async () => {
            const { data } = await supabase.rpc('get_user_stats', { p_user_id: activeUser.id });
            if (data) setStats({ elo: data.elo_rating || 1000, matches: data.total_matches || 0 });
        };

        fetchStats();
    }, [isOpen, activeUser]);

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

    if (!isOpen || !activeUser) return null;

    const getRank = (rating) => {
        if (rating < 1050) return { name: 'Novice', color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30' };
        if (rating < 1200) return { name: 'Thinker', color: 'text-slate-300', bg: 'bg-slate-300/10', border: 'border-slate-300/30' };
        if (rating < 1500) return { name: 'Scholar', color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/30' };
        if (rating < 1800) return { name: 'Philosopher', color: 'text-fuchsia-400', bg: 'bg-fuchsia-400/10', border: 'border-fuchsia-400/30' };
        return { name: 'Oracle', color: 'text-cyan-400', bg: 'bg-cyan-400/10', border: 'border-cyan-400/30' };
    };

    const rank = getRank(stats.elo);

    const handleCopyId = () => {
        navigator.clipboard.writeText(activeUser.id);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        onClose();
        navigate('/login');
    };



    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6">
            {/* 2. Modal Card Container */}
            <div
                ref={modalRef}
                className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] mt-12"
            >
                {/* Header Banner */}
                <div className="h-24 bg-gradient-to-br from-indigo-900 to-cyan-900 flex-shrink-0 relative rounded-t-2xl">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 bg-slate-950/40 hover:bg-slate-950/80 text-slate-300 rounded-full transition-colors z-10"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Floating Avatar (Moved outside scrollable for overflow safety) */}
                <div className="relative h-1 w-full flex justify-center z-10">
                    <div className="absolute h-20 w-20 bg-slate-800 border-4 border-slate-900 rounded-full flex items-center justify-center shadow-lg -top-10 flex-shrink-0">
                        <span className="text-3xl font-bold text-cyan-400 uppercase">
                            {activeUser?.username ? activeUser.username.charAt(0) : (activeUser?.email?.charAt(0) || '?')}
                        </span>
                    </div>
                </div>

                {/* Scrollable Body Container */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-12 flex flex-col gap-4 relative">
                    {/* User Identity */}
                    <div className="text-center w-full mb-2">
                        <h3 className="text-lg font-bold text-slate-100 truncate px-2">{activeUser?.username || activeUser?.email}</h3>
                        <p className="text-sm text-cyan-400/80 font-medium mt-1">Socratic Arena Member</p>
                    </div>

                    {/* Professional Features */}
                    <div className="flex flex-col gap-3 w-full">
                        {/* Rank Badge */}
                        <div className={`flex items-center gap-4 p-3 rounded-xl border ${rank.bg} ${rank.border}`}>
                            <Shield className={`h-6 w-6 shrink-0 ${rank.color}`} />
                            <div className="text-left overflow-hidden">
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Current Division</p>
                                <p className={`text-sm font-bold truncate ${rank.color}`}>{rank.name}</p>
                            </div>
                        </div>

                        {/* Matches Played Stat */}
                        <div className="flex items-center gap-4 p-3 rounded-xl border border-slate-700 bg-slate-800/20">
                            <Swords className="h-5 w-5 text-rose-400 shrink-0" />
                            <p className="text-sm font-medium text-slate-300">{stats?.matches || 0} Total Matches Played</p>
                        </div>

                        {/* Player ID Copy */}
                        <button onClick={handleCopyId} className="flex items-center justify-between p-3 rounded-xl border border-slate-700 bg-slate-800/50 hover:bg-slate-700/50 transition-colors group w-full text-left">
                            <div className="flex items-center gap-4 overflow-hidden">
                                <div className="overflow-hidden">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Socratic ID</p>
                                    <p className="text-sm text-slate-300 font-mono truncate max-w-[180px]">{activeUser?.id?.split('-')[0]}...</p>
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
                    <div className="flex flex-col gap-3 w-full mt-2">
                        {/* Primary Action */}
                        <button
                            onClick={() => alert("Direct Challenges are unlocking in Phase 4!")}
                            className="w-full py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-slate-900 bg-cyan-400 hover:bg-cyan-300 transition-colors shadow-[0_0_15px_rgba(34,211,238,0.3)] cursor-pointer"
                        >
                            <Swords className="h-5 w-5" /> Challenge to Debate
                        </button>

                        {/* Secondary Actions */}
                        <div className="flex gap-3 w-full">
                            <button
                                onClick={onClose}
                                className="flex-1 py-3 rounded-xl flex items-center justify-center font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
                            >
                                Return
                            </button>

                            {!isOwnProfile && (
                                <button
                                    onClick={handleFollowToggle}
                                    disabled={isToggling}
                                    className={`flex-1 py-3 rounded-xl flex items-center justify-center font-bold transition-colors cursor-pointer border ${isFollowing
                                            ? 'text-cyan-400 bg-slate-800 hover:bg-slate-700 border-cyan-500/30'
                                            : 'text-slate-900 bg-cyan-400 hover:bg-cyan-300 border-cyan-400'
                                        }`}
                                >
                                    {isToggling ? '...' : isFollowing ? 'Following' : 'Follow'}
                                </button>
                            )}

                            {isOwnProfile && (
                                <button
                                    onClick={handleSignOut}
                                    className="flex-1 py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-all cursor-pointer"
                                >
                                    <LogOut className="h-5 w-5" /> Sign Out
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfileModal;
