import { findAirport } from './airports';
import { addDays, isoDate } from './dates';
import { searchFlights, type Flight } from './flights';

export type LatLon = { lat: number; lon: number };
export type Point = { x: number; y: number };

const EARTH_RADIUS_KM = 6371;
const MINUTE = 60_000;
const rad = Math.PI / 180;

// Directed routes shown on the tracker. The first four are the home page's popular routes.
export const TRACKER_ROUTES = [
  ['SFO', 'JFK'],
  ['SEA', 'LAX'],
  ['BOS', 'MIA'],
  ['DEN', 'HNL'],
  ['JFK', 'SFO'],
  ['HNL', 'SFO'],
  ['ORD', 'LAS'],
  ['ATL', 'SEA'],
  ['AUS', 'BOS'],
  ['MIA', 'ORD'],
  ['LAX', 'ATL'],
  ['DEN', 'JFK'],
  ['SEA', 'AUS'],
  ['LAX', 'LAS'],
  ['ORD', 'JFK'],
  ['ATL', 'MIA'],
] as const;

/* Great-circle geometry */

function toVector({ lat, lon }: LatLon): [number, number, number] {
  const phi = lat * rad;
  const lambda = lon * rad;
  return [Math.cos(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi)];
}

export function centralAngle(a: LatLon, b: LatLon): number {
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function greatCircleKm(a: LatLon, b: LatLon): number {
  return centralAngle(a, b) * EARTH_RADIUS_KM;
}

/** The point a fraction `t` (0 to 1) of the way along the great circle from `a` to `b`. */
export function greatCirclePoint(a: LatLon, b: LatLon, t: number): LatLon {
  const d = centralAngle(a, b);
  if (d < 1e-12) return { lat: a.lat, lon: a.lon };
  const wa = Math.sin((1 - t) * d) / Math.sin(d);
  const wb = Math.sin(t * d) / Math.sin(d);
  const va = toVector(a);
  const vb = toVector(b);
  const x = wa * va[0] + wb * vb[0];
  const y = wa * va[1] + wb * vb[1];
  const z = wa * va[2] + wb * vb[2];
  return { lat: Math.atan2(z, Math.hypot(x, y)) / rad, lon: Math.atan2(y, x) / rad };
}

/** `segments + 1` points evenly spaced along the great circle, endpoints included. */
export function greatCirclePath(a: LatLon, b: LatLon, segments = 64): LatLon[] {
  const points: LatLon[] = [];
  for (let i = 0; i <= segments; i += 1) points.push(greatCirclePoint(a, b, i / segments));
  return points;
}

/** Initial compass bearing from `a` towards `b`, in degrees clockwise from north (0 to 360). */
export function initialBearing(a: LatLon, b: LatLon): number {
  const phi1 = a.lat * rad;
  const phi2 = b.lat * rad;
  const dLambda = (b.lon - a.lon) * rad;
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

/** Heading of the segment from `from` to `to` in screen space (y grows downwards), in degrees. */
export function screenHeading(from: Point, to: Point): number {
  return Math.atan2(to.y - from.y, to.x - from.x) / rad;
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export function compassPoint(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360;
  return COMPASS[Math.round(normalized / 22.5) % COMPASS.length];
}

/* Time */

/** How far through a flight we are at `now`, from 0 (not departed) to 1 (landed). */
export function flightProgress(departMs: number, arriveMs: number, nowMs: number): number {
  if (arriveMs <= departMs) return nowMs >= arriveMs ? 1 : 0;
  return Math.min(1, Math.max(0, (nowMs - departMs) / (arriveMs - departMs)));
}

/** The viewer's local calendar date as YYYY-MM-DD. */
export function localIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Milliseconds for a YYYY-MM-DD date and HH:MM clock time in the viewer's local time zone. */
export function localTime(date: string, clock: string, addMinutes = 0): number {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = clock.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes + addMinutes).getTime();
}

export function startOfLocalDay(nowMs: number): number {
  const date = new Date(nowMs);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function formatClock(ms: number): string {
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/* Tracked flights */

export type TrackedFlight = Flight & {
  delayMinutes: number;
  scheduledDepartMs: number;
  departMs: number;
  arriveMs: number;
  distanceKm: number;
  cruiseFeet: number;
  cruiseKnots: number;
};

export type StatusKey = 'scheduled' | 'delayed' | 'boarding' | 'departed' | 'en-route' | 'landed';

export type FlightStatus = {
  key: StatusKey;
  label: string;
  progress: number;
};

export const BOARDING_MINUTES = 35;
export const DEPARTED_MINUTES = 12;

function hash(text: string): number {
  let seed = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    seed ^= text.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

/** Roughly one flight in eight runs late, by the same amount every time for the same flight. */
export function delayFor(flightId: string): number {
  const h = hash(`delay:${flightId}`);
  return h % 100 < 13 ? 15 + ((h >>> 8) % 9) * 5 : 0;
}

export function trackFlight(flight: Flight): TrackedFlight {
  const origin = findAirport(flight.from);
  const destination = findAirport(flight.to);
  const h = hash(`cruise:${flight.id}`);
  const delayMinutes = delayFor(flight.id);
  const scheduledDepartMs = localTime(flight.date, flight.departs);
  const departMs = scheduledDepartMs + delayMinutes * MINUTE;
  return {
    ...flight,
    delayMinutes,
    scheduledDepartMs,
    departMs,
    arriveMs: departMs + flight.durationMinutes * MINUTE,
    distanceKm: origin && destination ? greatCircleKm(origin, destination) : 0,
    cruiseFeet: flight.durationMinutes < 100 ? 31000 + (h % 2) * 2000 : 33000 + (h % 4) * 2000,
    cruiseKnots: 445 + ((h >>> 4) % 45),
  };
}

/**
 * Every nonstop tracker flight that departs on `date`, plus the previous evening's flights that
 * are still flying or land that day, earliest departure first.
 */
export function flightsForDay(date: string): TrackedFlight[] {
  const previous = isoDate(addDays(new Date(`${date}T00:00:00Z`), -1));
  const dayStart = localTime(date, '00:00');
  const flights: TrackedFlight[] = [];
  for (const [from, to] of TRACKER_ROUTES) {
    for (const flight of searchFlights(from, to, previous)) {
      if (flight.stops > 0) continue;
      const tracked = trackFlight(flight);
      if (tracked.arriveMs > dayStart) flights.push(tracked);
    }
    for (const flight of searchFlights(from, to, date)) {
      if (flight.stops === 0) flights.push(trackFlight(flight));
    }
  }
  return flights.sort((a, b) => a.departMs - b.departMs || a.flightNumber.localeCompare(b.flightNumber));
}

export function flightStatus(flight: TrackedFlight, nowMs: number): FlightStatus {
  const progress = flightProgress(flight.departMs, flight.arriveMs, nowMs);
  if (nowMs >= flight.arriveMs) return { key: 'landed', label: 'Landed', progress };
  if (nowMs >= flight.departMs) {
    if (nowMs - flight.departMs < DEPARTED_MINUTES * MINUTE) return { key: 'departed', label: 'Departed', progress };
    return { key: 'en-route', label: `En route · ${Math.floor(progress * 100)}%`, progress };
  }
  if (nowMs >= flight.departMs - BOARDING_MINUTES * MINUTE) return { key: 'boarding', label: 'Boarding', progress };
  if (flight.delayMinutes > 0) return { key: 'delayed', label: `Delayed ${flight.delayMinutes}m`, progress };
  return { key: 'scheduled', label: 'Scheduled', progress };
}

export function isAirborne(status: FlightStatus): boolean {
  return status.key === 'departed' || status.key === 'en-route';
}

/** Sample altitude and ground speed: climb out, cruise, then descend into the destination. */
export function telemetry(flight: TrackedFlight, nowMs: number): { altitudeFeet: number; groundSpeedKnots: number } {
  if (nowMs < flight.departMs || nowMs >= flight.arriveMs) return { altitudeFeet: 0, groundSpeedKnots: 0 };
  const elapsed = (nowMs - flight.departMs) / MINUTE;
  const remaining = (flight.arriveMs - nowMs) / MINUTE;
  const climb = Math.min(1, elapsed / 20, remaining / 25);
  const eased = 1 - (1 - climb) ** 2;
  const accel = Math.min(1, elapsed / 12, remaining / 18);
  return {
    altitudeFeet: Math.round((flight.cruiseFeet * eased) / 100) * 100,
    groundSpeedKnots: Math.round(150 + (flight.cruiseKnots - 150) * accel),
  };
}

/* Search */

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function placeMatches(code: string, text: string): boolean {
  const airport = findAirport(code);
  const needle = normalize(text);
  if (!needle) return false;
  return code.toLowerCase().startsWith(needle) || Boolean(airport?.city.toLowerCase().startsWith(needle));
}

/**
 * Matches a flight against what someone typed: a flight number ("FL 412", "412", or "FL 4xx" with
 * x as any digit), a route ("SFO to JFK", "SFO-JFK", "sfo jfk") or one airport code or city.
 */
export function matchesQuery(flight: Flight, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;

  const number = /^(?:fl\s?)?([\dx]{1,3})$/.exec(q);
  if (number) {
    const pattern = new RegExp(`^${number[1].replace(/x/g, '\\d')}`);
    return pattern.test(flight.flightNumber.replace(/\D/g, ''));
  }

  const parts = q.split(/\s*(?:→|->|>|–|—|-|\/|\bto\b)\s*/).filter(Boolean);
  if (parts.length >= 2) return placeMatches(flight.from, parts[0]) && placeMatches(flight.to, parts[1]);

  const pair = /^([a-z]{3}) ([a-z]{3})$/.exec(q);
  if (pair && findAirport(pair[1]) && findAirport(pair[2])) {
    return flight.from.toLowerCase() === pair[1] && flight.to.toLowerCase() === pair[2];
  }

  return placeMatches(flight.from, q) || placeMatches(flight.to, q);
}

/** Finds a flight for a deep link: an exact flight id first, then a flight number like "FL 412". */
export function findTrackedFlight(flights: TrackedFlight[], key: string | undefined | null): TrackedFlight | undefined {
  if (!key) return undefined;
  const byId = flights.find((flight) => flight.id === key);
  if (byId) return byId;
  const digits = /^\s*(?:fl\s?)?(\d{3})\s*$/i.exec(key)?.[1];
  return digits ? flights.find((flight) => flight.flightNumber === `FL ${digits}`) : undefined;
}
