import { describe, expect, it } from 'vitest';
import { popularDeals, POPULAR_ROUTES } from '@/lib/deals';
import { searchFlights } from '@/lib/flights';
import { perTravelerCents } from '@/lib/pricing';

describe('popularDeals', () => {
  it('shows the cheapest per-traveler fare for each popular route', () => {
    const deals = popularDeals('2026-11-12');
    expect(deals.map((deal) => [deal.from, deal.to])).toEqual(POPULAR_ROUTES.map(([from, to]) => [from, to]));
    for (const deal of deals) {
      const cheapest = Math.min(...searchFlights(deal.from, deal.to, '2026-11-12').map((flight) => perTravelerCents(flight.fares[0])));
      expect(deal.cheapestCents).toBe(cheapest);
    }
    expect(deals[0]).toMatchObject({ fromCity: 'San Francisco', toCity: 'New York' });
  });

  it('reuses the deals for the same date and recomputes for a new one', () => {
    const first = popularDeals('2026-11-12');
    expect(popularDeals('2026-11-12')).toBe(first);
    const next = popularDeals('2026-11-13');
    expect(next).not.toBe(first);
    expect(next[0].cheapestCents).toBe(Math.min(...searchFlights('SFO', 'JFK', '2026-11-13').map((flight) => perTravelerCents(flight.fares[0]))));
  });
});
