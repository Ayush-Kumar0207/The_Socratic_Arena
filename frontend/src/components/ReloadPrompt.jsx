import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X, Download } from 'lucide-react';

const ReloadPrompt = () => {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('[PWA] SW Registered:', r);
    },
    onRegisterError(error) {
      console.error('[PWA] SW Registration Error:', error);
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  if (!offlineReady && !needRefresh) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 animate-in slide-in-from-bottom-10 duration-500">
      <div className="flex w-80 items-center gap-4 rounded-2xl border border-slate-700 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-xl ring-1 ring-white/10">
        <div className="shrink-0 bg-cyan-600/20 rounded-full p-3 border border-cyan-500/30">
          {needRefresh ? (
            <RefreshCw className="h-6 w-6 text-cyan-400 animate-spin-slow" />
          ) : (
            <Download className="h-6 w-6 text-emerald-400" />
          )}
        </div>

        <div className="flex-1">
          <h3 className="text-sm font-bold text-slate-100">
            {needRefresh ? 'Upgrade Available' : 'Ready for Battle'}
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">
            {needRefresh 
              ? 'A newer, more stable version of Socratic Arena is ready for deployment.' 
              : 'Arena is now cached and ready for offline use in high-latency zones.'}
          </p>
          
          <div className="mt-3 flex items-center justify-end gap-2">
            <button 
              onClick={close}
              className="px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-300 transition-colors uppercase tracking-widest"
            >
              Dismiss
            </button>
            {needRefresh && (
              <button 
                onClick={() => updateServiceWorker(true)}
                className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-1.5 text-[11px] font-black text-slate-950 transition-all hover:bg-cyan-400 hover:scale-105 active:scale-95 shadow-lg shadow-cyan-500/20"
              >
                RELOAD NOW
              </button>
            )}
          </div>
        </div>

        <button 
          onClick={close}
          className="absolute top-3 right-3 text-slate-600 hover:text-slate-400 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default ReloadPrompt;
