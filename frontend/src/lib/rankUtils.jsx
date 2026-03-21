import { Trophy, BookOpen, Scroll, Star, Crown } from 'lucide-react';
import React from 'react';

/**
 * Calculates the user's rank based on their Elo rating.
 * 0-799: Novice (Bronze)
 * 800-1199: Thinker (Silver)
 * 1200-1499: Scholar (Gold)
 * 1500-1799: Philosopher (Platinum/Purple)
 * 1800+: Oracle (Diamond/Cyan glowing)
 */
export const getRankInfo = (elo) => {
  const rating = Number(elo) || 0;

  if (rating < 1050) {
    return {
      name: 'Novice',
      level: 1,
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/30',
      gradient: 'from-amber-600 to-amber-500',
      Icon: Trophy,
      shadow: 'shadow-amber-900/20'
    };
  } else if (rating < 1200) {
    return {
      name: 'Thinker',
      level: 2,
      color: 'text-slate-300',
      bgColor: 'bg-slate-300/10',
      borderColor: 'border-slate-300/30',
      gradient: 'from-slate-500 to-slate-400',
      Icon: BookOpen,
      shadow: 'shadow-slate-500/20'
    };
  } else if (rating < 1500) {
    return {
      name: 'Scholar',
      level: 3,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-400/10',
      borderColor: 'border-emerald-400/30',
      gradient: 'from-emerald-600 to-emerald-400',
      Icon: Scroll,
      shadow: 'shadow-emerald-500/20'
    };
  } else if (rating < 1800) {
    return {
      name: 'Philosopher',
      level: 4,
      color: 'text-fuchsia-400',
      bgColor: 'bg-fuchsia-400/10',
      borderColor: 'border-fuchsia-400/30',
      gradient: 'from-fuchsia-600 to-fuchsia-400',
      Icon: Star,
      shadow: 'shadow-fuchsia-500/30'
    };
  } else {
    // 1800+
    return {
      name: 'Oracle',
      level: 5,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-400/10',
      borderColor: 'border-cyan-400/30',
      gradient: 'from-cyan-500 to-blue-500',
      Icon: Crown,
      shadow: 'shadow-cyan-400/40 animate-pulse'
    };
  }
};

/**
 * Renders a small badge for the given Elo rating, useful for leaderboards and cards.
 */
export const RankBadge = ({ elo, className = '' }) => {
  const rank = getRankInfo(elo);
  const Icon = rank.Icon;

  return (
    <div 
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${rank.bgColor} ${rank.borderColor} ${rank.shadow} ${className}`}
      title={`${rank.name} (${elo} Elo)`}
    >
      <Icon className={`h-3.5 w-3.5 ${rank.color}`} />
      <span className={`text-xs font-bold uppercase tracking-wider ${rank.color}`}>
        {rank.name}
      </span>
    </div>
  );
};
