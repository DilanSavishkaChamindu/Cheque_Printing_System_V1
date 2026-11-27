import {
  splitAmountWordsTwoLines,
  type PaymentType,
} from '@cheque-saas/shared';
import type {
  CalibrationProfileDto,
  TemplateFieldDto,
} from '../services/templateService';
import { formatChequeDateString } from './ChequePreviewCard';

export interface CalibratedRendererProps {
  paperWidthMm: number;
  paperHeightMm: number;
  dateFormat: string;
  centerOnA4: boolean;
  feedDirection: 'TOP_FIRST' | 'BOTTOM_FIRST' | 'LEFT_FIRST' | 'RIGHT_FIRST';
  fields: TemplateFieldDto[];
  calibration?: CalibrationProfileDto;
  sampleData: {
    chequeDate: string;
    payeeName: string;
    amount: string;
    currency: string;
    amountInWords: string;
    paymentType: PaymentType;
    cashRecipient?: string;
    leftEdgeText?: string;
  };
  selectedFieldKey?: string | null;
  onSelectField?: (fieldKey: string) => void;
  showGuides?: boolean;
}

export function CalibratedChequeRenderer({
  paperWidthMm,
  paperHeightMm,
  dateFormat,
  centerOnA4,
  feedDirection,
  fields,
  calibration,
  sampleData,
  selectedFieldKey,
  onSelectField,
  showGuides = true,
}: CalibratedRendererProps) {
  const offsetX = (calibration?.offsetXMm ?? 0) + (calibration?.printerMarginLeftMm ?? 0);
  const offsetY = (calibration?.offsetYMm ?? 0) + (calibration?.printerMarginTopMm ?? 0);
  const scale = (calibration?.scalePercent ?? 100) / 100;

  const formattedDate = formatChequeDateString(sampleData.chequeDate, dateFormat);
  const wordLines = splitAmountWordsTwoLines(sampleData.amountInWords, 52);
  const formattedAmount = Number.isFinite(Number(sampleData.amount))
    ? Number(sampleData.amount).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '0.00';

  const getFieldContent = (fieldKey: string): string => {
    switch (fieldKey) {
      case 'CHEQUE_DATE':
        return formattedDate;
      case 'PAYEE_NAME':
        return sampleData.payeeName;
      case 'AMOUNT_NUMBER':
        return `${sampleData.currency} ${formattedAmount}`;
      case 'AMOUNT_WORDS_LINE_1':
        return wordLines.line1;
      case 'AMOUNT_WORDS_LINE_2':
        return wordLines.line2;
      case 'PAYMENT_TYPE_MARK':
        return sampleData.paymentType === 'ACCOUNT_PAYEE' ? 'A/C PAYEE ONLY' : 'CASH';
      case 'CASH_RECIPIENT':
        return sampleData.paymentType === 'CASH' && sampleData.cashRecipient
          ? `Bearer: ${sampleData.cashRecipient}`
          : '';
      case 'LEFT_EDGE_MARKING':
        return sampleData.leftEdgeText ?? 'NOT NEGOTIABLE';
      default:
        return '';
    }
  };

  const rotationDeg =
    feedDirection === 'BOTTOM_FIRST'
      ? 180
      : feedDirection === 'LEFT_FIRST'
        ? 90
        : feedDirection === 'RIGHT_FIRST'
          ? 270
          : 0;

  return (
    <div className="overflow-auto rounded-xl border border-slate-200 bg-slate-100 p-4 print:border-0 print:bg-white print:p-0">
      <div
        className={`relative bg-white shadow-sm print:shadow-none ${
          centerOnA4 ? 'mx-auto print:mx-auto' : ''
        }`}
        style={{
          width: `${paperWidthMm}mm`,
          height: `${paperHeightMm}mm`,
          transform: `translate(${offsetX}mm, ${offsetY}mm) scale(${scale}) rotate(${rotationDeg}deg)`,
          transformOrigin: 'top left',
          backgroundImage: showGuides
            ? 'linear-gradient(to right, rgba(148,163,184,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.18) 1px, transparent 1px)'
            : undefined,
          backgroundSize: showGuides ? '5mm 5mm' : undefined,
        }}
      >
        {showGuides && (
          <div className="pointer-events-none absolute inset-0 border border-dashed border-emerald-400/70 print:hidden" />
        )}

        {fields.map((field) => {
          if (!field.isVisible) {
            return null;
          }
          const isSelected = selectedFieldKey === field.fieldKey;
          const content = getFieldContent(field.fieldKey);

          return (
            <div
              key={field.fieldKey}
              role={onSelectField ? 'button' : undefined}
              tabIndex={onSelectField ? 0 : undefined}
              onClick={() => onSelectField?.(field.fieldKey)}
              onKeyDown={(e) => {
                if (onSelectField && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onSelectField(field.fieldKey);
                }
              }}
              style={{
                position: 'absolute',
                left: `${field.xMm}mm`,
                top: `${field.yMm}mm`,
                width: `${field.widthMm}mm`,
                height: `${field.heightMm}mm`,
                fontFamily: field.fontFamily,
                fontSize: `${field.fontSizePt}pt`,
                fontWeight: field.fontWeight,
                letterSpacing: `${field.letterSpacingMm}mm`,
                lineHeight: field.lineHeight,
                textAlign: field.textAlign.toLowerCase() as 'left' | 'center' | 'right',
              }}
              className={`overflow-hidden text-black transition-colors ${
                showGuides
                  ? isSelected
                    ? 'border-2 border-emerald-600 bg-emerald-50/40 print:border-0 print:bg-transparent'
                    : 'border border-dashed border-sky-400/70 bg-sky-50/20 hover:border-sky-600 print:border-0 print:bg-transparent'
                  : ''
              }`}
            >
              {field.fieldKey === 'CHEQUE_DATE' &&
              dateFormat === 'DDMMYYYY' &&
              field.dateDigitGapMm ? (
                <div className="flex items-center">
                  {content.split('').map((digit, idx) => (
                    <span
                      key={`${idx}-${digit}`}
                      style={{
                        display: 'inline-block',
                        width: `${field.dateDigitGapMm}mm`,
                      }}
                    >
                      {digit}
                    </span>
                  ))}
                </div>
              ) : (
                <span>{content}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
