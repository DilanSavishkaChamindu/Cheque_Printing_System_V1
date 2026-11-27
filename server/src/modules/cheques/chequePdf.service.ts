import PDFDocument from 'pdfkit';
import {
  mmToPdfPoints,
  splitAmountWordsTwoLines,
  type AuthenticatedTenantUser,
} from '@cheque-saas/shared';
import { getPrisma } from '../../config/prisma.js';
import { ForbiddenError, NotFoundError } from '../../core/errors.js';
import { DEFAULT_TEMPLATE_FIELDS } from '../templates/template.service.js';

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

function formatDate(isoDate: string, format: string): string {
  const [yyyy = '', mm = '', dd = ''] = isoDate.split('-');
  if (format === 'DDMMYYYY') {
    return `${dd}${mm}${yyyy}`;
  }
  if (format === 'DD MMM YYYY') {
    const idx = Math.max(0, Number.parseInt(mm, 10) - 1);
    return `${dd} ${MONTHS_SHORT[idx] ?? mm} ${yyyy}`;
  }
  return `${dd}/${mm}/${yyyy}`;
}

export async function generateChequePdfBuffer(
  actor: AuthenticatedTenantUser,
  chequeId: string
): Promise<{ buffer: Buffer; filename: string }> {
  const prisma = getPrisma();
  const cheque = await prisma.issuedCheque.findFirst({
    where: { id: chequeId, tenantId: actor.tenantId },
    include: {
      template: {
        include: {
          fields: true,
          calibrationProfiles: { where: { isDefault: true }, take: 1 },
        },
      },
    },
  });

  if (!cheque) {
    throw new NotFoundError('Issued Cheque');
  }

  if (
    actor.companyAccessScope === 'SELECTED_COMPANIES' &&
    !actor.allowedCompanyIds.includes(cheque.companyId)
  ) {
    throw new ForbiddenError('You do not have access to export this cheque.');
  }

  const tpl = cheque.template;
  const calibration = tpl?.calibrationProfiles[0];

  const paperWidthMm = tpl ? Number(tpl.paperWidthMm.toString()) : 178;
  const paperHeightMm = tpl ? Number(tpl.paperHeightMm.toString()) : 89;
  const centerOnA4 = tpl?.centerOnA4 ?? false;

  const pageWidthPt = centerOnA4 ? mmToPdfPoints(210) : mmToPdfPoints(paperWidthMm);
  const pageHeightPt = centerOnA4 ? mmToPdfPoints(297) : mmToPdfPoints(paperHeightMm);

  const originXMm = centerOnA4 ? (210 - paperWidthMm) / 2 : 0;
  const originYMm = centerOnA4 ? (297 - paperHeightMm) / 2 : 0;

  const offsetXMm =
    originXMm +
    (calibration ? Number(calibration.offsetXMm.toString()) : 0) +
    (calibration ? Number(calibration.printerMarginLeftMm.toString()) : 0);
  const offsetYMm =
    originYMm +
    (calibration ? Number(calibration.offsetYMm.toString()) : 0) +
    (calibration ? Number(calibration.printerMarginTopMm.toString()) : 0);
  const scaleFactor = calibration
    ? Number(calibration.scalePercent.toString()) / 100
    : 1;

  const fields = tpl?.fields.length
    ? tpl.fields.map((f) => ({
        fieldKey: f.fieldKey,
        xMm: Number(f.xMm.toString()),
        yMm: Number(f.yMm.toString()),
        widthMm: Number(f.widthMm.toString()),
        heightMm: Number(f.heightMm.toString()),
        fontSizePt: Number(f.fontSizePt.toString()),
        fontWeight: f.fontWeight,
        textAlign: f.textAlign,
        dateDigitGapMm:
          f.dateDigitGapMm !== null ? Number(f.dateDigitGapMm.toString()) : null,
        isVisible: f.isVisible,
      }))
    : DEFAULT_TEMPLATE_FIELDS;

  const isoDate = cheque.chequeDate.toISOString().slice(0, 10);
  const formattedDate = formatDate(isoDate, tpl?.dateFormat ?? cheque.dateFormat);
  const wordLines = splitAmountWordsTwoLines(cheque.amountInWords, 52);
  const formattedAmount = Number(cheque.amount.toString()).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const doc = new PDFDocument({
    size: [pageWidthPt, pageHeightPt],
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  for (const field of fields) {
    if (!field.isVisible) {
      continue;
    }

    const xPt = mmToPdfPoints(offsetXMm + field.xMm * scaleFactor);
    const yPt = mmToPdfPoints(offsetYMm + field.yMm * scaleFactor);
    const widthPt = mmToPdfPoints(field.widthMm * scaleFactor);

    doc.font(field.fontWeight === 'bold' ? 'Helvetica-Bold' : 'Helvetica');
    doc.fontSize(field.fontSizePt * scaleFactor);
    doc.fillColor('#000000');

    const align =
      field.textAlign === 'RIGHT'
        ? 'right'
        : field.textAlign === 'CENTER'
          ? 'center'
          : 'left';

    if (field.fieldKey === 'CHEQUE_DATE') {
      if ((tpl?.dateFormat ?? cheque.dateFormat) === 'DDMMYYYY' && field.dateDigitGapMm) {
        const gapPt = mmToPdfPoints(field.dateDigitGapMm * scaleFactor);
        formattedDate.split('').forEach((char, idx) => {
          doc.text(char, xPt + idx * gapPt, yPt, { lineBreak: false });
        });
      } else {
        doc.text(formattedDate, xPt, yPt, { width: widthPt, align });
      }
    } else if (field.fieldKey === 'PAYEE_NAME') {
      doc.text(cheque.payeeName, xPt, yPt, { width: widthPt, align });
    } else if (field.fieldKey === 'AMOUNT_NUMBER') {
      doc.text(`${cheque.currency} ${formattedAmount}`, xPt, yPt, {
        width: widthPt,
        align,
      });
    } else if (field.fieldKey === 'AMOUNT_WORDS_LINE_1') {
      doc.text(wordLines.line1, xPt, yPt, { width: widthPt, align });
    } else if (field.fieldKey === 'AMOUNT_WORDS_LINE_2' && wordLines.line2) {
      doc.text(wordLines.line2, xPt, yPt, { width: widthPt, align });
    } else if (field.fieldKey === 'PAYMENT_TYPE_MARK') {
      const text =
        cheque.paymentType === 'ACCOUNT_PAYEE' ? 'A/C PAYEE ONLY' : 'CASH';
      doc.text(text, xPt, yPt, { width: widthPt, align });
    } else if (field.fieldKey === 'CASH_RECIPIENT' && cheque.paymentType === 'CASH' && cheque.cashRecipient) {
      doc.text(`Bearer: ${cheque.cashRecipient}`, xPt, yPt, { width: widthPt, align });
    }
  }

  doc.end();
  const buffer = await finished;

  await prisma.chequePrintJob.create({
    data: {
      tenantId: actor.tenantId,
      issuedChequeId: cheque.id,
      templateId: tpl?.id ?? null,
      calibrationProfileId: calibration?.id ?? null,
      jobType: 'PDF_EXPORT',
      status: 'SUCCESS',
      printedBy: actor.id,
      deviceId: actor.deviceId,
    },
  });

  return {
    buffer,
    filename: `cheque-${cheque.chequeNumber}.pdf`,
  };
}
