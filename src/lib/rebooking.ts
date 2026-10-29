import { distanceKm, findAirport } from './airports';
import { addDays, defaultTravelDate, isoDate } from './dates';
import { searchFlights, type FareKey, type Flight } from './flights';

export const HUBS = ['ORD', 'DEN', 'ATL'] as const;
export const MIN_LAYOVER_MINUTES = 50;
export const MAX_LAYOVER_MINUTES = 240;
export const RESULT_LIMIT = 6;
export const SEARCH_DAYS = 3;

const DAY = 24 * 60;
const MAX_HUB_DETOUR = 1.4;
const FARE_AVAILABILITY: Record<FareKey, number> = { basic: 0.55, main: 0.7, flex: 1 };
const UPGRADE: Record<FareKey, FareKey> = { basic: 'main', main: 'flex', flex: 'flex' };

export type RebookLeg = Pick<
  Flight,
  'id' | 'flightNumber' | 'from' | 'to' | 'date' | 'departs' | 'arrives' | 'arrivesNextDay' | 'durationMinutes' | 'stops' | 'aircraft'
>;

export type Disruption = {
  kind: 'canceled' | 'delayed';
  reason: string;
  /** 0 when the flight is canceled. */
  delayMinutes: number;
};

export type RebookOption = {
  id: string;
  legs: RebookLeg[];
  via: string | null;
  date: string;
  departs: string;
  arrives: string;
  arrivalDate: string;
  /** Minutes after midnight on the original flight's date. */
  departAt: number;
  arriveAt: number;
  totalMinutes: number;
  stops: number;
  layoverMinutes: number;
  arrivalDeltaMinutes: number;
  sameDay: boolean;
  sameFareAvailable: boolean;
  seatFare: FareKey;
  penalty: number;
  score: number;
};

export type ScoreInput = Pick<RebookOption, 'arrivalDeltaMinutes' | 'stops' | 'layoverMinutes' | 'sameFareAvailable'>;

export type SortMode = 'best' | 'earliest' | 'fewest';

export const SAMPLE_BOOKING = {
  reference: 'FLY-48213',
  lastName: 'Chen',
  travelers: ['Maya Chen', 'Leo Chen'],
  from: 'SFO',
  to: 'JFK',
  fare: 'main' as FareKey,
};

const REASONS: Array<(city: string) => string> = [
  () => 'an unplanned aircraft maintenance check',
  () => 'crew scheduling',
  (city) => `thunderstorms around ${city}`,
  (city) => `air traffic limits at ${city}`,
  () => 'a late-arriving aircraft',
];

export function toLeg(flight: Flight): RebookLeg {
  const { id, flightNumber, from, to, date, departs, arrives, arrivesNextDay, durationMinutes, stops, aircraft } = flight;
  return { id, flightNumber, from, to, date, departs, arrives, arrivesNextDay, durationMinutes, stops, aircraft };
}

export function disruptionFor(flight: Pick<Flight, 'id' | 'to'>): Disruption {
  const city = findAirport(flight.to)?.city ?? flight.to;
  const reason = REASONS[hash(`${flight.id}:reason`) % REASONS.length](city);
  if (hash(flight.id) % 100 < 55) return { kind: 'canceled', reason, delayMinutes: 0 };
  return { kind: 'delayed', reason, delayMinutes: 90 + (hash(`${flight.id}:delay`) % 40) * 5 };
}

export function clockMinutes(clock: string): number {
  const [hours, minutes] = clock.split(':').map(Number);
  return hours * 60 + minutes;
}

export function formatClock(totalMinutes: number): string {
  const minutes = ((totalMinutes % DAY) + DAY) % DAY;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / (DAY * 60 * 1000));
}

export function shiftDate(date: string, days: number): string {
  return isoDate(addDays(new Date(`${date}T00:00:00Z`), days));
}

