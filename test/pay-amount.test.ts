import { describe, expect, it } from 'vitest';
import { formatPaymentAmount, paymentAmountError } from '@/lib/pay-amount';

describe('payment portal amount', () => {
  it('records a monthly payment written with a dollar sign and a space', () => {
    expect(paymentAmountError('$ 1,045.00')).toBeUndefined();
    expect(formatPaymentAmount('$ 1,045.00')).toBe('$1,045.00');
  });

  it('treats a space or non-breaking space as a thousands separator', () => {
    expect(paymentAmountError('1 045.00')).toBeUndefined();
    expect(paymentAmountError('1\u00a0045.00')).toBeUndefined();
    expect(formatPaymentAmount('1 045.00')).toBe('$1,045.00');
  });

  it('does not turn a decimal comma into a much larger payment', () => {
    expect(paymentAmountError('412,18')).toBe('Enter a dollar amount with up to two decimals.');
    expect(formatPaymentAmount('412,18')).not.toBe('$41,218.00');
    expect(formatPaymentAmount('$1,045.50')).toBe('$1,045.50');
  });

  it('still accepts the amounts the portal already recorded', () => {
    expect(paymentAmountError('412.18')).toBeUndefined();
    expect(paymentAmountError('$1,045.5')).toBeUndefined();
    expect(paymentAmountError('1,045')).toBeUndefined();
    expect(paymentAmountError('100000')).toBeUndefined();
    expect(formatPaymentAmount('$1,045.5')).toBe('$1,045.50');
    expect(formatPaymentAmount('412.18')).toBe('$412.18');
  });

  it('still rejects empty, zero, extra decimals, and amounts over $100,000', () => {
    expect(paymentAmountError('')).toBe('Enter an amount like 412.18.');
    expect(paymentAmountError('   ')).toBe('Enter an amount like 412.18.');
    expect(paymentAmountError('abc')).toBe('Enter a dollar amount with up to two decimals.');
    expect(paymentAmountError('12.345')).toBe('Enter a dollar amount with up to two decimals.');
    expect(paymentAmountError('0')).toBe('Enter an amount greater than zero.');
    expect(paymentAmountError('-5')).toBe('Enter a dollar amount with up to two decimals.');
    expect(paymentAmountError('100000.01')).toBe('Enter an amount of $100,000 or less.');
  });
});
