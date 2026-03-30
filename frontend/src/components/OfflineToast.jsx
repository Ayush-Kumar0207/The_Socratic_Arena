import { useEffect, useState, useRef } from 'react';
import { Zap } from 'lucide-react';

const OfflineToast = ({ session }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isFading, setIsFading] = useState(false);
  const hasTriggered = useRef(false);

  useEffect(() => {
    // TRIGGER: Only if there's a session AND we haven't shown it in this browser tab yet
    const isSessionInStorage = sessionStorage.getItem('hasSeenNeuralLinkThisSession');

    if (session && !isSessionInStorage && !hasTriggered.current) {
      hasTriggered.current = true;
      sessionStorage.setItem('hasSeenNeuralLinkThisSession', 'true');
      
      setIsVisible(true);
      setIsFading(false);

      // THE MAGICAL LIFECYCLE TIMERS
      const exitTimer = setTimeout(() => setIsFading(true), 4200);
      const unmountTimer = setTimeout(() => {
        setIsVisible(false);
      }, 5000);

      return () => {
        clearTimeout(exitTimer);
        clearTimeout(unmountTimer);
      };
    }
    
    // Reset if user logs out (so it can show when they log back in)
    if (!session) {
      sessionStorage.removeItem('hasSeenNeuralLinkThisSession');
      hasTriggered.current = false;
      setIsVisible(false);
    }
  }, [session]);

  if (!isVisible) return null;

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
