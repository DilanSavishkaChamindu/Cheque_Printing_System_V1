import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-6 py-10 text-center">
      {icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-500 shadow-2xs ring-1 ring-slate-200">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-600">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
