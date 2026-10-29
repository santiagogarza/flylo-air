export const ISSUE_CATEGORIES = ['Checkout / payment', 'Refund', 'Change flight', 'Baggage', 'Other'] as const;

export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

export type TicketFields = {
  fullName: string;
  bookingReference: string;
  email: string;
  category: string;
  description: string;
};

export type TicketFieldName = keyof TicketFields;

export const TICKET_FIELDS: { name: TicketFieldName; label: string }[] = [
  { name: 'fullName', label: 'Full name' },
  { name: 'bookingReference', label: 'Booking reference' },
  { name: 'email', label: 'Email' },
  { name: 'category', label: 'Issue category' },
  { name: 'description', label: 'Description' },
];

export const EMPTY_TICKET: TicketFields = {
  fullName: '',
  bookingReference: '',
  email: '',
  category: '',
  description: '',
};

export const LIMITS = {
  fullName: 120,
  email: 254,
  description: 2000,
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeBookingReference(value: string): string {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const match = /^FLY(\d{5})$/.exec(compact);
  return match ? `FLY-${match[1]}` : value.trim().toUpperCase();
}

export function normalizeEmail(value: string): string {
  return value.trim().replace(/\s+/g, '').toLowerCase();
}

export function matchCategory(value: string): IssueCategory | undefined {
  const key = simplify(value);
  if (!key) return undefined;
  const exact = ISSUE_CATEGORIES.find((category) => simplify(category) === key);
  if (exact) return exact;
  if (key.includes('checkout') || key.includes('payment')) return 'Checkout / payment';
  if (key.includes('refund')) return 'Refund';
  if (key.includes('change')) return 'Change flight';
  if (key.includes('bag')) return 'Baggage';
  return ISSUE_CATEGORIES.find((category) => simplify(category).startsWith(key));
}

export type TicketErrors = Partial<Record<TicketFieldName, string>>;

export function validateTicket(fields: TicketFields): TicketErrors {
  const errors: TicketErrors = {};
  const fullName = fields.fullName.trim();
  if (!fullName) errors.fullName = 'Enter your full name.';
  else if (fullName.length > LIMITS.fullName) errors.fullName = 'Use 120 characters or fewer.';

  if (!/^FLY-\d{5}$/.test(normalizeBookingReference(fields.bookingReference))) {
    errors.bookingReference = 'Enter a booking reference like FLY-48213.';
  }

  const email = normalizeEmail(fields.email);
  if (!EMAIL_PATTERN.test(email) || email.length > LIMITS.email) errors.email = 'Enter an email like name@example.com.';

  if (!ISSUE_CATEGORIES.includes(fields.category as IssueCategory)) errors.category = 'Choose an issue category.';

  const description = fields.description.trim();
  if (description.length < 10) errors.description = 'Describe the problem in a sentence or two.';
  else if (description.length > LIMITS.description) errors.description = 'Use 2,000 characters or fewer.';

  return errors;
}

export function cleanTicket(fields: TicketFields): TicketFields {
  return {
    fullName: fields.fullName.trim(),
    bookingReference: normalizeBookingReference(fields.bookingReference),
    email: normalizeEmail(fields.email),
    category: fields.category,
    description: fields.description.trim(),
  };
}

function simplify(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}
