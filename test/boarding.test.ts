import { describe, expect, it } from 'vitest';
import {
  bcbpString,
  boardingPassHref,
  buildBoardingPass,
  departureTime,
  deriveGate,
  deriveSeat,
  formatPreviewOffset,
  formatShortDuration,
  julianDay,
  normalizeSeat,
  parsePassengerName,
  passStatus,
  shiftClock,
  splitCountdown,
  zoneForFare,
} from '@/lib/boarding';
import { findFare, searchFlights } from '@/lib/flights';
import { qrMatrix, qrPath } from '@/lib/qr';

const MINUTE = 60_000;
const departs = new Date(2026, 10, 12, 14, 50).getTime();
const before = (minutes: number) => departs - minutes * MINUTE;

describe('passStatus', () => {
  it('counts down to boarding, which starts 40 minutes before departure', () => {
    const status = passStatus(departs, 2, before(170));
    expect(status.phase).toBe('upcoming');
    expect(status.label).toBe('Boarding in 2h 10m');
    expect(status.target).toBe(before(40));
    expect(status.targetLabel).toBe('until boarding');
  });

  it('shows days for trips further out', () => {
    expect(passStatus(departs, 1, before(14 * 24 * 60)).label).toBe('Boarding in 13d 23h');
  });

  it('says boarding now with the zone once boarding opens', () => {
    expect(passStatus(departs, 2, before(40)).label).toBe('Boarding now, Zone 2');
    const status = passStatus(departs, 3, before(30));
    expect(status.phase).toBe('boarding');
    expect(status.label).toBe('Boarding now, Zone 3');
    expect(status.target).toBe(before(15));
  });

  it('switches to the gate-closing call in the last 10 minutes before the gate closes', () => {
    const status = passStatus(departs, 2, before(23));
    expect(status.phase).toBe('closing');
    expect(status.label).toBe('Gate closes in 8m');
    expect(passStatus(departs, 2, before(15) - 30_000).label).toBe('Gate closes in 1m');
    expect(passStatus(departs, 2, before(25)).phase).toBe('closing');
    expect(passStatus(departs, 2, before(25) - 1).phase).toBe('boarding');
  });

  it('closes the gate 15 minutes before departure, then departs', () => {
    expect(passStatus(departs, 2, before(15))).toMatchObject({ phase: 'closed', label: 'Gate closed', target: departs });
    expect(passStatus(departs, 2, departs)).toMatchObject({ phase: 'departed', target: null });
    expect(passStatus(new Date(departs), 2, new Date(departs + 5 * MINUTE)).phase).toBe('departed');
  });

  it('rounds partial minutes up so the label never reads 0m early', () => {
    expect(passStatus(departs, 2, before(40) - 1000).label).toBe('Boarding in 1m');
  });
});

describe('countdown helpers', () => {
  it('formats short durations', () => {
    expect(formatShortDuration(130 * MINUTE)).toBe('2h 10m');
    expect(formatShortDuration(120 * MINUTE)).toBe('2h');
    expect(formatShortDuration(8 * MINUTE)).toBe('8m');
    expect(formatShortDuration(7 * MINUTE + 1)).toBe('8m');
    expect(formatShortDuration(2 * 24 * 60 * MINUTE)).toBe('2d');
    expect(formatShortDuration(-5000)).toBe('0m');
  });

  it('splits a countdown into digits and never goes negative', () => {
    expect(splitCountdown((26 * 3600 + 5 * 60 + 9) * 1000 + 999)).toEqual({ days: 1, hours: 2, minutes: 5, seconds: 9 });
    expect(splitCountdown(-1)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });

  it('labels the time-travel preview', () => {
    expect(formatPreviewOffset(30)).toBe('Preview: 30 min before departure');
    expect(formatPreviewOffset(170)).toBe('Preview: 2h 50m before departure');
    expect(formatPreviewOffset(0)).toBe('Preview: at departure');
    expect(formatPreviewOffset(-5)).toBe('Preview: 5 min after departure');
  });

  it('builds departure times and boarding clocks from flight data', () => {
    const date = departureTime({ date: '2026-11-12', departs: '06:05' });
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()]).toEqual([2026, 10, 12, 6, 5]);
    expect(shiftClock('14:50', -40)).toBe('14:10');
    expect(shiftClock('00:20', -40)).toBe('23:40');
  });
});

