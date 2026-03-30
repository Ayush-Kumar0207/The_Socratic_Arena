import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Zap } from 'lucide-react';

const OfflineToast = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isFading, setIsFading] = useState(false);

  const {
    offlineReady: [offlineReady, setOfflineReady],
  } = useRegisterSW();

  useEffect(() => {
    if (offlineReady) {
      // THE LOCK: Ensure the user only ever sees this once
      const hasSeenToast = localStorage.getItem('hasSeenOfflineToast');

      if (hasSeenToast) {
        setOfflineReady(false);
        setIsVisible(false);
        return;
      }

      // THE EXECUTION: Mark as seen and show the UI
      localStorage.setItem('hasSeenOfflineToast', 'true');
      setIsVisible(true);
      setIsFading(false);

      // THE MAGICAL LIFECYCLE TIMERS
      // Start fade out at 4.2s to leave 800ms for the exit animation
      const exitTimer = setTimeout(() => setIsFading(true), 4200);
      const unmountTimer = setTimeout(() => {
        setIsVisible(false);
        setOfflineReady(false);
      }, 5000);

      return () => {
        clearTimeout(exitTimer);
        clearTimeout(unmountTimer);
      };
    }
  }, [offlineReady, setOfflineReady]);

  if (!isVisible || !offlineReady) return null;

  return (
    <div 
      className={`
        fixed top-6 left-1/2 z-[200]
        flex items-center gap-4 px-6 py-3.5 rounded-full 
        bg-slate-950/60 border border-slate-700/50 shadow-2xl backdrop-blur-xl
        ring-1 ring-white/10
        ${isFading ? 'animate-toast-exit' : 'animate-toast-reveal'}
      `}
    >
      <div className="relative">
        <div className="absolute inset-0 bg-cyan-500/50 blur-lg animate-pulse rounded-full"></div>
        <div className="relative bg-cyan-600/30 rounded-full p-1.5 border border-cyan-400/40">
          <Zap className="h-4 w-4 text-cyan-300" />
        </div>
      </div>
      
      <span className="text-sm font-bold tracking-wide text-shimmer whitespace-nowrap">
        Neural link established. Ready for high-speed engagement.
      </span>
    </div>
  );
};

export default OfflineToast;
