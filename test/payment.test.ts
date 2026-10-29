import { describe, expect, it } from 'vitest';
import { DEMO_CARD, formatCardNumber, formatExpiry, passesLuhn, validateCard } from '@/lib/payment';

const now = new Date('2026-10-29T12:00:00Z');

describe('card validation', () => {
  it('accepts the demo card', () => {
    expect(validateCard(DEMO_CARD, now)).toEqual({});
  });

  it('checks the Luhn digit', () => {
    expect(passesLuhn('4242 4242 4242 4242')).toBe(true);
    expect(passesLuhn('4242 4242 4242 4241')).toBe(false);
    expect(passesLuhn('4242')).toBe(false);
  });

  it('rejects expired cards and bad security codes', () => {
    const errors = validateCard({ ...DEMO_CARD, expiry: '09/26', cvc: '12' }, now);
    expect(errors.expiry).toBe('This card has expired.');
    expect(errors.cvc).toBeDefined();
    expect(validateCard({ ...DEMO_CARD, expiry: '13/30' }, now).expiry).toBe('Enter the expiry as MM/YY.');
  });

  it('formats card input', () => {
    expect(formatCardNumber('4242424242424242')).toBe('4242 4242 4242 4242');
    expect(formatExpiry('1230')).toBe('12/30');
  });
});
