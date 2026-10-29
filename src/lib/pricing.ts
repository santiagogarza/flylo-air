import type { Fare } from './flights';

export type Traveler = {
  firstName: string;
  lastName: string;
};

export type LineItem = {
  label: string;
  amount: string;
};

export function toCents(amount: number | string): number {
  return Math.round(Number(amount) * 100);
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function perTravelerCents(fare: Fare): number {
  return toCents(fare.base) + toCents(fare.taxes);
}

export function quoteCents(fare: Fare, travelers: number): number {
  return perTravelerCents(fare) * travelers;
}

export function buildLineItems(fare: Fare, travelers: Traveler[]): LineItem[] {
  return travelers.map((traveler, index) => ({
    label: `${travelerName(traveler, index)} · ${fare.name}`,
    amount: (fare.base + fare.taxes).toFixed(2),
  }));
}

export function sumLineItems(items: LineItem[]): number {
  return toCents(items.map((item) => item.amount).reduce((total, amount) => total + amount));
}

function travelerName(traveler: Traveler, index: number): string {
  const name = `${traveler.firstName} ${traveler.lastName}`.trim();
  return name || `Traveler ${index + 1}`;
}
