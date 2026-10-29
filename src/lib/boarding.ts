import { findAirport } from './airports';
import { formatDuration, formatTripDate, type Fare, type FareKey, type Flight } from './flights';

export const BOARDING_LEAD_MINUTES = 40;
export const GATE_CLOSE_MINUTES = 15;
export const FINAL_CALL_MINUTES = 10;

const MINUTE = 60_000;

export type PassPhase = 'upcoming' | 'boarding' | 'closing' | 'closed' | 'departed';

export type PassStatus = {
  phase: PassPhase;
  label: string;
  target: number | null;
  targetLabel: string;
};

export type BoardingPass = {
  flightId: string;
  flightNumber: string;
  from: { code: string; city: string };
  to: { code: string; city: string };
  date: string;
  dateLabel: string;
  dateShort: string;
  departs: string;
  arrives: string;
  arrivesNextDay: boolean;
  boards: string;
  duration: string;
  aircraft: string;
  terminal: string;
  gate: string;
  walkMinutes: number;
  zone: number;
  seat: string;
  seatNote: string;
  fareKey: FareKey;
  fareName: string;
  cabin: string;
  classCode: string;
  perks: string[];
  passenger: { first: string; last: string; display: string };
  pnr: string;
  sequence: number;
  bcbp: string;
};

const FARE_SEATING: Record<FareKey, { zone: number; rows: [number, number]; cabin: string; classCode: string }> = {
  flex: { zone: 1, rows: [1, 6], cabin: 'Extra legroom', classCode: 'Y' },
  main: { zone: 2, rows: [7, 20], cabin: 'Economy', classCode: 'M' },
  basic: { zone: 3, rows: [21, 32], cabin: 'Economy', classCode: 'N' },
};

const SEAT_LETTERS = 'ABCDEF';
const CONCOURSES = 'ABCD';
const PNR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const SAMPLE_PASSENGER = 'FlyLo Traveler';

export function zoneForFare(fare: FareKey): number {
  return FARE_SEATING[fare].zone;
}

export function deriveGate(flightId: string): { terminal: string; gate: string; walkMinutes: number } {
  const random = seeded(`gate:${flightId}`);
  const terminal = String(1 + Math.floor(random() * 3));
  const concourse = CONCOURSES[Math.floor(random() * CONCOURSES.length)];
  const number = 1 + Math.floor(random() * 36);
  return { terminal, gate: `${concourse}${number}`, walkMinutes: 4 + Math.round(number / 4) };
}

export function normalizeSeat(value: string | undefined | null): string | undefined {
  const seat = (value ?? '').trim().toUpperCase();
  const match = /^(\d{1,2})([A-F])$/.exec(seat);
  if (!match) return undefined;
  const row = Number(match[1]);
  return row >= 1 && row <= 32 ? `${row}${match[2]}` : undefined;
}

export function deriveSeat(flightId: string, fare: FareKey, passenger: string, requested?: string | null): string {
  const chosen = normalizeSeat(requested);
  if (chosen) return chosen;
  const [first, last] = FARE_SEATING[fare].rows;
  const random = seeded(`seat:${flightId}:${fare}:${passenger.toLowerCase()}`);
  const row = first + Math.floor(random() * (last - first + 1));
  return `${row}${SEAT_LETTERS[Math.floor(random() * SEAT_LETTERS.length)]}`;
}

