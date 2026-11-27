import { Layers } from 'lucide-react';
import { EmptyState } from '../../components/ui/EmptyState';

export function ModulePendingPhasePage({
  moduleName,
  targetPhase,
}: {
  moduleName: string;
  targetPhase: string;
}) {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <EmptyState
        icon={<Layers className="h-5 w-5 text-emerald-600" />}
        title={`${moduleName} — Scheduled for ${targetPhase}`}
        description={`This module is entitled and authorized for your account, and its database schema is ready. Backend APIs and interactive UI will be wired in ${targetPhase} without mock data.`}
      />
    </div>
  );
}
