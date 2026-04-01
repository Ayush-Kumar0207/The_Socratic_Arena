import { useEffect, useState, useRef } from 'react';
import { X, LogOut, Shield, Wifi, Copy, CheckCircle2, ArrowLeft, UserPlus, UserCheck, Swords, Search, ChevronDown, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';

const ProfileModal = ({ isOpen, onClose, viewUser, currentUserId, currentUser, socket }) => {
    const navigate = useNavigate();
    const [stats, setStats] = useState({ elo: 1000, matches: 0 });
    const [copied, setCopied] = useState(false);
    const [isFollowing, setIsFollowing] = useState(false);
    const [isToggling, setIsToggling] = useState(false);
    const modalRef = useRef(null);

    // --- Challenge Dialog State ---
    const [showChallengeDialog, setShowChallengeDialog] = useState(false);
    const [topics, setTopics] = useState([]);
    const [topicSearch, setTopicSearch] = useState('');
    const [selectedTopic, setSelectedTopic] = useState(null);
    const [selectedStance, setSelectedStance] = useState('Random');
    const [challengeStatus, setChallengStatus] = useState('idle'); // idle | sending | sent | error
    const [challengeFeedback, setChallengeFeedback] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);
    const challengeContainerRef = useRef(null);
    const challengeTimeoutRef = useRef(null);

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

    // Fetch topics when challenge dialog opens
    useEffect(() => {
        if (!showChallengeDialog) return;
        const fetchTopics = async () => {
            const { data } = await supabase
                .from('topics')
                .select('id, title, category')
                .order('created_at', { ascending: false })
                .limit(200);
            if (data) setTopics(data);
        };
        fetchTopics();
    }, [showChallengeDialog]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClick = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsDropdownOpen(false);
            }
        };
        if (isDropdownOpen) document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [isDropdownOpen]);

    // Listen for challenge events
    useEffect(() => {
        if (!socket) return;

        const handleSent = (data) => {
            if (challengeTimeoutRef.current) clearTimeout(challengeTimeoutRef.current);
            setChallengStatus('sent');
            setChallengeFeedback(`Challenge sent to ${data.target_username}!`);
            setTimeout(() => {
                setShowChallengeDialog(false);
                resetChallengeState();
            }, 2000);
        };

        const handleError = (data) => {
            if (challengeTimeoutRef.current) clearTimeout(challengeTimeoutRef.current);
            setChallengStatus('error');
            setChallengeFeedback(data.message || 'Failed to send challenge.');
        };

        socket.on('challenge_sent', handleSent);
        socket.on('challenge_error', handleError);

        return () => {
            socket.off('challenge_sent', handleSent);
            socket.off('challenge_error', handleError);
        };
    }, [socket]);

    const resetChallengeState = () => {
        setSelectedTopic(null);
        setSelectedStance('Random');
        setChallengStatus('idle');
        setChallengeFeedback('');
        setTopicSearch('');
        setIsDropdownOpen(false);
    };

    useEffect(() => {
        const handleOutsideClick = (event) => {
            const isMainModalClick = modalRef.current && modalRef.current.contains(event.target);
            const isChallengeDialogClick = challengeContainerRef.current && challengeContainerRef.current.contains(event.target);
            
            if (!isMainModalClick && !isChallengeDialogClick) {
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

    const handleSendChallenge = async () => {
        if (!challengeQuestion.trim() || challengeQuestion.trim().length < 5) return;
        setChallengStatus('creating');

        // Find or create topic
        const questionText = challengeQuestion.trim();
        const categoryText = challengeTopic.trim();

        let topicId = null;
        const { data: existing } = await supabase.from('topics').select('*').eq('title', questionText).single();
        if (existing) {
            topicId = existing.id;
        } else {
            // Insert topic
            if (categoryText) {
                const { data: catCheck } = await supabase.from('topics').select('id').eq('title', categoryText).single();
                if (!catCheck) await supabase.from('topics').insert({ title: categoryText, category: 'Community' });
            }
            const { data: newTopic } = await supabase.from('topics').insert({ title: questionText, category: categoryText || 'Community' }).select().single();
            if (newTopic) topicId = newTopic.id;
        }

        socket.emit('send_challenge', {
            targetUserId: activeUser.id,
            topicId,
            topicTitle: questionText,
            challengerStance: selectedStance
        });
        // Safety timeout
        challengeTimeoutRef.current = setTimeout(() => {
            setChallengStatus('error');
            setChallengeFeedback('Server took too long to respond. Please try again.');
        }, 20000);
    };

    const filteredTopics = topics.filter(t =>
        t.title.toLowerCase().includes(topicSearch.toLowerCase())
    );

    const stanceOptions = [
        { id: 'Defender', label: 'Defender', color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', activeBorder: 'ring-cyan-500' },
        { id: 'Critic', label: 'Critic', color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30', activeBorder: 'ring-rose-500' },
        { id: 'Random', label: 'Random', color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/30', activeBorder: 'ring-slate-500' },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6">
            {/* Challenge Dialog Overlay */}
            {showChallengeDialog && (
                <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-8">
                    <div 
                        ref={challengeContainerRef}
                        className="w-[95%] sm:max-w-2xl bg-[#0f172a] border border-slate-700/60 rounded-3xl shadow-[0_30px_100px_-20px_rgba(0,0,0,0.9)] flex flex-col max-h-[calc(100vh-4rem)] sm:max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-300" 
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Challenge Header */}
                        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
                            <h3 className="font-bold text-slate-100 flex items-center gap-2">
                                <Swords className="h-5 w-5 text-cyan-400" />
                                Challenge {activeUser?.username || 'User'}
                            </h3>
                            <button onClick={() => { setShowChallengeDialog(false); resetChallengeState(); }} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition">
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Challenge Body */}
                        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 sm:space-y-8">
                            {/* Topic Selector */}
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Select Topic</label>
                                <div className="relative" ref={dropdownRef}>
                                    <button
                                        type="button"
                                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                        className="w-full bg-slate-800/80 border border-slate-700/50 rounded-xl py-3 px-4 text-left flex items-center justify-between gap-2 hover:border-slate-600 transition"
                                    >
                                        <span className={`text-sm truncate ${selectedTopic ? 'text-slate-200' : 'text-slate-500'}`}>
                                            {selectedTopic ? selectedTopic.title : 'Choose a debate topic...'}
                                        </span>
                                        <ChevronDown className={`h-4 w-4 text-slate-500 shrink-0 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {isDropdownOpen && (
                                        <div className="relative mt-3 bg-slate-950/40 backdrop-blur-xl border-2 border-cyan-500/30 rounded-2xl shadow-inner z-10 max-h-[350px] sm:max-h-[600px] overflow-hidden flex flex-col animate-in slide-in-from-top-2 duration-300">
                                            {/* Search inside dropdown */}
                                            <div className="p-3 border-b border-slate-800/80 shrink-0 bg-slate-950/50">
                                                <div className="relative group">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
                                                    <input
                                                        type="text"
                                                        placeholder="Quick find topic..."
                                                        value={topicSearch}
                                                        onChange={(e) => setTopicSearch(e.target.value)}
                                                        className="w-full bg-slate-900/80 border border-slate-700/50 rounded-lg py-2 pl-8 pr-3 text-slate-200 text-xs placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                                                        autoFocus
                                                    />
                                                </div>
                                            </div>
                                            {/* Topic list */}
                                            <div className="overflow-y-auto custom-scrollbar flex-1">
                                                {filteredTopics.length === 0 ? (
                                                    <p className="px-4 py-3 text-xs text-slate-500 text-center">No topics found</p>
                                                ) : (
                                                    filteredTopics.map(topic => (
                                                        <button
                                                            key={topic.id}
                                                            onClick={() => {
                                                                setSelectedTopic(topic);
                                                                setIsDropdownOpen(false);
                                                                setTopicSearch('');
                                                            }}
                                                            className={`w-full text-left px-5 py-4 text-sm hover:bg-cyan-500/5 hover:text-cyan-200 transition-all flex items-center justify-between gap-4 border-b border-slate-800/40 last:border-0 ${selectedTopic?.id === topic.id ? 'bg-cyan-500/10 text-cyan-300 font-bold' : 'text-slate-400 font-medium'}`}
                                                        >
                                                            <span className="truncate leading-tight">{topic.title}</span>
                                                            {topic.category && (
                                                                <span className="px-2 py-0.5 rounded-full bg-slate-950/50 border border-slate-800 text-[8px] font-black tracking-widest text-slate-500 uppercase shrink-0">
                                                                    {topic.category}
                                                                </span>
                                                            )}
                                                        </button>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Stance Selector */}
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Your Stance</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {stanceOptions.map(opt => (
                                        <button
                                            key={opt.id}
                                            onClick={() => setSelectedStance(opt.id)}
                                            className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${
                                                selectedStance === opt.id
                                                    ? `${opt.bg} ${opt.border} ${opt.color} ring-2 ring-offset-2 ring-offset-slate-900 ${opt.activeBorder}`
                                                    : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Feedback */}
                            {challengeFeedback && (
                                <div className={`text-sm font-medium px-4 py-3 rounded-xl border ${
                                    challengeStatus === 'error'
                                        ? 'bg-red-500/10 border-red-500/30 text-red-400'
                                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                }`}>
                                    {challengeFeedback}
                                </div>
                            )}
                        </div>

                        {/* Challenge Footer */}
                        <div className="px-5 py-4 border-t border-slate-800 shrink-0 flex gap-3">
                            <button
                                onClick={() => { setShowChallengeDialog(false); resetChallengeState(); }}
                                className="flex-1 py-3 rounded-xl font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSendChallenge}
                                disabled={!selectedTopic || challengeStatus === 'sending' || challengeStatus === 'sent'}
                                className="flex-1 py-3 rounded-xl font-bold text-slate-900 bg-cyan-400 hover:bg-cyan-300 transition shadow-[0_0_15px_rgba(34,211,238,0.3)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {challengeStatus === 'sending' ? (
                                    <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
                                ) : challengeStatus === 'sent' ? (
                                    <><CheckCircle2 className="h-4 w-4" /> Sent!</>
                                ) : (
                                    <><Swords className="h-4 w-4" /> Send Challenge</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 2. Modal Card Container */}
            <div
                ref={modalRef}
                className="relative w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col max-h-[calc(100vh-7rem)]"
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

                </div>

                {/* Fixed Action Footer */}
                <div className="shrink-0 p-6 pt-4 bg-slate-900 border-t border-slate-800 rounded-b-2xl flex flex-col gap-3 w-full z-10">
                    {!isOwnProfile && (
                        <button
                            onClick={() => { setShowChallengeDialog(true); resetChallengeState(); }}
                            className="w-full py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-slate-900 bg-cyan-400 hover:bg-cyan-300 transition-colors shadow-[0_0_15px_rgba(34,211,238,0.3)] cursor-pointer"
                        >
                            <Swords className="h-5 w-5" /> Challenge to Debate
                        </button>
                    )}

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
                                className={`flex-1 py-3 rounded-xl flex items-center justify-center font-bold transition-colors cursor-pointer border ${isFollowing ? 'text-cyan-400 bg-slate-800 hover:bg-slate-700 border-cyan-500/30' : 'text-slate-900 bg-cyan-400 hover:bg-cyan-300 border-cyan-400'}`}
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
    );
};

export default ProfileModal;
