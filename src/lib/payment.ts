export type CardDetails = {
  name: string;
  number: string;
  expiry: string;
  cvc: string;
};

export type CardErrors = Partial<Record<keyof CardDetails, string>>;

export const DEMO_CARD: CardDetails = {
  name: 'Maya Chen',
  number: '4242 4242 4242 4242',
  expiry: '12/30',
  cvc: '123',
};

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export function formatCardNumber(value: string): string {
  return digitsOnly(value)
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, '$1 ');
}

export function formatExpiry(value: string): string {
  const digits = digitsOnly(value).slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

export function passesLuhn(number: string): boolean {
  const digits = digitsOnly(number);
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

export function validateCard(card: CardDetails, now = new Date()): CardErrors {
  const errors: CardErrors = {};
  if (!card.name.trim()) errors.name = 'Enter the name on the card.';
  if (!passesLuhn(card.number)) errors.number = 'Enter a valid card number.';
  const match = /^(\d{2})\/(\d{2})$/.exec(card.expiry.trim());
  const month = match ? Number(match[1]) : 0;
  const year = match ? 2000 + Number(match[2]) : 0;
  if (!match || month < 1 || month > 12) errors.expiry = 'Enter the expiry as MM/YY.';
  else if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
    errors.expiry = 'This card has expired.';
  }
  if (!/^\d{3,4}$/.test(card.cvc.trim())) errors.cvc = 'Enter the 3 or 4 digit security code.';
  return errors;
}
