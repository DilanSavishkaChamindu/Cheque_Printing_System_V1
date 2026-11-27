export const MM_PER_INCH = 25.4;
export const PDF_POINTS_PER_INCH = 72;

export function mmToInches(mm: number): number {
  return Number((mm / MM_PER_INCH).toFixed(4));
}

export function inchesToMm(inches: number): number {
  return Number((inches * MM_PER_INCH).toFixed(2));
}

export function mmToPdfPoints(mm: number): number {
  return (mm / MM_PER_INCH) * PDF_POINTS_PER_INCH;
}

export function splitAmountWordsTwoLines(words: string, maxFirstLineChars = 54): {
  line1: string;
  line2: string;
} {
  const trimmed = words.trim();
  if (trimmed.length <= maxFirstLineChars) {
    return { line1: trimmed, line2: '' };
  }

  const breakIndex = trimmed.lastIndexOf(' ', maxFirstLineChars);
  if (breakIndex <= 0) {
    return {
      line1: trimmed.slice(0, maxFirstLineChars),
      line2: trimmed.slice(maxFirstLineChars).trim(),
    };
  }

  return {
    line1: trimmed.slice(0, breakIndex).trim(),
    line2: trimmed.slice(breakIndex + 1).trim(),
  };
}
