import type { PaginationMeta } from '@cheque-saas/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

export function PaginationControls({
  pagination,
  onPageChange,
}: {
  pagination?: PaginationMeta;
  onPageChange: (nextPage: number) => void;
}) {
  if (!pagination || pagination.totalItems === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
      <p className="tabular-nums">
        Page <span className="font-semibold text-slate-900">{pagination.page}</span> of{' '}
        <span className="font-semibold text-slate-900">{pagination.totalPages}</span> (
        {pagination.totalItems} records)
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          className="px-2.5 py-1.5 text-xs"
          disabled={!pagination.hasPreviousPage}
          onClick={() => onPageChange(pagination.page - 1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>Previous</span>
        </Button>
        <Button
          variant="secondary"
          className="px-2.5 py-1.5 text-xs"
          disabled={!pagination.hasNextPage}
          onClick={() => onPageChange(pagination.page + 1)}
        >
          <span>Next</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
