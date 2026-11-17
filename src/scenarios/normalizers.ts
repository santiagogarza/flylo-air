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
    default:
      return value.trim();
  }
}
