import { addDays, isoDate } from './dates';
import { formatTripDate, isIsoDate, searchFlights, type Flight } from './flights';
import { perTravelerCents } from './pricing';

export type DayFare = {
  date: string;
  cents: number;
  flight: Flight;
};

export type FareStats = {
  minCents: number;
  maxCents: number;
  averageCents: number;
};

export type DeltaKind = 'selected' | 'save' | 'more' | 'same';

export const TREND_DAYS = 60;
export const MONTHS_AHEAD = 3;

export function lowestFareForDay(from: string, to: string, date: string): DayFare | null {
  let best: DayFare | null = null;
  for (const flight of searchFlights(from, to, date)) {
    const cents = perTravelerCents(flight.fares[0]);
    if (!best || cents < best.cents) best = { date, cents, flight };
  }
  return best;
}

export function lowestFaresByDay(from: string, to: string, dates: string[]): DayFare[] {
  return dates.flatMap((date) => {
    const fare = lowestFareForDay(from, to, date);
    return fare ? [fare] : [];
  });
}

export function shiftDate(date: string, days: number): string {
  return isoDate(addDays(new Date(`${date}T00:00:00Z`), days));
}

export function dateRange(start: string, days: number): string[] {
  if (!isIsoDate(start) || days <= 0) return [];
  return Array.from({ length: days }, (_, index) => shiftDate(start, index));
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthIndex] = month.split('-').map(Number);
  return isoDate(new Date(Date.UTC(year, monthIndex - 1 + delta, 1))).slice(0, 7);
}

export function daysInMonth(month: string): number {
  const [year, monthIndex] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
}

export function monthDates(month: string): string[] {
  return dateRange(`${month}-01`, daysInMonth(month));
}

export function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Weeks of the month, Sunday first, padded with nulls. */
export function monthWeeks(month: string): (string | null)[][] {
  const dates = monthDates(month);
  const cells: (string | null)[] = [...Array<null>(weekday(dates[0])).fill(null), ...dates];
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}

/** Same day of the month, `delta` months away, clamped to that month's length. */
export function shiftDateByMonths(date: string, delta: number): string {
  const month = shiftMonth(monthOf(date), delta);
  const day = Math.min(Number(date.slice(8, 10)), daysInMonth(month));
  return `${month}-${String(day).padStart(2, '0')}`;
}

/** The months the calendar can show: this month through MONTHS_AHEAD ahead, stretched to reach the selected date. */
export function calendarMonths(today: string, selected: string): { first: string; last: string } {
  const first = monthOf(today);
  const ahead = shiftMonth(first, MONTHS_AHEAD);
  const chosen = monthOf(selected);
  return { first, last: chosen > ahead ? chosen : ahead };
}

export function clampMonth(month: string, range: { first: string; last: string }): string {
  if (month < range.first) return range.first;
  if (month > range.last) return range.last;
  return month;
}

export function cheapestDays(fares: DayFare[], count: number): DayFare[] {
  return [...fares].sort((a, b) => a.cents - b.cents || a.date.localeCompare(b.date)).slice(0, Math.max(0, count));
}

export function fareStats(fares: DayFare[]): FareStats | null {
  if (fares.length === 0) return null;
  const cents = fares.map((fare) => fare.cents);
  return {
    minCents: Math.min(...cents),
    maxCents: Math.max(...cents),
    averageCents: Math.round(cents.reduce((total, value) => total + value, 0) / cents.length),
  };
}

/** 0 for the cheapest fare in range, 1 for the priciest. */
export function heatLevel(cents: number, stats: FareStats | null): number {
  if (!stats || stats.maxCents === stats.minCents) return 0;
  const level = (cents - stats.minCents) / (stats.maxCents - stats.minCents);
  return Math.min(1, Math.max(0, level));
}

/** Positive when `fare` is cheaper than the baseline. */
export function savingsCents(fare: DayFare, baselineCents: number): number {
  return baselineCents - fare.cents;
}

export function compareToSelected(fare: DayFare, selected: DayFare | null): { kind: DeltaKind; label: string } | null {
  if (!selected) return null;
  if (fare.date === selected.date) return { kind: 'selected', label: 'Your date' };
  const delta = savingsCents(fare, selected.cents);
  const dollars = formatDollars(Math.abs(delta));
  if (Math.round(Math.abs(delta) / 100) === 0) return { kind: 'same', label: 'Same as your date' };
  if (delta > 0) return { kind: 'save', label: `Save ${dollars} vs your date` };
  return { kind: 'more', label: `${dollars} more than your date` };
}

export function formatDollars(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    Math.round(cents / 100),
  );
}

/** "Thu Nov 12" */
export function dayLabel(date: string): string {
  return formatTripDate(date).replace(',', '');
}

/** "Nov 12" */
export function shortDayLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function dayAriaLabel(
  date: string,
  fare: DayFare | null,
  options: { past?: boolean; today?: boolean; rank?: number } = {},
): string {
  const parts = [dayLabel(date)];
  if (options.past) parts.push('past date');
  else if (!fare) parts.push('no flights');
  else parts.push(`from ${formatDollars(fare.cents)}`);
  if (options.today) parts.push('today');
  if (options.rank && !options.past && fare) parts.push('one of the 3 cheapest days this month');
  return parts.join(', ');
}
