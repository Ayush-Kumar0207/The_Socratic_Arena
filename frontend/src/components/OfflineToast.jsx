import { useEffect, useState, useRef } from 'react';
import { Zap } from 'lucide-react';

const OfflineToast = ({ session }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isFading, setIsFading] = useState(false);
  const hasTriggeredThisLife = useRef(false);

  // 1. THE TRIGGER: Decide if we should show the toast
  useEffect(() => {
    if (session?.user?.id) {
      const alreadyShown = sessionStorage.getItem('hasSeenNeuralLinkThisSession');
      
      if (!alreadyShown && !hasTriggeredThisLife.current) {
        hasTriggeredThisLife.current = true;
        sessionStorage.setItem('hasSeenNeuralLinkThisSession', 'true');
        setIsVisible(true);
        setIsFading(false);
      }
    } else {
      // User logged out: Reset everything
      sessionStorage.removeItem('hasSeenNeuralLinkThisSession');
      hasTriggeredThisLife.current = false;
      setIsVisible(false);
    }
  }, [session]);

  // 2. THE LIFECYCLE: Handle the 5s timer independently
  useEffect(() => {
    if (isVisible) {
      const exitTimer = setTimeout(() => setIsFading(true), 4200);
      const unmountTimer = setTimeout(() => {
        setIsVisible(false);
        setIsFading(false);
      }, 5000);

      return () => {
        clearTimeout(exitTimer);
        clearTimeout(unmountTimer);
      };
    }
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div 
      className={`
        fixed top-6 left-1/2 z-[200]
        flex items-center gap-4 px-6 py-3.5 rounded-full 
        bg-slate-950/60 border border-slate-700/50 shadow-2xl backdrop-blur-xl
        ring-1 ring-white/10 pointer-events-none
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
