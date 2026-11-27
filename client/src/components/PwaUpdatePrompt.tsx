import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';
import { processPendingSyncQueue } from '../services/syncEngine';
import { Button } from './ui/Button';

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    const handleOnline = () => {
      void processPendingSyncQueue();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  if (!needRefresh && !offlineReady) {
    return null;
  }

  return (
    <div className="no-print fixed right-4 bottom-4 z-50 max-w-sm rounded-xl border border-slate-300 bg-slate-950 p-4 text-xs text-white shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">
            {needRefresh ? 'Application Update Available' : 'Ready for Offline Use'}
          </p>
          <p className="mt-1 text-slate-300">
            {needRefresh
              ? 'A newer version of ChequePrint SaaS is available.'
              : 'Application shell has been cached for offline access.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOfflineReady(false);
            setNeedRefresh(false);
          }}
          className="text-slate-400 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {needRefresh && (
        <div className="mt-3 flex justify-end">
          <Button
            className="bg-emerald-600 hover:bg-emerald-500 text-xs"
            onClick={() => void updateServiceWorker(true)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Reload &amp; Update</span>
          </Button>
        </div>
      )}
    </div>
  );
}
