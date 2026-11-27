import { SUPPORTED_CURRENCIES, type PaymentType } from '@cheque-saas/shared';

const MONTHS_SHORT = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];

export function formatChequeDateString(isoDate: string, format: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return isoDate;
  }
  const [yyyy = '', mm = '', dd = ''] = isoDate.split('-');
  if (format === 'DDMMYYYY') {
    return `${dd}${mm}${yyyy}`;
  }
  if (format === 'DD MMM YYYY') {
    const monthIndex = Math.max(0, Number.parseInt(mm, 10) - 1);
    return `${dd} ${MONTHS_SHORT[monthIndex] ?? mm} ${yyyy}`;
  }
  return `${dd}/${mm}/${yyyy}`;
}

export interface ChequePreviewProps {
  bankName: string;
  accountName?: string;
  accountNumberMasked?: string;
  chequeNumber: string;
  chequeDate: string;
  dateFormat: string;
  payeeName: string;
  amount: string;
  currency: string;
  amountInWords: string;
  paymentType: PaymentType;
  cashRecipient?: string | null;
  businessStatus?: string;
  specialLeftMarking?: string;
}

export function ChequePreviewCard({
  bankName,
  accountName,
  accountNumberMasked,
  chequeNumber,
  chequeDate,
  dateFormat,
  payeeName,
  amount,
  currency,
  amountInWords,
  paymentType,
  cashRecipient,
  businessStatus,
  specialLeftMarking,
}: ChequePreviewProps) {
  const formattedDate = formatChequeDateString(chequeDate, dateFormat);
  const currencyMeta = SUPPORTED_CURRENCIES[currency];
  const numericFormatted = Number.isFinite(Number(amount))
    ? Number(amount).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '0.00';

  return (
    <div className="relative overflow-hidden rounded-xl border-2 border-slate-300 bg-gradient-to-br from-emerald-50/60 via-white to-sky-50/70 p-5 shadow-sm print-only-surface">
      {businessStatus === 'CANCELLED' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-12 rounded-lg border-4 border-rose-500/60 px-6 py-2 text-3xl font-black tracking-widest text-rose-600/40">
            CANCELLED
          </span>
        </div>
      )}
      {businessStatus === 'DRAFT' && (
        <div className="pointer-events-none absolute right-6 bottom-12">
          <span className="rounded border border-amber-400 bg-amber-50/90 px-2 py-0.5 text-[10px] font-bold tracking-wider text-amber-800">
            DRAFT PREVIEW
          </span>
        </div>
      )}

      {/* Top Left Crossing / Marking */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {paymentType === 'ACCOUNT_PAYEE' ? (
            <div className="relative flex h-12 w-28 items-center justify-center border-y-2 border-slate-800 -rotate-12 text-[10px] font-bold tracking-wider text-slate-900">
              A/C PAYEE ONLY
            </div>
          ) : (
            <div className="rounded border border-amber-500 bg-amber-50 px-2.5 py-1 text-[10px] font-bold tracking-wider text-amber-900">
              CASH CHEQUE
            </div>
          )}

          <div>
            <p className="text-sm font-bold tracking-tight text-slate-900">{bankName || 'Select Bank'}</p>
            {(accountName || accountNumberMasked) && (
              <p className="text-[11px] text-slate-500">
                {accountName} {accountNumberMasked ? `(${accountNumberMasked})` : ''}
              </p>
            )}
            {specialLeftMarking && (
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                {specialLeftMarking}
              </p>
            )}
          </div>
        </div>

        {/* Date Box */}
        <div className="text-right">
          <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Date ({dateFormat})
          </span>
          {dateFormat === 'DDMMYYYY' ? (
            <div className="mt-1 flex gap-1">
              {formattedDate.split('').map((ch, idx) => (
                <span
                  key={`${idx}-${ch}`}
                  className="inline-flex h-6 w-5 items-center justify-center border border-slate-400 bg-white font-mono text-xs font-semibold text-slate-900"
                >
                  {ch}
                </span>
              ))}
            </div>
          ) : (
            <div className="mt-1 rounded border border-slate-400 bg-white px-3 py-1 font-mono text-xs font-semibold tracking-wider text-slate-900">
              {formattedDate || 'DD/MM/YYYY'}
            </div>
          )}
        </div>
      </div>

      {/* Payee & Amount Section */}
      <div className="mt-6 space-y-4">
        <div className="flex items-baseline gap-3 border-b border-slate-300 pb-1.5">
          <span className="shrink-0 text-xs font-semibold uppercase text-slate-500">Pay</span>
          <span className="flex-1 text-sm font-semibold text-slate-950">
            {payeeName || '—'}
          </span>
          {paymentType === 'CASH' && cashRecipient && (
            <span className="text-[11px] text-slate-600">
              Bearer: <strong>{cashRecipient}</strong>
            </span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3 items-start">
          <div className="sm:col-span-2 border-b border-slate-300 pb-2">
            <span className="block text-[10px] font-semibold uppercase text-slate-500">
              Sum of
            </span>
            <p className="mt-0.5 min-h-10 text-xs font-medium leading-relaxed text-slate-900">
              {amountInWords || 'Enter an amount to generate words...'}
            </p>
          </div>

          <div className="rounded-lg border-2 border-slate-400 bg-white px-3 py-2 text-right">
            <span className="block text-[10px] font-medium uppercase text-slate-500">
              {currency}
            </span>
            <span className="font-mono text-base font-bold tabular-nums text-slate-950">
              {currencyMeta?.symbol ?? currency} {numericFormatted}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom MICR Strip */}
      <div className="mt-6 flex items-center justify-between border-t border-dashed border-slate-300 pt-3 font-mono text-xs text-slate-600">
        <span>⑈ {chequeNumber || '000000'} ⑈</span>
        <span className="text-[11px] text-slate-400">Preview Layout (Calibrated in Templates)</span>
      </div>
    </div>
  );
}
