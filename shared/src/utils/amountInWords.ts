import { DEFAULT_CURRENCY_CODE, SUPPORTED_CURRENCIES } from '../constants/currencies.js';

export type SupportedWordsLocale = 'en' | 'si';

export interface AmountInWordsOptions {
  currencyCode?: string;
  locale?: SupportedWordsLocale;
  includeOnlySuffix?: boolean;
}

const EN_ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const EN_TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];

const EN_SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];

function convertThreeDigitsEnglish(num: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(num / 100);
  const remainder = num % 100;

  if (hundreds > 0) {
    parts.push(`${EN_ONES[hundreds]} Hundred`);
  }

  if (remainder > 0) {
    if (remainder < 20) {
      parts.push(EN_ONES[remainder]!);
    } else {
      const tens = Math.floor(remainder / 10);
      const ones = remainder % 10;
      parts.push(ones > 0 ? `${EN_TENS[tens]}-${EN_ONES[ones]}` : EN_TENS[tens]!);
    }
  }

  return parts.join(' ');
}

function integerStringToEnglish(intStr: string): string {
  const cleaned = intStr.replace(/^0+/, '') || '0';
  if (cleaned === '0') {
    return 'Zero';
  }

  const groups: number[] = [];
  for (let i = cleaned.length; i > 0; i -= 3) {
    const start = Math.max(0, i - 3);
    groups.push(Number.parseInt(cleaned.slice(start, i), 10));
  }

  if (groups.length > EN_SCALES.length) {
    throw new Error('Amount exceeds maximum supported word conversion range.');
  }

  const words: string[] = [];
  for (let idx = groups.length - 1; idx >= 0; idx -= 1) {
    const value = groups[idx]!;
    if (value === 0) {
      continue;
    }
    const chunkWords = convertThreeDigitsEnglish(value);
    const scale = EN_SCALES[idx];
    words.push(scale ? `${chunkWords} ${scale}` : chunkWords);
  }

  return words.join(' ');
}

export interface AmountLocaleConverter {
  convert(majorStr: string, minorNum: number, currencyCode: string, includeOnlySuffix: boolean): string;
}

const englishConverter: AmountLocaleConverter = {
  convert(majorStr, minorNum, currencyCode, includeOnlySuffix) {
    const currency =
      SUPPORTED_CURRENCIES[currencyCode.toUpperCase()] ??
      SUPPORTED_CURRENCIES[DEFAULT_CURRENCY_CODE]!;

    const majorVal = BigInt(majorStr || '0');
    const majorWords = integerStringToEnglish(majorStr);
    const majorUnit =
      majorVal === 1n ? currency.majorUnitSingular : currency.majorUnitPlural;

    const parts: string[] = [`${majorWords} ${majorUnit}`];

    if (minorNum > 0) {
      const minorWords = integerStringToEnglish(String(minorNum));
      const minorUnit =
        minorNum === 1 ? currency.minorUnitSingular : currency.minorUnitPlural;
      parts.push(`and ${minorWords} ${minorUnit}`);
    }

    const result = parts.join(' ');
    return includeOnlySuffix ? `${result} Only` : result;
  },
};

// Extensible locale registry (Sinhala converter slot reserved for future localization)
const CONVERTER_REGISTRY: Partial<Record<SupportedWordsLocale, AmountLocaleConverter>> = {
  en: englishConverter,
};

export function parseMonetaryString(rawAmount: string | number): {
  normalized: string;
  majorStr: string;
  minorNum: number;
} {
  const str = typeof rawAmount === 'number' ? rawAmount.toFixed(2) : rawAmount.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(str)) {
    throw new Error('Invalid monetary amount format.');
  }

  const [rawMajor = '0', rawMinor = ''] = str.split('.');
  const majorStr = rawMajor.replace(/^0+/, '') || '0';
  const minorPadded = rawMinor.padEnd(2, '0').slice(0, 2);
  const minorNum = Number.parseInt(minorPadded, 10);

  return {
    normalized: `${majorStr}.${minorPadded}`,
    majorStr,
    minorNum,
  };
}

export function convertAmountToWords(
  amount: string | number,
  options: AmountInWordsOptions = {}
): string {
  const locale = options.locale ?? 'en';
  const converter = CONVERTER_REGISTRY[locale];
  if (!converter) {
    throw new Error(`Amount-in-words converter for locale '${locale}' is not yet registered.`);
  }

  const { majorStr, minorNum } = parseMonetaryString(amount);
  const currencyCode = options.currencyCode ?? DEFAULT_CURRENCY_CODE;
  const includeOnlySuffix = options.includeOnlySuffix ?? true;

  return converter.convert(majorStr, minorNum, currencyCode, includeOnlySuffix);
}

export function normalizeWordsForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[-,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function verifyAmountInWordsMatch(
  amount: string | number,
  currencyCode: string,
  suppliedWords: string,
  locale: SupportedWordsLocale = 'en'
): boolean {
  const expectedWithOnly = normalizeWordsForComparison(
    convertAmountToWords(amount, { currencyCode, locale, includeOnlySuffix: true })
  );
  const expectedWithoutOnly = normalizeWordsForComparison(
    convertAmountToWords(amount, { currencyCode, locale, includeOnlySuffix: false })
  );
  const actual = normalizeWordsForComparison(suppliedWords);

  return actual === expectedWithOnly || actual === expectedWithoutOnly;
}
