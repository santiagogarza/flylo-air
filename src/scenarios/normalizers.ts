import { normalizeBookingReference, normalizeEmail } from '@/lib/support';
import type { FieldNormalizer } from './types';

/**
 * Pulls an LAF loan number out of messy speech or typing.
 * "laf 20417", "LAF20417", and "L.A.F. 20417" all become "LAF-20417".
 * Anything that is not LAF plus exactly five digits is returned trimmed, so the form can show it with a format hint.
 */
export function normalizeLoanNumber(value: string): string {
  const softened = value.replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-');
  const compact = softened.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const match = /LAF(\d{5})(?!\d)/.exec(compact);
  if (match) return `LAF-${match[1]}`;
  return value.trim().replace(/\s+/g, ' ');
}

const SPOKEN_DIGITS: Record<string, string> = {
  zero: '0',
  oh: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
};

/**
 * Pulls a PUBLIC confirmation number out of messy speech or typing.
 * "pub 482913", "PUB482913", and "P U B four eight two nine one three" all become "PUB-482913".
 * Anything that is not PUB plus exactly six digits is returned trimmed and uppercased, so the form can show a format hint.
 */
export function normalizeConfirmation(value: string): string {
  const softened = value.replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-');
  const withDigits = softened.replace(/\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/gi, (word) => SPOKEN_DIGITS[word.toLowerCase()] ?? word);
  const compact = withDigits.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const match = /PUB(\d{6})(?!\d)/.exec(compact);
  if (match) return `PUB-${match[1]}`;
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

export function applyNormalizer(normalizer: FieldNormalizer | undefined, value: string): string {
  if (!normalizer) return value.trim();
  if (typeof normalizer === 'function') return normalizer(value).trim();
  switch (normalizer) {
    case 'trim':
      return value.trim();
    case 'email':
      return normalizeEmail(value);
    case 'booking':
      return normalizeBookingReference(value);
    case 'loan':
      return normalizeLoanNumber(value);
    case 'confirmation':
      return normalizeConfirmation(value);
    default:
      return value.trim();
  }
}
