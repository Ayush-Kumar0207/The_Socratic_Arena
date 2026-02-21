import { useEffect, useRef } from 'react';
import { Shield, Swords, Bot } from 'lucide-react';

/**
 * DebateArena
 * -----------------------------------------------------------------------------
 * Renders the right-side live debate transcript UI.
 *
 * Props:
 * - transcript: Array of messages like { speaker: 'Critic' | 'Defender', text: '...' }
 * - isLoading: boolean indicating if backend is still generating debate turns.
 *
 * UX behavior:
 * - Distinct visual styling for Critic vs Defender for quick readability.
 * - Empty state when no debate transcript exists yet.
 * - Auto-scroll to latest message whenever transcript updates.
 */
const DebateArena = ({ transcript = [], isLoading = false }) => {
  // This ref points to a hidden anchor at the end of the message list.
  // We scroll this into view on every transcript update.
  const endOfMessagesRef = useRef(null);

  // Auto-scroll behavior so users always see the latest generated argument.
  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, isLoading]);

  // Helper to normalize unknown speakers into a neutral style.
  const getSpeakerTheme = (speaker) => {
    if (speaker === 'Critic') {
      return {
        label: 'Critic',
        icon: <Swords className="h-4 w-4 text-rose-300" />,
        bubble: 'border-rose-500/40 bg-rose-950/30',
        name: 'text-rose-300',
      };
    }

    if (speaker === 'Defender') {
      return {
        label: 'Defender',
        icon: <Shield className="h-4 w-4 text-indigo-300" />,
        bubble: 'border-indigo-500/40 bg-indigo-950/30',
        name: 'text-indigo-300',
      };
    }

    return {
      label: speaker || 'System',
      icon: <Bot className="h-4 w-4 text-slate-300" />,
      bubble: 'border-slate-500/30 bg-slate-800/40',
      name: 'text-slate-300',
    };
  };

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-700 bg-slate-900/60 p-5 shadow-inner">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-slate-100">Debate Arena</h2>
        <p className="text-sm text-slate-400">Live Critic vs Defender transcript appears below.</p>
      </div>

      <div className="flex-1 overflow-y-auto pr-1">
        {transcript.length === 0 && !isLoading ? (
          <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/40 px-6 text-center">
            <Bot className="mb-3 h-9 w-9 text-slate-500" />
            <p className="text-sm text-slate-400">Upload a document to begin the debate...</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transcript.map((message, index) => {
              const theme = getSpeakerTheme(message.speaker);

              return (
                <article
                  key={`${message.speaker}-${index}`}
                  className={`rounded-xl border p-4 backdrop-blur-sm ${theme.bubble}`}
                >
                  <header className="mb-2 flex items-center gap-2">
                    {theme.icon}
                    <span className={`text-xs font-semibold uppercase tracking-wide ${theme.name}`}>
                      {theme.label}
                    </span>
                  </header>

                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
                    {message.text}
                  </p>
                </article>
              );
            })}

            {isLoading && (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4">
                <p className="animate-pulse text-sm font-medium text-cyan-200">
                  AI is analyzing and debating...
                </p>
              </div>
            )}

            <div ref={endOfMessagesRef} />
          </div>
        )}
      </div>
    </div>
  );
};

export default DebateArena;
