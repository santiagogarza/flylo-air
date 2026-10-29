import { describe, expect, it } from 'vitest';
import { AIRPORTS, distanceKm, findAirport } from '@/lib/airports';
import {
  TRACKER_ROUTES,
  centralAngle,
  compassPoint,
  findTrackedFlight,
  flightProgress,
  flightStatus,
  flightsForDay,
  greatCircleKm,
  greatCirclePath,
  greatCirclePoint,
  initialBearing,
  isAirborne,
  localIsoDate,
  localTime,
  matchesQuery,
  screenHeading,
  telemetry,
  trackFlight,
} from '@/lib/flight-tracker';
import { searchFlights, type Flight } from '@/lib/flights';

const SFO = findAirport('SFO')!;
const JFK = findAirport('JFK')!;
const MINUTE = 60_000;

function sampleFlight(overrides: Partial<Flight> = {}): Flight {
  return { ...searchFlights('SFO', 'JFK', '2026-11-12')[0], ...overrides };
}

describe('great circles', () => {
  it('starts and ends at the two airports', () => {
    expect(greatCirclePoint(SFO, JFK, 0).lat).toBeCloseTo(SFO.lat, 9);
    expect(greatCirclePoint(SFO, JFK, 0).lon).toBeCloseTo(SFO.lon, 9);
    expect(greatCirclePoint(SFO, JFK, 1).lat).toBeCloseTo(JFK.lat, 9);
    expect(greatCirclePoint(SFO, JFK, 1).lon).toBeCloseTo(JFK.lon, 9);
  });

  it('interpolates along the equator and the meridian exactly', () => {
    const equator = greatCirclePoint({ lat: 0, lon: 0 }, { lat: 0, lon: 90 }, 0.5);
    expect(equator.lat).toBeCloseTo(0, 9);
    expect(equator.lon).toBeCloseTo(45, 9);
    const meridian = greatCirclePoint({ lat: 0, lon: -100 }, { lat: 60, lon: -100 }, 0.25);
    expect(meridian.lat).toBeCloseTo(15, 9);
    expect(meridian.lon).toBeCloseTo(-100, 9);
  });

  it('bows towards the pole on an east-west route, unlike a straight lat/lon line', () => {
    const middle = greatCirclePoint(SFO, JFK, 0.5);
    expect(middle.lat).toBeGreaterThan((SFO.lat + JFK.lat) / 2 + 1.5);
  });

  it('spaces points evenly by distance', () => {
    const path = greatCirclePath(SFO, JFK, 8);
    expect(path).toHaveLength(9);
    const total = greatCircleKm(SFO, JFK);
    for (let i = 1; i < path.length; i += 1) {
      expect(greatCircleKm(path[i - 1], path[i])).toBeCloseTo(total / 8, 6);
    }
  });

  it('agrees with the airport distance helper', () => {
    expect(greatCircleKm(SFO, JFK)).toBeCloseTo(distanceKm(SFO, JFK), 6);
    expect(greatCircleKm(SFO, JFK)).toBeGreaterThan(4100);
    expect(greatCircleKm(SFO, JFK)).toBeLessThan(4200);
    expect(centralAngle(SFO, SFO)).toBe(0);
    expect(greatCirclePoint(SFO, SFO, 0.5)).toEqual({ lat: SFO.lat, lon: SFO.lon });
  });
});

