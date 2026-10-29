import { describe, expect, it } from 'vitest';
import { findFare, findFlight, formatDuration, isIsoDate, searchFlights } from '@/lib/flights';

describe('searchFlights', () => {
  it('returns the same flights for the same search', () => {
    const first = searchFlights('SFO', 'JFK', '2026-11-12');
    const second = searchFlights('sfo', 'jfk', '2026-11-12');
    expect(first.length).toBeGreaterThanOrEqual(4);
    expect(second).toEqual(first);
  });

  it('returns nothing for the same airport, unknown airports or bad dates', () => {
    expect(searchFlights('SFO', 'SFO', '2026-11-12')).toEqual([]);
    expect(searchFlights('XXX', 'JFK', '2026-11-12')).toEqual([]);
    expect(searchFlights('SFO', 'JFK', '2026-02-30')).toEqual([]);
  });

  it('prices every fare in whole cents, cheapest first', () => {
    for (const flight of searchFlights('SEA', 'LAX', '2026-12-01')) {
      expect(flight.fares.map((fare) => fare.key)).toEqual(['basic', 'main', 'flex']);
      for (const fare of flight.fares) {
        expect(Number.isInteger(Math.round(fare.base * 100))).toBe(true);
        expect(fare.base * 100).toBeCloseTo(Math.round(fare.base * 100), 6);
        expect(fare.taxes * 100).toBeCloseTo(Math.round(fare.taxes * 100), 6);
      }
      expect(flight.fares[0].base).toBeLessThan(flight.fares[1].base);
      expect(flight.fares[1].base).toBeLessThan(flight.fares[2].base);
    }
  });
});

describe('findFlight', () => {
  it('finds a flight and fare by id', () => {
    const [flight] = searchFlights('BOS', 'MIA', '2026-11-20');
    expect(findFlight(flight.id)).toEqual(flight);
    expect(findFare(flight, 'flex')?.name).toBe('Flex');
    expect(findFare(flight, 'first')).toBeUndefined();
  });

  it('rejects malformed ids', () => {
    expect(findFlight('nope')).toBeUndefined();
    expect(findFlight(undefined)).toBeUndefined();
  });
});

describe('helpers', () => {
  it('validates ISO dates', () => {
    expect(isIsoDate('2026-10-29')).toBe(true);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('10/29/2026')).toBe(false);
  });

  it('formats durations', () => {
    expect(formatDuration(330)).toBe('5h 30m');
    expect(formatDuration(120)).toBe('2h');
  });
});
