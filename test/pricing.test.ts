import { describe, expect, it } from 'vitest';
import { searchFlights, type Fare } from '@/lib/flights';
import { buildLineItems, formatCents, perTravelerCents, quoteCents, sumLineItems, toCents } from '@/lib/pricing';

const fare: Fare = { key: 'main', name: 'Main', base: 241.99, taxes: 23.75, perks: [] };

describe('toCents', () => {
  it('converts numbers and decimal strings to whole cents', () => {
    expect(toCents(189)).toBe(18900);
    expect(toCents('189.00')).toBe(18900);
    expect(toCents(19.77)).toBe(1977);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });
});

describe('formatCents', () => {
  it('formats US dollars', () => {
    expect(formatCents(26574)).toBe('$265.74');
    expect(formatCents(123456)).toBe('$1,234.56');
  });
});

describe('quotes', () => {
  it('prices one traveler as base plus taxes', () => {
    expect(perTravelerCents(fare)).toBe(26574);
    expect(quoteCents(fare, 1)).toBe(26574);
  });
});

describe('line items', () => {
  it('builds a receipt line for a traveler', () => {
    const items = buildLineItems(fare, [{ firstName: 'Maya', lastName: 'Chen' }]);
    expect(items).toEqual([{ label: 'Maya Chen · Main', amount: '265.74' }]);
  });

  it('falls back to a numbered label when the name is blank', () => {
    const [item] = buildLineItems(fare, [{ firstName: '', lastName: '' }]);
    expect(item.label).toBe('Traveler 1 · Main');
  });

  it('charges the quoted total for a single traveler', () => {
    const items = buildLineItems(fare, [{ firstName: 'Maya', lastName: 'Chen' }]);
    expect(sumLineItems(items)).toBe(quoteCents(fare, 1));
  });

  it('matches the quote for every generated fare', () => {
    for (const flight of searchFlights('SFO', 'JFK', '2026-11-12')) {
      for (const item of flight.fares) {
        const items = buildLineItems(item, [{ firstName: 'Maya', lastName: 'Chen' }]);
        expect(sumLineItems(items)).toBe(quoteCents(item, 1));
      }
    }
  });
});