describe('headings', () => {
  it('gives compass bearings clockwise from north', () => {
    expect(initialBearing({ lat: 0, lon: 0 }, { lat: 10, lon: 0 })).toBeCloseTo(0, 9);
    expect(initialBearing({ lat: 0, lon: 0 }, { lat: 0, lon: 10 })).toBeCloseTo(90, 9);
    expect(initialBearing({ lat: 10, lon: 0 }, { lat: 0, lon: 0 })).toBeCloseTo(180, 9);
    expect(initialBearing({ lat: 0, lon: 10 }, { lat: 0, lon: 0 })).toBeCloseTo(270, 9);
  });

  it('leaves San Francisco heading east-northeast for New York', () => {
    const bearing = initialBearing(SFO, JFK);
    expect(bearing).toBeGreaterThan(65);
    expect(bearing).toBeLessThan(75);
    expect(compassPoint(bearing)).toBe('ENE');
    expect(compassPoint(-10)).toBe('N');
    expect(compassPoint(359)).toBe('N');
  });

  it('measures screen headings with y pointing down', () => {
    expect(screenHeading({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
    expect(screenHeading({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(90);
    expect(screenHeading({ x: 0, y: 0 }, { x: -10, y: 0 })).toBe(180);
    expect(screenHeading({ x: 0, y: 0 }, { x: 0, y: -10 })).toBe(-90);
  });
});

describe('progress from times', () => {
  it('runs from 0 at departure to 1 at arrival and clamps outside', () => {
    expect(flightProgress(1000, 2000, 500)).toBe(0);
    expect(flightProgress(1000, 2000, 1000)).toBe(0);
    expect(flightProgress(1000, 2000, 1250)).toBe(0.25);
    expect(flightProgress(1000, 2000, 2000)).toBe(1);
    expect(flightProgress(1000, 2000, 9000)).toBe(1);
    expect(flightProgress(1000, 1000, 999)).toBe(0);
    expect(flightProgress(1000, 1000, 1000)).toBe(1);
  });

  it('reads clock times in local time', () => {
    const ms = localTime('2026-11-12', '08:40');
    const date = new Date(ms);
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()]).toEqual([2026, 10, 12, 8, 40]);
    expect(localTime('2026-11-12', '23:30', 45) - ms).toBe((14 * 60 + 50 + 45) * MINUTE);
    expect(localIsoDate(date)).toBe('2026-11-12');
  });
});

describe('flight status', () => {
  const flight = trackFlight(sampleFlight({ id: 'SFO-JFK-2026-11-12-on-time' }));
  const onTime = { ...flight, delayMinutes: 0, departMs: flight.scheduledDepartMs, arriveMs: flight.scheduledDepartMs + flight.durationMinutes * MINUTE };
  const at = (minutes: number) => onTime.departMs + minutes * MINUTE;

  it('walks through every stage of the day', () => {
    expect(flightStatus(onTime, at(-120)).key).toBe('scheduled');
    expect(flightStatus(onTime, at(-20)).key).toBe('boarding');
    expect(flightStatus(onTime, at(5)).key).toBe('departed');
    const halfway = flightStatus(onTime, at(onTime.durationMinutes / 2));
    expect(halfway).toEqual({ key: 'en-route', label: 'En route · 50%', progress: 0.5 });
    expect(flightStatus(onTime, at(onTime.durationMinutes)).key).toBe('landed');
    expect(isAirborne(halfway)).toBe(true);
    expect(isAirborne(flightStatus(onTime, at(-20)))).toBe(false);
  });

  it('shows delayed flights as delayed until boarding', () => {
    const late = { ...onTime, delayMinutes: 30, departMs: onTime.departMs + 30 * MINUTE, arriveMs: onTime.arriveMs + 30 * MINUTE };
    expect(flightStatus(late, at(-60))).toMatchObject({ key: 'delayed', label: 'Delayed 30m' });
    expect(flightStatus(late, at(0)).key).toBe('boarding');
    expect(flightStatus(late, at(31)).key).toBe('departed');
  });

  it('samples altitude and speed only while flying', () => {
    expect(telemetry(onTime, at(-5))).toEqual({ altitudeFeet: 0, groundSpeedKnots: 0 });
    expect(telemetry(onTime, at(onTime.durationMinutes))).toEqual({ altitudeFeet: 0, groundSpeedKnots: 0 });
    const cruise = telemetry(onTime, at(onTime.durationMinutes / 2));
    expect(cruise.altitudeFeet).toBe(onTime.cruiseFeet);
    expect(cruise.groundSpeedKnots).toBe(onTime.cruiseKnots);
    const climbing = telemetry(onTime, at(5));
    expect(climbing.altitudeFeet).toBeGreaterThan(0);
    expect(climbing.altitudeFeet).toBeLessThan(onTime.cruiseFeet);
  });
});

describe('flightsForDay', () => {
  const date = '2026-11-12';
  const flights = flightsForDay(date);

  it('is the same every time and sorted by departure', () => {
    expect(flightsForDay(date)).toEqual(flights);
    for (let i = 1; i < flights.length; i += 1) expect(flights[i].departMs).toBeGreaterThanOrEqual(flights[i - 1].departMs);
  });

  it('covers every route and all 12 airports with nonstop flights only', () => {
    expect(flights.every((flight) => flight.stops === 0)).toBe(true);
    for (const [from, to] of TRACKER_ROUTES) expect(flights.some((f) => f.from === from && f.to === to)).toBe(true);
    const codes = new Set(flights.flatMap((flight) => [flight.from, flight.to]));
    expect([...codes].sort()).toEqual(AIRPORTS.map((airport) => airport.code).sort());
  });

  it('includes last night’s flights only while they still land that day', () => {
    for (const day of ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']) {
      const dayStart = localTime(day, '00:00');
      for (const flight of flightsForDay(day)) {
        if (flight.date !== day) expect(flight.arriveMs).toBeGreaterThan(dayStart);
        else expect(flight.departMs).toBeGreaterThanOrEqual(dayStart);
      }
    }
  });

  it('delays a few flights, deterministically', () => {
    const delayed = flights.filter((flight) => flight.delayMinutes > 0);
    expect(delayed.length).toBeGreaterThan(0);
    expect(delayed.length).toBeLessThan(flights.length / 3);
    for (const flight of delayed) expect(flight.departMs - flight.scheduledDepartMs).toBe(flight.delayMinutes * MINUTE);
  });
});

describe('search', () => {
  const flight = sampleFlight({ flightNumber: 'FL 412', from: 'SFO', to: 'JFK' });

  it('matches flight numbers, with x as any digit', () => {
    expect(matchesQuery(flight, 'FL 412')).toBe(true);
    expect(matchesQuery(flight, 'fl412')).toBe(true);
    expect(matchesQuery(flight, '41')).toBe(true);
    expect(matchesQuery(flight, 'FL 4xx')).toBe(true);
    expect(matchesQuery(flight, 'FL 5xx')).toBe(false);
    expect(matchesQuery(flight, 'FL 413')).toBe(false);
  });

  it('matches routes by code or city', () => {
    expect(matchesQuery(flight, 'SFO to JFK')).toBe(true);
    expect(matchesQuery(flight, 'sfo-jfk')).toBe(true);
    expect(matchesQuery(flight, 'SFO JFK')).toBe(true);
    expect(matchesQuery(flight, 'San Francisco → New York')).toBe(true);
    expect(matchesQuery(flight, 'JFK to SFO')).toBe(false);
    expect(matchesQuery(flight, 'new york')).toBe(true);
    expect(matchesQuery(flight, 'Boston')).toBe(false);
    expect(matchesQuery(flight, '   ')).toBe(true);
  });

  it('finds deep-linked flights by id or flight number', () => {
    const flights = flightsForDay('2026-11-12');
    const target = flights[5];
    expect(findTrackedFlight(flights, target.id)).toBe(target);
    expect(findTrackedFlight(flights, target.flightNumber)?.flightNumber).toBe(target.flightNumber);
    expect(findTrackedFlight(flights, 'nope')).toBeUndefined();
    expect(findTrackedFlight(flights, undefined)).toBeUndefined();
  });
});
