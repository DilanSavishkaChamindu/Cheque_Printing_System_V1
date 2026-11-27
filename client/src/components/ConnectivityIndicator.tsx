import { CloudOff, RefreshCw, Wifi } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { Badge } from './ui/Badge';

export function ConnectivityIndicator() {
  const { isOnline, pendingSyncCount } = useOnlineStatus();

  return (
    <div className="flex items-center gap-2">
      <Badge variant={isOnline ? 'success' : 'warning'}>
        {isOnline ? (
          <>
            <Wifi className="h-3.5 w-3.5" />
            <span>Online</span>
          </>
        ) : (
          <>
            <CloudOff className="h-3.5 w-3.5" />
            <span>Offline Mode</span>
          </>
        )}
      </Badge>
      <Badge variant={pendingSyncCount > 0 ? 'info' : 'neutral'}>
        <RefreshCw className="h-3.5 w-3.5" />
        <span className="tabular-nums">
          {pendingSyncCount === 0
            ? 'Synced'
            : `${pendingSyncCount} Pending Sync`}
        </span>
      </Badge>
    </div>
  );
}