export function parsePassengerName(value: string | undefined | null): { first: string; last: string; display: string } {
  const cleaned = (value ?? '')
    .replace(/[^\p{L}\p{M}' -]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
    .trim();
  const display = cleaned || SAMPLE_PASSENGER;
  const parts = display.split(' ');
  const last = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  const first = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
  return { first, last, display };
}

export function departureTime(flight: Pick<Flight, 'date' | 'departs'>): Date {
  const [year, month, day] = flight.date.split('-').map(Number);
  const [hours, minutes] = flight.departs.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes);
}

export function shiftClock(clock: string, deltaMinutes: number): string {
  const [hours, minutes] = clock.split(':').map(Number);
  const total = (((hours * 60 + minutes + deltaMinutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function formatShortDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / MINUTE));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

export function passStatus(departure: Date | number, zone: number, now: Date | number): PassStatus {
  const departs = typeof departure === 'number' ? departure : departure.getTime();
  const at = typeof now === 'number' ? now : now.getTime();
  const boardingStarts = departs - BOARDING_LEAD_MINUTES * MINUTE;
  const gateCloses = departs - GATE_CLOSE_MINUTES * MINUTE;

  if (at < boardingStarts) {
    return { phase: 'upcoming', label: `Boarding in ${formatShortDuration(boardingStarts - at)}`, target: boardingStarts, targetLabel: 'until boarding' };
  }
  if (at < gateCloses - FINAL_CALL_MINUTES * MINUTE) {
    return { phase: 'boarding', label: `Boarding now, Zone ${zone}`, target: gateCloses, targetLabel: 'until the gate closes' };
  }
  if (at < gateCloses) {
    return { phase: 'closing', label: `Gate closes in ${formatShortDuration(gateCloses - at)}`, target: gateCloses, targetLabel: 'until the gate closes' };
  }
  if (at < departs) {
    return { phase: 'closed', label: 'Gate closed', target: departs, targetLabel: 'until departure' };
  }
  return { phase: 'departed', label: 'Departed. Enjoy the flight!', target: null, targetLabel: '' };
}

export function splitCountdown(ms: number): { days: number; hours: number; minutes: number; seconds: number } {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

export function formatPreviewOffset(minutesBefore: number): string {
  if (minutesBefore === 0) return 'Preview: at departure';
  const span = Math.abs(minutesBefore);
  const text = span < 60 ? `${span} min` : formatShortDuration(span * MINUTE);
  return `Preview: ${text} ${minutesBefore > 0 ? 'before' : 'after'} departure`;
}

export function boardingPassHref(flightId: string, fare: FareKey, name: string, seat?: string): string {
  const params = new URLSearchParams({ flight: flightId, fare, name });
  if (seat) params.set('seat', seat);
  return `/boarding-pass?${params.toString()}`;
}

export function julianDay(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getTime();
  const start = Date.UTC(Number(date.slice(0, 4)), 0, 1);
  return Math.floor((day - start) / 86_400_000) + 1;
}

export function bookingCode(flightId: string, passenger: string): string {
  const random = seeded(`pnr:${flightId}:${passenger.toLowerCase()}`);
  return Array.from({ length: 6 }, () => PNR_ALPHABET[Math.floor(random() * PNR_ALPHABET.length)]).join('');
}

// IATA BCBP "M1" mandatory items, one leg. Field widths are fixed by the spec.
export function bcbpString(pass: {
  passenger: { first: string; last: string };
  pnr: string;
  from: string;
  to: string;
  flightNumber: string;
  date: string;
  classCode: string;
  seat: string;
  sequence: number;
}): string {
  const ascii = (text: string) => text.normalize('NFD').replace(/[^A-Za-z ]/g, '').toUpperCase();
  const name = (pass.passenger.first ? `${ascii(pass.passenger.last)}/${ascii(pass.passenger.first)}` : ascii(pass.passenger.last))
    .slice(0, 20)
    .padEnd(20, ' ');
  const flightDigits = pass.flightNumber.replace(/\D/g, '').padStart(4, '0').padEnd(5, ' ');
  const seat = pass.seat.padStart(4, '0');
  return [
    'M1',
    name,
    'E',
    pass.pnr.padEnd(7, ' '),
    pass.from,
    pass.to,
    'FL ',
    flightDigits,
    String(julianDay(pass.date)).padStart(3, '0'),
    pass.classCode,
    seat,
    `${String(pass.sequence).padStart(4, '0')} `,
    '1',
    '00',
  ].join('');
}

export function buildBoardingPass(flight: Flight, fare: Fare, rawName?: string | null, rawSeat?: string | null): BoardingPass {
  const passenger = parsePassengerName(rawName);
  const seating = FARE_SEATING[fare.key];
  const { terminal, gate, walkMinutes } = deriveGate(flight.id);
  const seat = deriveSeat(flight.id, fare.key, passenger.display, rawSeat);
  const pnr = bookingCode(flight.id, passenger.display);
  const sequence = 1 + Math.floor(seeded(`seq:${flight.id}:${passenger.display.toLowerCase()}`)() * 180);
  const origin = findAirport(flight.from);
  const destination = findAirport(flight.to);
  return {
    flightId: flight.id,
    flightNumber: flight.flightNumber,
    from: { code: flight.from, city: origin?.city ?? flight.from },
    to: { code: flight.to, city: destination?.city ?? flight.to },
    date: flight.date,
    dateLabel: formatTripDate(flight.date),
    dateShort: new Date(`${flight.date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
    departs: flight.departs,
    arrives: flight.arrives,
    arrivesNextDay: flight.arrivesNextDay,
    boards: shiftClock(flight.departs, -BOARDING_LEAD_MINUTES),
    duration: formatDuration(flight.durationMinutes),
    aircraft: flight.aircraft,
    terminal,
    gate,
    walkMinutes,
    zone: seating.zone,
    seat,
    seatNote: normalizeSeat(rawSeat) ? 'Your pick' : fare.key === 'basic' ? 'Assigned at check-in' : seating.cabin,
    fareKey: fare.key,
    fareName: fare.name,
    cabin: seating.cabin,
    classCode: seating.classCode,
    perks: fare.perks,
    passenger,
    pnr,
    sequence,
    bcbp: bcbpString({
      passenger,
      pnr,
      from: flight.from,
      to: flight.to,
      flightNumber: flight.flightNumber,
      date: flight.date,
      classCode: seating.classCode,
      seat,
      sequence,
    }),
  };
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
