import { findAirport } from './airports';
import { searchFlights } from './flights';
import { perTravelerCents } from './pricing';

export const POPULAR_ROUTES = [
  ['SFO', 'JFK'],
  ['SEA', 'LAX'],
  ['BOS', 'MIA'],
  ['DEN', 'HNL'],
] as const;

export type Deal = {
  from: string;
  to: string;
  fromCity: string;
  toCity: string;
  cheapestCents: number;
};

let cached: { date: string; deals: Deal[] } | undefined;

// Flights are deterministic per (route, date) and every home render uses the same travel date,
// so the deals only need computing once per date instead of on every request.
export function popularDeals(date: string): Deal[] {
  if (cached?.date === date) return cached.deals;
  const deals = POPULAR_ROUTES.map(([from, to]) => ({
    from,
    to,
    fromCity: findAirport(from)?.city ?? from,
    toCity: findAirport(to)?.city ?? to,
    cheapestCents: Math.min(...searchFlights(from, to, date).map((flight) => perTravelerCents(flight.fares[0]))),
  }));
  cached = { date, deals };
  return deals;
}
