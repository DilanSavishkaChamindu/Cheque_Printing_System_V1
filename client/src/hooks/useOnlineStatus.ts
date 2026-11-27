import { useEffect, useState } from 'react';
import { offlineDb } from '../lib/offlineDb';

export function useOnlineStatus(): {
  isOnline: boolean;
  pendingSyncCount: number;
  refreshPendingCount: () => Promise<void>;
} {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);

  const refreshPendingCount = async (): Promise<void> => {
    try {
      const count = await offlineDb.syncOperations
        .where('status')
        .anyOf(['PENDING', 'FAILED', 'CONFLICT'])
        .count();
      setPendingSyncCount(count);
    } catch {
      setPendingSyncCount(0);
    }
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    void refreshPendingCount();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return {
    isOnline,
    pendingSyncCount,
    refreshPendingCount,
  };
}
