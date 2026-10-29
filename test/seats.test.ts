import { describe, expect, it } from 'vitest';
import { defaultTravelDate } from '@/lib/dates';
import { MAX_PASSENGERS, searchFlights } from '@/lib/flights';
import {
  DEFAULT_AIRCRAFT,
  allSeats,
  buildCabinLayout,
  findSeat,
  isIncludedInFare,
  neighborSeat,
  occupiedSeats,
  seatAriaLabel,
  seatPriceCents,
  seatStatus,
  type CabinLayout,
} from '@/lib/seats';

const AIRCRAFT = ['FlyLo 320neo', 'FlyLo 737 MAX', 'FlyLo 787-9'];

function seat(layout: CabinLayout, id: string) {
  const found = findSeat(layout, id);
  if (!found) throw new Error(`missing seat ${id}`);
  return found;
}

describe('buildCabinLayout', () => {
  it('gives each aircraft its own layout', () => {
    const layouts = AIRCRAFT.map(buildCabinLayout);
    expect(new Set(layouts.map((layout) => layout.seatCount)).size).toBe(3);
    expect(layouts.map((layout) => layout.aisles.length)).toEqual([1, 1, 2]);
    expect(layouts.map((layout) => layout.wideBody)).toEqual([false, false, true]);
    expect(layouts[0].rows[0].seats.map((s) => s.letter)).toEqual(['A', 'C', 'D', 'F']);
    expect(layouts[1].rows[0].seats.map((s) => s.letter)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(layouts[2].rows[0].seats.map((s) => s.letter)).toEqual(['A', 'C', 'D', 'E', 'F', 'G', 'J']);
  });

  it('falls back to the default aircraft for unknown types', () => {
    expect(buildCabinLayout('Paper plane').aircraft).toBe(DEFAULT_AIRCRAFT);
  });

  it.each(AIRCRAFT)('%s puts Extra Legroom up front, Main in the middle and Basic at the back', (aircraft) => {
    const layout = buildCabinLayout(aircraft);
    const zones = layout.rows.map((row) => row.zone);
    const order = { extra: 0, main: 1, basic: 2 } as const;
    expect(zones[0]).toBe('extra');
    expect(zones.at(-1)).toBe('basic');
    expect(zones.includes('main')).toBe(true);
    for (let i = 1; i < zones.length; i += 1) expect(order[zones[i]]).toBeGreaterThanOrEqual(order[zones[i - 1]]);
    expect(layout.rows.map((row) => row.number)).toEqual(layout.rows.map((_, i) => i + 1));
  });

  it.each(AIRCRAFT)('%s has unique seats that fit the cabin without overlapping', (aircraft) => {
    const layout = buildCabinLayout(aircraft);
    const seats = allSeats(layout);
    expect(new Set(seats.map((s) => s.id)).size).toBe(seats.length);
    expect(seats.length).toBe(layout.seatCount);
    for (const row of layout.rows) {
      for (let i = 0; i < row.seats.length; i += 1) {
        const current = row.seats[i];
        expect(current.x).toBeGreaterThanOrEqual(0);
        expect(current.x + current.width).toBeLessThanOrEqual(layout.cabinWidth);
        expect(current.y).toBeGreaterThanOrEqual(row.y);
        expect(current.y + current.height).toBeLessThanOrEqual(row.y + row.height);
        if (i > 0) expect(current.x).toBeGreaterThanOrEqual(row.seats[i - 1].x + row.seats[i - 1].width);
        for (const aisle of layout.aisles) {
          const overlaps = current.x < aisle.x + aisle.width && current.x + current.width > aisle.x;
          expect(overlaps).toBe(false);
        }
      }
    }
    for (let i = 1; i < layout.rows.length; i += 1) {
      expect(layout.rows[i].y).toBeGreaterThanOrEqual(layout.rows[i - 1].y + layout.rows[i - 1].height);
    }
    expect(layout.cabinLength).toBeGreaterThan(layout.rows.at(-1)!.y + layout.rows.at(-1)!.height);
  });

  it.each(AIRCRAFT)('%s labels windows, middles and aisles', (aircraft) => {
    const layout = buildCabinLayout(aircraft);
    for (const row of layout.rows) {
      expect(row.seats[0].position).toBe('window');
      expect(row.seats.at(-1)!.position).toBe('window');
      expect(row.seats.filter((s) => s.position === 'window')).toHaveLength(2);
      expect(row.seats.filter((s) => s.position === 'aisle')).toHaveLength(layout.aisles.length * 2);
    }
    const economyRow = layout.rows.find((row) => row.zone === 'main' && !row.exitRow)!;
    expect(economyRow.seats.find((s) => s.letter === 'B')?.position).toBe('middle');
  });

  it.each(AIRCRAFT)('%s highlights exit rows with extra legroom, galleys and lavatories', (aircraft) => {
    const layout = buildCabinLayout(aircraft);
    const exitRows = layout.rows.filter((row) => row.exitRow);
    expect(exitRows.length).toBeGreaterThanOrEqual(2);
    expect(layout.exits.map((exit) => exit.row)).toEqual(exitRows.map((row) => row.number));
    const standard = layout.rows.find((row) => row.zone === 'main' && !row.exitRow)!;
    for (const row of exitRows) {
      expect(row.height).toBeGreaterThan(standard.height);
      for (const s of row.seats) {
        expect(s.exitRow).toBe(true);
        expect(s.legroomInches).toBeGreaterThan(standard.seats[0].legroomInches);
      }
    }
    const facilities = layout.sections.flatMap((section) => (section.kind === 'facilities' ? section.facilities : []));
    expect(facilities).toContain('galley');
    expect(facilities).toContain('lavatory');
    expect(layout.sections[0].kind).toBe('facilities');
    expect(layout.sections.at(-1)!.kind).toBe('facilities');
    expect(layout.wing.end).toBeGreaterThan(layout.wing.start);
  });
});

describe('fares and prices', () => {
  const layout = buildCabinLayout('FlyLo 737 MAX');
  const extra = seat(layout, '2A');
  const exit = seat(layout, '12C');
  const standard = seat(layout, '8B');
  const basic = seat(layout, '25F');

  it('includes Extra Legroom with Flex and standard seats with Main', () => {
    for (const s of [extra, exit, standard, basic]) expect(isIncludedInFare(s, 'flex')).toBe(true);
    expect(isIncludedInFare(standard, 'main')).toBe(true);
    expect(isIncludedInFare(basic, 'main')).toBe(true);
    expect(isIncludedInFare(extra, 'main')).toBe(false);
    expect(isIncludedInFare(exit, 'main')).toBe(false);
    for (const s of [extra, exit, standard, basic]) expect(isIncludedInFare(s, 'basic')).toBe(false);
  });

  it('prices paid seats and makes included ones free', () => {
    expect(seatPriceCents(exit, 'basic')).toBe(3900);
    expect(seatPriceCents(exit, 'main')).toBe(3900);
    expect(seatPriceCents(exit, 'flex')).toBe(0);
    expect(seatPriceCents(standard, 'main')).toBe(0);
    expect(seatPriceCents(extra, 'basic')).toBeGreaterThan(seatPriceCents(standard, 'basic'));
    expect(seatPriceCents(standard, 'basic')).toBeGreaterThan(0);
  });

  it('writes helpful aria labels', () => {
    expect(seatAriaLabel(exit, 'available', 'main')).toBe('Seat 12C, aisle, exit row, $39');
    expect(seatAriaLabel(extra, 'available', 'basic')).toBe('Seat 2A, window, extra legroom, $45');
    expect(seatAriaLabel(standard, 'included', 'main')).toBe('Seat 8B, middle, included in your fare');
    expect(seatAriaLabel(basic, 'occupied', 'basic')).toBe('Seat 25F, window, occupied');
    expect(seatAriaLabel(exit, 'selected', 'main', 1)).toBe('Seat 12C, aisle, exit row, $39, selected for Traveler 2');
  });

  it('works out each seat status', () => {
    const occupied = new Set(['8B']);
    expect(seatStatus(standard, 'main', occupied, [])).toBe('occupied');
    expect(seatStatus(basic, 'main', occupied, [])).toBe('included');
    expect(seatStatus(basic, 'basic', occupied, [])).toBe('available');
    expect(seatStatus(basic, 'basic', occupied, [null, '25F'])).toBe('selected');
  });
});

describe('occupiedSeats', () => {
  const flights = searchFlights('SFO', 'JFK', defaultTravelDate());

  it('is the same every time for the same flight', () => {
    for (const flight of flights) {
      const layout = buildCabinLayout(flight.aircraft);
      expect([...occupiedSeats(layout, flight.id)]).toEqual([...occupiedSeats(buildCabinLayout(flight.aircraft), flight.id)]);
    }
  });

  it('differs between flights', () => {
    const layout = buildCabinLayout('FlyLo 787-9');
    const first = [...occupiedSeats(layout, flights[0].id)].sort();
    const second = [...occupiedSeats(layout, flights[1].id)].sort();
    expect(first).not.toEqual(second);
  });

  it.each(AIRCRAFT)('%s leaves plenty of real seats open', (aircraft) => {
    const layout = buildCabinLayout(aircraft);
    for (const flight of flights) {
      const taken = occupiedSeats(layout, flight.id);
      for (const id of taken) expect(findSeat(layout, id)).toBeDefined();
      const ratio = taken.size / layout.seatCount;
      expect(ratio).toBeGreaterThan(0.2);
      expect(ratio).toBeLessThan(0.7);
      expect(layout.seatCount - taken.size).toBeGreaterThanOrEqual(MAX_PASSENGERS * 5);
    }
  });
});

describe('neighborSeat', () => {
  it('moves across a row and stops at the walls', () => {
    const layout = buildCabinLayout('FlyLo 737 MAX');
    expect(neighborSeat(layout, '8C', 'right')).toBe('8D');
    expect(neighborSeat(layout, '8D', 'left')).toBe('8C');
    expect(neighborSeat(layout, '8A', 'left')).toBe('8A');
    expect(neighborSeat(layout, '8F', 'right')).toBe('8F');
    expect(neighborSeat(layout, '8C', 'home')).toBe('8A');
    expect(neighborSeat(layout, '8C', 'end')).toBe('8F');
  });

  it('moves between rows, picking the nearest seat when layouts change', () => {
    const narrow = buildCabinLayout('FlyLo 320neo');
    expect(neighborSeat(narrow, '8B', 'up')).toBe('7B');
    expect(neighborSeat(narrow, '8B', 'down')).toBe('9B');
    expect(neighborSeat(narrow, '1A', 'up')).toBe('1A');
    expect(neighborSeat(narrow, '4A', 'up')).toBe('3A');
    expect(neighborSeat(narrow, '3C', 'down')).toMatch(/^4[BC]$/);
    const last = narrow.rows.at(-1)!.seats[0].id;
    expect(neighborSeat(narrow, last, 'down')).toBe(last);
    const wide = buildCabinLayout('FlyLo 787-9');
    expect(neighborSeat(wide, '6E', 'up')).toBe('5E');
    expect(neighborSeat(wide, '6H', 'up')).toMatch(/^5[GJ]$/);
  });
});
