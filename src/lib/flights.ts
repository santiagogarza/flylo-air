import { distanceKm, findAirport } from './airports';

export type FareKey = 'basic' | 'main' | 'flex';

export type Fare = {
  key: FareKey;
  name: string;
  base: number;
  taxes: number;
  perks: string[];
};

export type Flight = {
  id: string;
  flightNumber: string;
  from: string;
  to: string;
  date: string;
  departs: string;
  arrives: string;
  arrivesNextDay: boolean;
  durationMinutes: number;
  stops: number;
  aircraft: string;
  fares: Fare[];
};

export const MAX_PASSENGERS = 6;

const FARE_DETAILS: Record<FareKey, { name: string; multiplier: number; extra: number; perks: string[] }> = {
  basic: { name: 'Basic', multiplier: 1, extra: 0, perks: ['Personal item', 'Seat assigned at check-in'] },
  main: { name: 'Main', multiplier: 1.28, extra: 24, perks: ['Carry-on bag', 'Choose your seat', 'Changes for a fee'] },
  flex: { name: 'Flex', multiplier: 1.65, extra: 52, perks: ['Carry-on and checked bag', 'Extra legroom seat', 'Free changes'] },
};

const AIRCRAFT = ['FlyLo 320neo', 'FlyLo 737 MAX', 'FlyLo 787-9'];
const DEPARTURES = [6 * 60 + 5, 8 * 60 + 40, 11 * 60 + 15, 14 * 60 + 50, 18 * 60 + 25, 21 * 60 + 10];

export function isIsoDate(value: string | undefined | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function searchFlights(from: string, to: string, date: string): Flight[] {
  const origin = findAirport(from);
  const destination = findAirport(to);
  if (!origin || !destination || origin.code === destination.code || !isIsoDate(date)) return [];

  const random = seeded(`${origin.code}${destination.code}${date}`);
  const km = distanceKm(origin, destination);
  const nonstopMinutes = Math.round(km / 13.5 + 35);
  const count = 4 + Math.floor(random() * 2);
  const flights: Flight[] = [];

  for (let index = 0; index < count; index += 1) {
    const stops = index === count - 1 && km > 1500 ? 1 : 0;
    const durationMinutes = nonstopMinutes + stops * (55 + Math.round(random() * 40));
    const departMinutes = DEPARTURES[index] + Math.round(random() * 3) * 5;
    const arriveMinutes = departMinutes + durationMinutes;
    const baseCents = Math.round((49 + km * 0.04 + random() * 55) * (stops ? 0.86 : 1)) * 100 - 1;
    const number = 100 + Math.floor(random() * 800);

    flights.push({
      id: `${origin.code}-${destination.code}-${date}-${index}`,
      flightNumber: `FL ${number}`,
      from: origin.code,
      to: destination.code,
      date,
      departs: clock(departMinutes),
      arrives: clock(arriveMinutes),
      arrivesNextDay: arriveMinutes >= 24 * 60,
      durationMinutes,
      stops,
      aircraft: AIRCRAFT[Math.floor(random() * AIRCRAFT.length)],
      fares: (Object.keys(FARE_DETAILS) as FareKey[]).map((key) => buildFare(key, baseCents)),
    });
  }
  return flights;
}

export function findFlight(id: string | undefined | null): Flight | undefined {
  const match = /^([A-Z]{3})-([A-Z]{3})-(\d{4}-\d{2}-\d{2})-(\d)$/.exec(id ?? '');
  if (!match) return undefined;
  return searchFlights(match[1], match[2], match[3]).find((flight) => flight.id === id);
}

export function findFare(flight: Flight, key: string | undefined | null): Fare | undefined {
  return flight.fares.find((fare) => fare.key === key);
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function formatTripDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function buildFare(key: FareKey, basicCents: number): Fare {
  const details = FARE_DETAILS[key];
  const baseCents = key === 'basic' ? basicCents : Math.round((basicCents * details.multiplier) / 100) * 100 + details.extra * 100 - 1;
  const taxesCents = Math.round(baseCents * 0.075) + 560;
  return {
    key,
    name: details.name,
    base: baseCents / 100,
    taxes: taxesCents / 100,
    perks: details.perks,
  };
}

function clock(totalMinutes: number): string {
  const minutes = totalMinutes % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function seeded(text: string): () => number {
  let seed = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    seed ^= text.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