/** Date and clock for a minute offset from midnight on `base`. */
export function momentAt(base: string, minutes: number): { date: string; clock: string } {
  return { date: shiftDate(base, Math.floor(minutes / DAY)), clock: formatClock(minutes) };
}

export function legTimes(leg: RebookLeg, base: string): { departAt: number; arriveAt: number } {
  const departAt = daysBetween(base, leg.date) * DAY + clockMinutes(leg.departs);
  return { departAt, arriveAt: departAt + leg.durationMinutes };
}

export function fareAvailable(flightId: string, fare: FareKey): boolean {
  return hash(`${flightId}:${fare}`) / 4294967296 < FARE_AVAILABILITY[fare];
}

/** Lower is better. Arriving late hurts most; stops, awkward layovers and a missing fare class add to it. */
export function optionPenalty({ arrivalDeltaMinutes, stops, layoverMinutes, sameFareAvailable }: ScoreInput): number {
  const late = Math.max(0, arrivalDeltaMinutes);
  const early = Math.max(0, -arrivalDeltaMinutes);
  let penalty = (late / 60) * 8 + (early / 60) * 4 + stops * 12;
  if (layoverMinutes > 0 && layoverMinutes < 75) penalty += (75 - layoverMinutes) * 0.2;
  if (layoverMinutes > 120) penalty += ((layoverMinutes - 120) / 60) * 5;
  if (!sameFareAvailable) penalty += 10;
  return Math.round(penalty * 10) / 10;
}

/** A 1-100 match score shown on each card. */
export function matchScore(penalty: number): number {
  return Math.max(1, Math.round(100 * Math.exp(-penalty / 60)));
}

export function rankOptions<T extends Pick<RebookOption, 'penalty' | 'arriveAt' | 'id'>>(options: T[]): T[] {
  return [...options].sort((a, b) => a.penalty - b.penalty || a.arriveAt - b.arriveAt || a.id.localeCompare(b.id));
}

export function sortOptions(options: RebookOption[], mode: SortMode): RebookOption[] {
  const ranked = rankOptions(options);
  if (mode === 'earliest') return ranked.sort((a, b) => a.arriveAt - b.arriveAt || a.penalty - b.penalty);
  if (mode === 'fewest') return ranked.sort((a, b) => a.stops - b.stops || a.penalty - b.penalty);
  return ranked;
}

export function visibleOptions(
  options: RebookOption[],
  { sort = 'best', sameDayOnly = false, limit = RESULT_LIMIT }: { sort?: SortMode; sameDayOnly?: boolean; limit?: number } = {},
): RebookOption[] {
  const pool = sameDayOnly ? options.filter((option) => option.sameDay) : options;
  return sortOptions(pool, sort).slice(0, limit);
}

export function buildOption(legs: RebookLeg[], original: RebookLeg, fare: FareKey): RebookOption {
  const base = original.date;
  const times = legs.map((leg) => legTimes(leg, base));
  const first = legs[0];
  const departAt = times[0].departAt;
  const arriveAt = times[times.length - 1].arriveAt;
  const layoverMinutes = times.slice(1).reduce((total, time, index) => total + time.departAt - times[index].arriveAt, 0);
  const stops = legs.reduce((total, leg) => total + leg.stops, 0) + legs.length - 1;
  const arrivalDeltaMinutes = arriveAt - legTimes(original, base).arriveAt;
  const sameFareAvailable = legs.every((leg) => fareAvailable(leg.id, fare));
  const penalty = optionPenalty({ arrivalDeltaMinutes, stops, layoverMinutes, sameFareAvailable });
  return {
    id: legs.map((leg) => leg.id).join('+'),
    legs,
    via: legs.length > 1 ? legs[0].to : null,
    date: first.date,
    departs: first.departs,
    arrives: legs[legs.length - 1].arrives,
    arrivalDate: momentAt(base, arriveAt).date,
    departAt,
    arriveAt,
    totalMinutes: arriveAt - departAt,
    stops,
    layoverMinutes,
    arrivalDeltaMinutes,
    sameDay: first.date === original.date,
    sameFareAvailable,
    seatFare: sameFareAvailable ? fare : UPGRADE[fare],
    penalty,
    score: matchScore(penalty),
  };
}

