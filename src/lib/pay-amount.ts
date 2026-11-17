const AMOUNT_MAX_CENTS = 100_000 * 100;

/**
 * Dollars with an optional decimal, and commas only as thousands separators.
 * `$ 1,045.00` and `1 045.00` are the same amount. `412,18` is not `41218`.
 */
const AMOUNT_PATTERN = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/;

function cleanedAmount(raw: string): string {
  return raw.trim().replace(/\$/g, '').replace(/\s+/g, '');
}

/** Whole cents, when `raw` is a positive amount within the portal limit. */
function paymentAmountCents(raw: string): number | undefined {
  const cleaned = cleanedAmount(raw);
  if (!AMOUNT_PATTERN.test(cleaned)) return undefined;
  const [whole, frac = ''] = cleaned.replace(/,/g, '').split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > AMOUNT_MAX_CENTS) return undefined;
  return cents;
}

export function paymentAmountError(raw: string): string | undefined {
  const cleaned = cleanedAmount(raw);
  if (!cleaned) return 'Enter an amount like 412.18.';
  if (!AMOUNT_PATTERN.test(cleaned)) return 'Enter a dollar amount with up to two decimals.';
  const cents = paymentAmountCents(raw);
  if (cents === undefined) {
    const [whole, frac = ''] = cleaned.replace(/,/g, '').split('.');
    const unbounded = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
    if (Number.isFinite(unbounded) && unbounded > AMOUNT_MAX_CENTS) return 'Enter an amount of $100,000 or less.';
    return 'Enter an amount greater than zero.';
  }
  return undefined;
}

export function formatPaymentAmount(raw: string): string {
  const cents = paymentAmountCents(raw);
  if (cents === undefined) return raw.trim();
  const dollars = Math.floor(cents / 100).toLocaleString('en-US');
  const remainder = String(cents % 100).padStart(2, '0');
  return `$${dollars}.${remainder}`;
}
