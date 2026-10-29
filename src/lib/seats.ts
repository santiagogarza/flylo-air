import type { FareKey } from './flights';

export type SeatZone = 'extra' | 'main' | 'basic';
export type SeatPosition = 'window' | 'middle' | 'aisle';
export type Facility = 'galley' | 'lavatory';
export type SeatStatus = 'available' | 'included' | 'occupied' | 'selected';
export type Direction = 'up' | 'down' | 'left' | 'right' | 'home' | 'end';

export type Seat = {
  id: string;
  row: number;
  letter: string;
  zone: SeatZone;
  position: SeatPosition;
  exitRow: boolean;
  legroomInches: number;
  priceCents: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SeatRow = {
  number: number;
  zone: SeatZone;
  exitRow: boolean;
  y: number;
  height: number;
  seats: Seat[];
};

export type CabinSection =
  | { kind: 'facilities'; y: number; height: number; facilities: Facility[] }
  | { kind: 'zone'; y: number; height: number; zone: SeatZone; letters: { letter: string; x: number }[] };

export type CabinLayout = {
  aircraft: string;
  wideBody: boolean;
  cabinWidth: number;
  cabinLength: number;
  aisles: { x: number; width: number }[];
  rows: SeatRow[];
  sections: CabinSection[];
  exits: { row: number; y: number }[];
  wing: { start: number; end: number };
  seatCount: number;
};

type AircraftSpec = {
  economy: string[][];
  extra: string[][];
  zones: Record<SeatZone, [number, number]>;
  exitRows: number[];
  wingRows: [number, number];
  front: Facility[];
  mid?: { beforeRow: number; facilities: Facility[] };
  rear: Facility[];
  extraLegroom: number;
  extraPriceCents: number;
};

const NARROW = [
  ['A', 'B', 'C'],
  ['D', 'E', 'F'],
];
const WIDE = [
  ['A', 'B', 'C'],
  ['D', 'E', 'F'],
  ['G', 'H', 'J'],
];

const AIRCRAFT_SPECS: Record<string, AircraftSpec> = {
  'FlyLo 320neo': {
    economy: NARROW,
    extra: [
      ['A', 'C'],
      ['D', 'F'],
    ],
    zones: { extra: [1, 3], main: [4, 17], basic: [18, 27] },
    exitRows: [9, 10],
    wingRows: [7, 13],
    front: ['galley', 'lavatory'],
    rear: ['lavatory', 'galley', 'lavatory'],
    extraLegroom: 36,
    extraPriceCents: 4900,
  },
  'FlyLo 737 MAX': {
    economy: NARROW,
    extra: NARROW,
    zones: { extra: [1, 4], main: [5, 18], basic: [19, 29] },
    exitRows: [12, 13],
    wingRows: [10, 16],
    front: ['lavatory', 'galley'],
    rear: ['lavatory', 'lavatory', 'galley'],
    extraLegroom: 34,
    extraPriceCents: 4500,
  },
  'FlyLo 787-9': {
    economy: WIDE,
    extra: [
      ['A', 'C'],
      ['D', 'E', 'F'],
      ['G', 'J'],
    ],
    zones: { extra: [1, 5], main: [6, 21], basic: [22, 30] },
    exitRows: [6, 19],
    wingRows: [9, 17],
    front: ['galley', 'lavatory', 'lavatory'],
    mid: { beforeRow: 19, facilities: ['lavatory', 'galley', 'lavatory'] },
    rear: ['lavatory', 'galley', 'lavatory'],
    extraLegroom: 38,
    extraPriceCents: 6900,
  },
};

export const DEFAULT_AIRCRAFT = 'FlyLo 320neo';
export const ZONE_LABELS: Record<SeatZone, string> = { extra: 'Extra Legroom', main: 'Main Cabin', basic: 'Basic' };

export const SLOT = 26;
const SLOT_GAP = 4;
const AISLE = 30;
const PAD = 12;
const BLOCK = SLOT * 3 + SLOT_GAP * 2;
const ZONE_BAND = 38;
const FACILITY_BAND = 54;
const PITCH: Record<SeatZone, number> = { extra: 46, main: 34, basic: 32 };
const EXIT_EXTRA = 14;
const LEGROOM: Record<Exclude<SeatZone, 'extra'>, number> = { main: 31, basic: 30 };
const EXIT_LEGROOM = 39;
const EXIT_PRICE_CENTS = 3900;
const STANDARD_PRICE_CENTS: Record<Exclude<SeatZone, 'extra'>, Record<SeatPosition, number>> = {
  main: { window: 1900, aisle: 1900, middle: 1400 },
  basic: { window: 1200, aisle: 1200, middle: 900 },
};
const OCCUPANCY: Record<SeatZone, number> = { extra: 0.32, main: 0.44, basic: 0.52 };

export function buildCabinLayout(aircraft: string): CabinLayout {
  const name = AIRCRAFT_SPECS[aircraft] ? aircraft : DEFAULT_AIRCRAFT;
  const spec = AIRCRAFT_SPECS[name];
  const blocks = spec.economy.length;
  const cabinWidth = blocks * BLOCK + (blocks - 1) * AISLE + PAD * 2;
  const blockX = (block: number) => PAD + block * (BLOCK + AISLE);
  const rows: SeatRow[] = [];
  const sections: CabinSection[] = [];
  const exits: CabinLayout['exits'] = [];
  const lastRow = spec.zones.basic[1];
  let y = 0;
  let previousZone: SeatZone | undefined;

  const pushFacilities = (facilities: Facility[]) => {
    sections.push({ kind: 'facilities', y, height: FACILITY_BAND, facilities });
    y += FACILITY_BAND;
  };

  pushFacilities(spec.front);
  for (let number = 1; number <= lastRow; number += 1) {
    const zone = zoneForRow(spec, number);
    const exitRow = spec.exitRows.includes(number);
    if (spec.mid?.beforeRow === number) pushFacilities(spec.mid.facilities);

    const letters = zone === 'extra' ? spec.extra : spec.economy;
    const seatHeight = zone === 'extra' ? 30 : SLOT;
    const height = PITCH[zone] + (exitRow ? EXIT_EXTRA : 0);
    const seats: Seat[] = [];
    letters.forEach((block, blockIndex) => {
      const width = block.length === 3 ? SLOT : 34;
      const gap = block.length > 1 ? (BLOCK - block.length * width) / (block.length - 1) : 0;
      const offset = block.length === 1 ? (BLOCK - width) / 2 : 0;
      block.forEach((letter, index) => {
        const position = seatPosition(blockIndex, index, letters.length, block.length);
        const legroomInches = zone === 'extra' ? spec.extraLegroom : exitRow ? EXIT_LEGROOM : LEGROOM[zone];
        seats.push({
          id: `${number}${letter}`,
          row: number,
          letter,
          zone,
          position,
          exitRow,
          legroomInches,
          priceCents: basePrice(spec, zone, position, exitRow),
          x: blockX(blockIndex) + offset + index * (width + gap),
          y: 0,
          width,
          height: seatHeight,
        });
      });
    });

    if (zone !== previousZone) {
      sections.push({
        kind: 'zone',
        y,
        height: ZONE_BAND,
        zone,
        letters: seats.map((seat) => ({ letter: seat.letter, x: seat.x + seat.width / 2 })),
      });
      y += ZONE_BAND;
      previousZone = zone;
    }

    const seatY = y + height - seatHeight - 4;
    for (const seat of seats) seat.y = seatY;
    if (exitRow) exits.push({ row: number, y });
    rows.push({ number, zone, exitRow, y, height, seats });
    y += height;
  }
  pushFacilities(spec.rear);

  const wingStart = rows.find((row) => row.number === spec.wingRows[0])!;
  const wingEnd = rows.find((row) => row.number === spec.wingRows[1])!;

  return {
    aircraft: name,
    wideBody: blocks > 2,
    cabinWidth,
    cabinLength: y,
    aisles: Array.from({ length: blocks - 1 }, (_, i) => ({ x: blockX(i) + BLOCK, width: AISLE })),
    rows,
    sections,
    exits,
    wing: { start: wingStart.y, end: wingEnd.y + wingEnd.height },
    seatCount: rows.reduce((total, row) => total + row.seats.length, 0),
  };
}

export function allSeats(layout: CabinLayout): Seat[] {
  return layout.rows.flatMap((row) => row.seats);
}

export function findSeat(layout: CabinLayout, id: string): Seat | undefined {
  for (const row of layout.rows) {
    const seat = row.seats.find((candidate) => candidate.id === id);
    if (seat) return seat;
  }
  return undefined;
}

export function occupiedSeats(layout: CabinLayout, flightId: string): Set<string> {
  const random = seeded(`${flightId}|${layout.aircraft}|seats`);
  const taken = new Set<string>();
  for (const seat of allSeats(layout)) {
    const chance = seat.exitRow ? 0.36 : OCCUPANCY[seat.zone];
    if (random() < chance) taken.add(seat.id);
  }
  return taken;
}

export function isIncludedInFare(seat: Seat, fare: FareKey): boolean {
  if (fare === 'flex') return true;
  if (fare === 'main') return seat.zone !== 'extra' && !seat.exitRow;
  return false;
}

export function seatPriceCents(seat: Seat, fare: FareKey): number {
  return isIncludedInFare(seat, fare) ? 0 : seat.priceCents;
}

export function seatStatus(seat: Seat, fare: FareKey, occupied: Set<string>, selected: (string | null)[]): SeatStatus {
  if (selected.includes(seat.id)) return 'selected';
  if (occupied.has(seat.id)) return 'occupied';
  return isIncludedInFare(seat, fare) ? 'included' : 'available';
}

export function formatSeatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function seatFeatures(seat: Seat): string[] {
  const features: string[] = [seat.position];
  if (seat.exitRow) features.push('exit row');
  else if (seat.zone === 'extra') features.push('extra legroom');
  return features;
}

export function seatAriaLabel(seat: Seat, status: SeatStatus, fare: FareKey, traveler?: number): string {
  const parts = [`Seat ${seat.id}`, ...seatFeatures(seat)];
  if (status === 'occupied') {
    parts.push('occupied');
  } else {
    const price = seatPriceCents(seat, fare);
    parts.push(price === 0 ? 'included in your fare' : formatSeatPrice(price));
    if (status === 'selected' && traveler !== undefined) parts.push(`selected for Traveler ${traveler + 1}`);
  }
  return parts.join(', ');
}

export function neighborSeat(layout: CabinLayout, id: string, direction: Direction): string {
  const rowIndex = layout.rows.findIndex((row) => row.seats.some((seat) => seat.id === id));
  if (rowIndex < 0) return id;
  const row = layout.rows[rowIndex];
  const index = row.seats.findIndex((seat) => seat.id === id);
  const current = row.seats[index];

  if (direction === 'left') return row.seats[Math.max(0, index - 1)].id;
  if (direction === 'right') return row.seats[Math.min(row.seats.length - 1, index + 1)].id;
  if (direction === 'home') return row.seats[0].id;
  if (direction === 'end') return row.seats[row.seats.length - 1].id;

  const target = layout.rows[rowIndex + (direction === 'up' ? -1 : 1)];
  if (!target) return id;
  const center = current.x + current.width / 2;
  let best = target.seats[0];
  for (const seat of target.seats) {
    if (Math.abs(seat.x + seat.width / 2 - center) < Math.abs(best.x + best.width / 2 - center)) best = seat;
  }
  return best.id;
}

function zoneForRow(spec: AircraftSpec, row: number): SeatZone {
  if (row <= spec.zones.extra[1]) return 'extra';
  if (row <= spec.zones.main[1]) return 'main';
  return 'basic';
}

function seatPosition(block: number, index: number, blocks: number, size: number): SeatPosition {
  if ((block === 0 && index === 0) || (block === blocks - 1 && index === size - 1)) return 'window';
  if ((index === size - 1 && block < blocks - 1) || (index === 0 && block > 0)) return 'aisle';
  return 'middle';
}

function basePrice(spec: AircraftSpec, zone: SeatZone, position: SeatPosition, exitRow: boolean): number {
  if (zone === 'extra') return spec.extraPriceCents;
  if (exitRow) return EXIT_PRICE_CENTS;
  return STANDARD_PRICE_CENTS[zone][position];
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
