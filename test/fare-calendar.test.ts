import { describe, expect, it } from 'vitest';
import {
  calendarMonths,
  cheapestDays,
  clampMonth,
  compareToSelected,
  dateRange,
  dayAriaLabel,
  dayLabel,
  fareStats,
  formatDollars,
  heatLevel,
  lowestFareForDay,
  lowestFaresByDay,
  monthDates,
  monthWeeks,
  savingsCents,
  shiftDateByMonths,
  shiftMonth,
  type DayFare,
} from '@/lib/fare-calendar';
import { searchFlights } from '@/lib/flights';
import { perTravelerCents } from '@/lib/pricing';

function fare(date: string, cents: number): DayFare {
  return { date, cents, flight: searchFlights('SFO', 'JFK', date)[0] };
}

describe('lowestFareForDay', () => {
  it('picks the cheapest Basic fare per traveler for the day', () => {
    const flights = searchFlights('SFO', 'JFK', '2026-11-12');
    const expected = Math.min(...flights.map((flight) => perTravelerCents(flight.fares[0])));
    const result = lowestFareForDay('SFO', 'JFK', '2026-11-12');
    expect(result?.cents).toBe(expected);
    expect(result?.date).toBe('2026-11-12');
    expect(perTravelerCents(result!.flight.fares[0])).toBe(expected);
  });

  it('returns null when there are no flights', () => {
    expect(lowestFareForDay('SFO', 'SFO', '2026-11-12')).toBeNull();
    expect(lowestFareForDay('SFO', 'JFK', '2026-02-30')).toBeNull();
  });

  it('builds one fare per day and skips days without flights', () => {
    const fares = lowestFaresByDay('SEA', 'LAX', ['2026-12-01', '2026-02-30', '2026-12-02']);
    expect(fares.map((item) => item.date)).toEqual(['2026-12-01', '2026-12-02']);
  });
});

describe('dates and months', () => {
  it('lists consecutive days across month ends', () => {
    expect(dateRange('2026-12-30', 4)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
    expect(dateRange('nope', 3)).toEqual([]);
    expect(dateRange('2026-12-30', 0)).toEqual([]);
  });

  it('shifts months across years', () => {
    expect(shiftMonth('2026-11', 3)).toBe('2027-02');
    expect(shiftMonth('2027-01', -1)).toBe('2026-12');
  });

  it('keeps the day of the month when paging months, clamped to the month length', () => {
    expect(shiftDateByMonths('2026-10-29', 1)).toBe('2026-11-29');
    expect(shiftDateByMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(shiftDateByMonths('2026-12-15', -1)).toBe('2026-11-15');
  });

  it('lays a month out in Sunday-first weeks', () => {
    expect(monthDates('2027-02')).toHaveLength(28);
    const weeks = monthWeeks('2026-10');
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    // Oct 1 2026 is a Thursday
    expect(weeks[0].slice(0, 5)).toEqual([null, null, null, null, '2026-10-01']);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
  });

  it('shows this month through three months ahead, stretched to reach the selected date', () => {
    expect(calendarMonths('2026-10-29', '2026-11-12')).toEqual({ first: '2026-10', last: '2027-01' });
    expect(calendarMonths('2026-10-29', '2027-05-01')).toEqual({ first: '2026-10', last: '2027-05' });
    const range = { first: '2026-10', last: '2027-01' };
    expect(clampMonth('2026-08', range)).toBe('2026-10');
    expect(clampMonth('2027-03', range)).toBe('2027-01');
    expect(clampMonth('2026-12', range)).toBe('2026-12');
  });
});

describe('cheapest days and deltas', () => {
  const fares = [fare('2026-11-01', 21_500), fare('2026-11-02', 18_900), fare('2026-11-03', 18_900), fare('2026-11-04', 30_000)];

  it('sorts by price, then by date, and takes the top N', () => {
    expect(cheapestDays(fares, 3).map((item) => item.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-01']);
    expect(cheapestDays(fares, 10)).toHaveLength(4);
    expect(cheapestDays(fares, -1)).toEqual([]);
    expect(fares[0].date).toBe('2026-11-01');
  });

  it('computes min, max and a rounded average', () => {
    expect(fareStats(fares)).toEqual({ minCents: 18_900, maxCents: 30_000, averageCents: 22_325 });
    expect(fareStats([])).toBeNull();
  });

  it('maps prices onto a 0-1 heat scale', () => {
    const stats = fareStats(fares);
    expect(heatLevel(18_900, stats)).toBe(0);
    expect(heatLevel(30_000, stats)).toBe(1);
    expect(heatLevel(24_450, stats)).toBeCloseTo(0.5, 5);
    expect(heatLevel(99_999, stats)).toBe(1);
    expect(heatLevel(100, { minCents: 100, maxCents: 100, averageCents: 100 })).toBe(0);
    expect(heatLevel(100, null)).toBe(0);
  });

  it('describes savings against the selected date', () => {
    const selected = fares[0];
    expect(savingsCents(fares[1], selected.cents)).toBe(2_600);
    expect(compareToSelected(fares[1], selected)).toEqual({ kind: 'save', label: 'Save $26 vs your date' });
    expect(compareToSelected(fares[3], selected)).toEqual({ kind: 'more', label: '$85 more than your date' });
    expect(compareToSelected(selected, selected)).toEqual({ kind: 'selected', label: 'Your date' });
    expect(compareToSelected(fare('2026-11-09', 21_530), selected)).toEqual({ kind: 'same', label: 'Same as your date' });
    expect(compareToSelected(fares[1], null)).toBeNull();
  });
});

describe('labels', () => {
  it('formats whole dollars', () => {
    expect(formatDollars(18_943)).toBe('$189');
    expect(formatDollars(18_950)).toBe('$190');
    expect(formatDollars(123_400)).toBe('$1,234');
  });

  it('writes screen reader labels for calendar days', () => {
    expect(dayLabel('2026-11-12')).toBe('Thu Nov 12');
    expect(dayAriaLabel('2026-11-12', fare('2026-11-12', 18_900))).toBe('Thu Nov 12, from $189');
    expect(dayAriaLabel('2026-11-12', fare('2026-11-12', 18_900), { rank: 2 })).toBe(
      'Thu Nov 12, from $189, one of the 3 cheapest days this month',
    );
    expect(dayAriaLabel('2026-10-26', null, { past: true })).toBe('Mon Oct 26, past date');
    expect(dayAriaLabel('2026-10-29', fare('2026-10-29', 20_000), { today: true })).toBe('Thu Oct 29, from $200, today');
  });
});
