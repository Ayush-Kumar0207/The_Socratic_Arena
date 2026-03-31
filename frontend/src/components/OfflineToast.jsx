import { useEffect, useState, useRef } from 'react';
import { Zap } from 'lucide-react';

const OfflineToast = ({ session }) => {
  const [isVisible, setIsVisible] = useState(false);
  const hasTriggeredThisLife = useRef(false);

  // 1. THE TRIGGER: Decide if we should show the toast
  useEffect(() => {
    if (session?.user?.id) {
      const alreadyShown = sessionStorage.getItem('hasSeenNeuralLinkThisSession');
      
      if (!alreadyShown && !hasTriggeredThisLife.current) {
        hasTriggeredThisLife.current = true;
        sessionStorage.setItem('hasSeenNeuralLinkThisSession', 'true');
        setIsVisible(true);
      }
    } else {
      // User logged out: Reset everything
      sessionStorage.removeItem('hasSeenNeuralLinkThisSession');
      hasTriggeredThisLife.current = false;
      setIsVisible(false);
    }
  }, [session]);

  // 2. THE LIFECYCLE: Wait 6s before unmounting to ensure the 5s CSS fade finishes completely
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => setIsVisible(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="fixed top-4 sm:top-6 left-1/2 -translate-x-1/2 z-[200] pointer-events-none w-[calc(100vw-1rem)] sm:w-auto px-2 sm:px-0">
      <div 
        className="flex items-start sm:items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3 sm:py-3.5 rounded-2xl sm:rounded-full bg-slate-950/60 border border-slate-700/50 shadow-2xl backdrop-blur-xl ring-1 ring-white/10 animate-magical-toast max-w-full"
      >
        <div className="relative">
          <div className="absolute inset-0 bg-cyan-500/50 blur-lg animate-pulse rounded-full"></div>
          <div className="relative bg-cyan-600/30 rounded-full p-1.5 border border-cyan-400/40">
            <Zap className="h-4 w-4 text-cyan-300" />
          </div>
        </div>
        
        <span className="text-xs sm:text-sm font-bold tracking-wide text-shimmer leading-tight sm:leading-normal break-words">
          Neural link established. Ready for high-speed engagement.
        </span>
      </div>
    </div>
  );
};

export default OfflineToast;
