import { Loader2, Pause, Volume2 } from 'lucide-react';

const PollyListenButton = ({ speech, text, speechId, className = '' }) => {
  const loading = speech.loadingId === speechId;
  const playing = speech.playingId === speechId;
  const available = speech.capabilities?.enabled === true;
  return (
    <button
      type="button"
      onClick={() => (playing ? speech.stop() : speech.speak(text, speechId))}
      disabled={!available || loading}
      title={available ? 'Listen with Amazon Polly' : 'Amazon Polly voice output is unavailable'}
      aria-label={playing ? 'Stop voice playback' : 'Listen to this AI response'}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-bold text-slate-300 transition hover:border-cyan-500/50 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : playing ? <Pause className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
      {loading ? 'Loading' : playing ? 'Stop' : 'Listen'}
    </button>
  );
};

export default PollyListenButton;
