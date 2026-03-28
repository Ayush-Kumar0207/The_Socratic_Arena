import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Lock } from 'lucide-react';

/**
 * VoiceOrb — Audio-reactive voice visualization
 * 
 * Uses AudioContext + AnalyserNode to read real-time frequency data
 * from the microphone stream. Drives dynamic scale, glow, and
 * border-radius distortion based on actual vocal volume.
 * 
 * Three visual states:
 *  🟢 Active  (my turn, listening)    — Cyan/indigo glow, full reactivity
 *  🔴 Locked  (opponent's turn, listening) — Red glow, scratchpad mode
 *  ⚫ Standby (not listening)         — Muted, subtle breathing animation
 */
const VoiceOrb = ({
  volume = 0,         // New: Normalized volume (0-1) from hook
  isListening,        // Whether the mic is currently active
  isMyTurn,           // Whether it's the current user's turn
  isDisabled,         // Full disable (e.g., spectator or match over)
  onClick,            // Toggle mic on/off
  interimText,        // Live interim voice text for visual feedback
  scratchpadText,     // Scratchpad text (shown in locked mode)
  error,              // Error message from voice recognition
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Derive visual state
  const isActive = isListening && isMyTurn;
  const isLocked = isListening && !isMyTurn;
  const isStandby = !isListening;

  // Dynamic styles driven by volume
  const scale = isActive ? 1 + volume * 0.35 : isLocked ? 1 + volume * 0.15 : 1;
  const glowIntensity = isActive ? 10 + volume * 40 : isLocked ? 5 + volume * 15 : 0;
  const glowSpread = isActive ? 2 + volume * 15 : isLocked ? 1 + volume * 8 : 0;
  
  // Organic border-radius distortion
  const br1 = isActive ? 50 - volume * 8 : 50;
  const br2 = isActive ? 50 + volume * 5 : 50;
  const br3 = isActive ? 50 - volume * 3 : 50;
  const br4 = isActive ? 50 + volume * 6 : 50;

  const glowColor = isActive
    ? `rgba(34, 211, 238, ${0.3 + volume * 0.5})`   // Cyan
    : isLocked
      ? `rgba(239, 68, 68, ${0.2 + volume * 0.3})`    // Red
      : 'rgba(100, 116, 139, 0.1)';                     // Slate

  const borderColor = isActive
    ? `rgba(34, 211, 238, ${0.5 + volume * 0.5})`
    : isLocked
      ? `rgba(239, 68, 68, ${0.4 + volume * 0.4})`
      : 'rgba(100, 116, 139, 0.3)';

  const bgGradient = isActive
    ? `radial-gradient(circle, rgba(34, 211, 238, ${0.15 + volume * 0.2}) 0%, rgba(99, 102, 241, ${0.1 + volume * 0.15}) 60%, rgba(15, 23, 42, 0.9) 100%)`
    : isLocked
      ? `radial-gradient(circle, rgba(239, 68, 68, ${0.1 + volume * 0.15}) 0%, rgba(127, 29, 29, ${0.08}) 60%, rgba(15, 23, 42, 0.9) 100%)`
      : 'radial-gradient(circle, rgba(51, 65, 85, 0.3) 0%, rgba(15, 23, 42, 0.9) 100%)';

  return (
    <div className="relative flex flex-col items-center gap-1">
      {/* Error tooltip */}
      {error && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap bg-red-950/95 text-red-300 text-[10px] font-semibold px-3 py-1.5 rounded-lg border border-red-500/30 shadow-xl z-10">
          {error}
        </div>
      )}

      {/* Locked mode indicator */}
      {isLocked && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-red-950/90 text-red-300 text-[10px] font-bold px-2.5 py-1 rounded-md border border-red-500/30 uppercase tracking-widest">
          ✏️ Scratchpad Mode
        </div>
      )}

      {/* The Orb */}
      <button
        type="button"
        onClick={onClick}
        disabled={isDisabled}
        title={
          isDisabled ? 'Voice unavailable'
          : isListening ? 'Stop listening'
          : 'Start voice input'
        }
        className="relative group cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 transition-all duration-100 focus:outline-none"
        style={{
          width: '44px',
          height: '44px',
          borderRadius: `${br1}% ${br2}% ${br3}% ${br4}%`,
          transform: `scale(${scale})`,
          background: bgGradient,
          border: `2px solid ${borderColor}`,
          boxShadow: isListening
            ? `0 0 ${glowIntensity}px ${glowSpread}px ${glowColor}, inset 0 0 ${glowIntensity * 0.3}px ${glowColor}`
            : 'none',
          transition: 'border-radius 0.15s ease, box-shadow 0.1s ease, transform 0.1s ease, background 0.3s ease',
        }}
      >
        {/* Inner pulse ring (active only) */}
        {isListening && (
          <div
            className="absolute inset-0 rounded-full animate-ping"
            style={{
              border: `1px solid ${isActive ? 'rgba(34, 211, 238, 0.3)' : 'rgba(239, 68, 68, 0.2)'}`,
              animationDuration: '2s',
            }}
          />
        )}

        {/* Icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          {isDisabled ? (
            <MicOff className="h-4.5 w-4.5 text-slate-600" />
          ) : isLocked ? (
            <Lock className="h-4 w-4 text-red-400" />
          ) : isListening ? (
            <Mic className="h-4.5 w-4.5 text-cyan-300" />
          ) : (
            <Mic className="h-4.5 w-4.5 text-slate-400 group-hover:text-cyan-400 transition-colors" />
          )}
        </div>

        {/* Volume bar indicators (active only) */}
        {isListening && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-[2px]">
            {[0.15, 0.3, 0.45, 0.6, 0.75].map((threshold, i) => (
              <div
                key={i}
                className="rounded-full transition-all duration-75"
                style={{
                  width: '3px',
                  height: volume > threshold ? `${6 + (volume - threshold) * 10}px` : '3px',
                  backgroundColor: isActive
                    ? volume > threshold ? 'rgb(34, 211, 238)' : 'rgba(34, 211, 238, 0.2)'
                    : volume > threshold ? 'rgb(239, 68, 68)' : 'rgba(239, 68, 68, 0.2)',
                }}
              />
            ))}
          </div>
        )}
      </button>

      {/* Standby breathing animation (CSS only, no JS overhead) */}
      {isStandby && !isDisabled && (
        <style>{`
          @keyframes voice-orb-breathe {
            0%, 100% { box-shadow: 0 0 4px 1px rgba(100, 116, 139, 0.1); }
            50% { box-shadow: 0 0 8px 3px rgba(100, 116, 139, 0.2); }
          }
        `}</style>
      )}
    </div>
  );
};

export default VoiceOrb;