/** Pairs each first leg into the hub with the earliest onward flight that leaves a workable layover. */
export function buildConnections(from: string, to: string, hub: string, date: string): RebookLeg[][] {
  const origin = findAirport(from);
  const destination = findAirport(to);
  const via = findAirport(hub);
  if (!origin || !destination || !via || via.code === origin.code || via.code === destination.code) return [];
  if (distanceKm(origin, via) + distanceKm(via, destination) > distanceKm(origin, destination) * MAX_HUB_DETOUR) return [];

  const connections: RebookLeg[][] = [];
  for (const first of searchFlights(origin.code, via.code, date).map(toLeg)) {
    const firstArrives = legTimes(first, date).arriveAt;
    const onwardDate = momentAt(date, firstArrives).date;
    const onward = searchFlights(via.code, destination.code, onwardDate)
      .map(toLeg)
      .find((leg) => {
        const layover = legTimes(leg, date).departAt - firstArrives;
        return layover >= MIN_LAYOVER_MINUTES && layover <= MAX_LAYOVER_MINUTES;
      });
    if (onward) connections.push([first, onward]);
  }
  return connections;
}

/**
 * Every rebooking option for the same route on the original day and the next two days,
 * nonstop or through a hub, ranked best first. Days before `today` are skipped.
 */
export function buildAlternatives(original: RebookLeg, fare: FareKey, today?: string): RebookOption[] {
  const options: RebookOption[] = [];
  for (let offset = 0; offset < SEARCH_DAYS; offset += 1) {
    const date = shiftDate(original.date, offset);
    if (today && date < today) continue;
    for (const flight of searchFlights(original.from, original.to, date)) {
      if (flight.id !== original.id) options.push(buildOption([toLeg(flight)], original, fare));
    }
    for (const hub of HUBS) {
      for (const legs of buildConnections(original.from, original.to, hub, date)) {
        options.push(buildOption(legs, original, fare));
      }
    }
  }
  return rankOptions(options);
}

export function formatDelta(minutes: number): string {
  const abs = Math.abs(minutes);
  if (abs < 5) return 'arrives on time';
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  const amount = hours && rest ? `${hours}h ${rest}m` : hours ? `${hours}h` : `${rest}m`;
  return `arrives ${amount} ${minutes > 0 ? 'later' : 'earlier'}`;
}

export function disruptionHref(flightId: string, fare: FareKey, passengers: number): string {
  return `/trips/disruption?flight=${encodeURIComponent(flightId)}&fare=${fare}&passengers=${passengers}`;
}

/** The sample booking flies two weeks out; it sits on the first canceled SFO to JFK flight that day so the demo always has something to fix. */
export function sampleBookingFlight(now = new Date()): Flight | undefined {
  const flights = searchFlights(SAMPLE_BOOKING.from, SAMPLE_BOOKING.to, defaultTravelDate(now));
  const order = [1, 2, 0, 3, 4];
  return order.map((index) => flights[index]).find((flight) => flight && disruptionFor(flight).kind === 'canceled') ?? flights[1];
}

export function sampleBookingHref(now = new Date()): string | undefined {
  const flight = sampleBookingFlight(now);
  return flight && disruptionHref(flight.id, SAMPLE_BOOKING.fare, SAMPLE_BOOKING.travelers.length);
}

export function matchesSampleBooking(reference: string, lastName: string): boolean {
  return (
    reference.trim().toUpperCase().replace(/\s+/g, '') === SAMPLE_BOOKING.reference &&
    lastName.trim().toLowerCase() === SAMPLE_BOOKING.lastName.toLowerCase()
  );
}

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}