describe('gate, zone and seat derivation', () => {
  it('derives a stable gate and terminal for each flight', () => {
    const first = deriveGate('SFO-JFK-2026-11-12-1');
    expect(deriveGate('SFO-JFK-2026-11-12-1')).toEqual(first);
    expect(first.terminal).toMatch(/^[1-3]$/);
    expect(first.gate).toMatch(/^[A-D]([1-9]|[12]\d|3[0-6])$/);
    expect(first.walkMinutes).toBeGreaterThanOrEqual(4);
    const gates = new Set(searchFlights('SFO', 'JFK', '2026-11-12').map((flight) => deriveGate(flight.id).gate));
    expect(gates.size).toBeGreaterThan(1);
  });

  it('maps fares to boarding zones', () => {
    expect(zoneForFare('flex')).toBe(1);
    expect(zoneForFare('main')).toBe(2);
    expect(zoneForFare('basic')).toBe(3);
  });

  it('keeps a valid requested seat and ignores bad ones', () => {
    expect(normalizeSeat(' 12a ')).toBe('12A');
    expect(normalizeSeat('07C')).toBe('7C');
    expect(normalizeSeat('40A')).toBeUndefined();
    expect(normalizeSeat('12G')).toBeUndefined();
    expect(deriveSeat('BOS-MIA-2026-11-20-0', 'main', 'Maya Chen', '3F')).toBe('3F');
  });

  it('assigns seats in the rows that match the fare', () => {
    for (const [fare, low, high] of [['flex', 1, 6], ['main', 7, 20], ['basic', 21, 32]] as const) {
      const seat = deriveSeat('BOS-MIA-2026-11-20-0', fare, 'Maya Chen', 'nope');
      const row = Number(seat.slice(0, -1));
      expect(row).toBeGreaterThanOrEqual(low);
      expect(row).toBeLessThanOrEqual(high);
      expect(seat).toMatch(/[A-F]$/);
      expect(deriveSeat('BOS-MIA-2026-11-20-0', fare, 'maya chen')).toBe(seat);
    }
  });

  it('parses passenger names and falls back to a friendly sample name', () => {
    expect(parsePassengerName('  Maya   Chen ')).toEqual({ first: 'Maya', last: 'Chen', display: 'Maya Chen' });
    expect(parsePassengerName('Ana María de la Cruz').last).toBe('Cruz');
    expect(parsePassengerName('<script>')).toEqual({ first: '', last: 'script', display: 'script' });
    expect(parsePassengerName(undefined).display).toBe('FlyLo Traveler');
  });
});

describe('boarding pass', () => {
  const [flight] = searchFlights('SFO', 'JFK', '2026-11-12');
  const fare = findFare(flight, 'main')!;

  it('builds every field from the flight and fare', () => {
    const pass = buildBoardingPass(flight, fare, 'Maya Chen', '12A');
    expect(pass).toMatchObject({
      flightNumber: flight.flightNumber,
      from: { code: 'SFO', city: 'San Francisco' },
      to: { code: 'JFK', city: 'New York' },
      departs: flight.departs,
      boards: shiftClock(flight.departs, -40),
      zone: 2,
      seat: '12A',
      fareName: 'Main',
      perks: fare.perks,
    });
    expect(pass.pnr).toMatch(/^[A-Z2-9]{6}$/);
    expect(buildBoardingPass(flight, fare, 'Maya Chen', '12A')).toEqual(pass);
  });

  it('encodes a fixed-width BCBP-style string that fits in a QR code', () => {
    const pass = buildBoardingPass(flight, fare, 'Maya Chen', '12A');
    expect(pass.bcbp).toHaveLength(60);
    expect(pass.bcbp.startsWith(`M1${'CHEN/MAYA'.padEnd(20, ' ')}E`)).toBe(true);
    expect(pass.bcbp.slice(30, 36)).toBe('SFOJFK');
    expect(pass.bcbp).toContain(`${String(julianDay('2026-11-12')).padStart(3, '0')}M012A`);
    const matrix = qrMatrix(pass.bcbp);
    expect(matrix.modules).toHaveLength(matrix.size);
    expect(qrPath(matrix)).toMatch(/^M\d+ \d+h\d+/);
  });

  it('computes julian days and pads short names', () => {
    expect(julianDay('2026-01-01')).toBe(1);
    expect(julianDay('2026-11-12')).toBe(316);
    const code = bcbpString({
      passenger: { first: '', last: 'Lo' },
      pnr: 'ABC234',
      from: 'BOS',
      to: 'MIA',
      flightNumber: 'FL 48',
      date: '2026-01-01',
      classCode: 'Y',
      seat: '1A',
      sequence: 7,
    });
    expect(code).toBe('M1LO                  EABC234 BOSMIAFL 0048 001Y001A0007 100');
  });

  it('links to the pass with encoded parameters', () => {
    expect(boardingPassHref('SFO-JFK-2026-11-12-0', 'main', 'Maya Chen')).toBe(
      '/boarding-pass?flight=SFO-JFK-2026-11-12-0&fare=main&name=Maya+Chen',
    );
    expect(boardingPassHref('SFO-JFK-2026-11-12-0', 'flex', 'Leo', '2C')).toContain('&seat=2C');
  });
});
