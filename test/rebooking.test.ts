import { describe, expect, it } from 'vitest';
import { buildIcs } from '@/lib/calendar';
import { addDays, defaultTravelDate, isoDate } from '@/lib/dates';
import { findFlight, searchFlights } from '@/lib/flights';
import {
  HUBS,
  MAX_LAYOVER_MINUTES,
  MIN_LAYOVER_MINUTES,
  RESULT_LIMIT,
  buildAlternatives,
  buildConnections,
  disruptionFor,
  formatDelta,
  legTimes,
  matchScore,
  matchesSampleBooking,
  optionPenalty,
  rankOptions,
  sampleBookingFlight,
  sampleBookingHref,
  toLeg,
  visibleOptions,
  type ScoreInput,
} from '@/lib/rebooking';

const DATE = '2026-11-12';
const original = toLeg(searchFlights('SFO', 'JFK', DATE)[2]);
const options = buildAlternatives(original, 'main');

function scored(id: string, input: ScoreInput, arriveAt = 0) {
  const penalty = optionPenalty(input);
  return { id, arriveAt, penalty, ...input };
}

describe('disruptionFor', () => {
  it('picks the same disruption for the same flight id', () => {
    expect(disruptionFor(original)).toEqual(disruptionFor({ ...original }));
  });

  it('cancels some flights and delays others by a realistic amount', () => {
    const flights = ['SFO-JFK', 'SEA-LAX', 'BOS-MIA', 'DEN-HNL'].flatMap((route) => {
      const [from, to] = route.split('-');
      return searchFlights(from, to, DATE);
    });
    const kinds = new Set(flights.map((flight) => disruptionFor(flight).kind));
    expect(kinds).toEqual(new Set(['canceled', 'delayed']));
    for (const flight of flights) {
      const disruption = disruptionFor(flight);
      expect(disruption.reason.length).toBeGreaterThan(0);
      if (disruption.kind === 'canceled') expect(disruption.delayMinutes).toBe(0);
      else {
        expect(disruption.delayMinutes).toBeGreaterThanOrEqual(90);
        expect(disruption.delayMinutes).toBeLessThanOrEqual(285);
        expect(disruption.delayMinutes % 5).toBe(0);
      }
    }
  });
});

describe('optionPenalty and rankOptions', () => {
  const base: ScoreInput = { arrivalDeltaMinutes: 30, stops: 0, layoverMinutes: 0, sameFareAvailable: true };

  it('ranks a smaller arrival delay first', () => {
    const ranked = rankOptions([
      scored('late-3h', { ...base, arrivalDeltaMinutes: 180 }),
      scored('late-30m', base),
      scored('late-1h15', { ...base, arrivalDeltaMinutes: 75 }),
    ]);
    expect(ranked.map((option) => option.id)).toEqual(['late-30m', 'late-1h15', 'late-3h']);
  });

  it('prefers nonstop over a connection with the same arrival', () => {
    const ranked = rankOptions([
      scored('one-stop', { ...base, stops: 1, layoverMinutes: 90 }),
      scored('nonstop', base),
    ]);
    expect(ranked.map((option) => option.id)).toEqual(['nonstop', 'one-stop']);
  });

  it('penalizes tight and long layovers against a comfortable one', () => {
    const ranked = rankOptions([
      scored('long', { ...base, stops: 1, layoverMinutes: 230 }),
      scored('tight', { ...base, stops: 1, layoverMinutes: 50 }),
      scored('comfortable', { ...base, stops: 1, layoverMinutes: 95 }),
    ]);
    expect(ranked.map((option) => option.id)).toEqual(['comfortable', 'tight', 'long']);
  });

  it('prefers the same fare class, then breaks ties by earlier arrival', () => {
    const ranked = rankOptions([
      scored('no-fare', { ...base, sameFareAvailable: false }, 100),
      scored('fare-later', base, 200),
      scored('fare-earlier', base, 150),
    ]);
    expect(ranked.map((option) => option.id)).toEqual(['fare-earlier', 'fare-later', 'no-fare']);
  });

  it('treats arriving early as better than arriving equally late', () => {
    expect(optionPenalty({ ...base, arrivalDeltaMinutes: -120 })).toBeLessThan(optionPenalty({ ...base, arrivalDeltaMinutes: 120 }));
  });

  it('turns penalties into a 1-100 match score', () => {
    expect(matchScore(0)).toBe(100);
    expect(matchScore(10)).toBeGreaterThan(matchScore(30));
    expect(matchScore(10_000)).toBe(1);
  });
});

describe('buildAlternatives', () => {
  it('returns ranked options for the same route over three days, without the original flight', () => {
    expect(options.length).toBeGreaterThan(RESULT_LIMIT);
    expect(options.some((option) => option.id === original.id)).toBe(false);
    const dates = new Set(options.map((option) => option.date));
    expect(dates).toEqual(new Set([DATE, '2026-11-13', '2026-11-14']));
    for (const option of options) {
      expect(option.legs[0].from).toBe('SFO');
      expect(option.legs[option.legs.length - 1].to).toBe('JFK');
    }
    for (let i = 1; i < options.length; i += 1) {
      expect(options[i].penalty).toBeGreaterThanOrEqual(options[i - 1].penalty);
    }
  });

  it('measures the arrival delta against the original schedule', () => {
    const originalArrives = legTimes(original, DATE).arriveAt;
    for (const option of options) expect(option.arrivalDeltaMinutes).toBe(option.arriveAt - originalArrives);
    const nextDay = options.find((option) => option.legs.length === 1 && option.date === '2026-11-13' && option.departs === original.departs);
    if (nextDay) expect(nextDay.arrivalDeltaMinutes).toBeGreaterThan(20 * 60);
  });

  it('puts a same-day nonstop near the original arrival at the top', () => {
    const [best] = options;
    expect(best.sameDay).toBe(true);
    expect(best.stops).toBe(0);
    expect(Math.abs(best.arrivalDeltaMinutes)).toBeLessThan(6 * 60);
  });

  it('builds hub connections with a realistic layover', () => {
    const connections = options.filter((option) => option.via);
    expect(connections.length).toBeGreaterThan(0);
    for (const option of connections) {
      expect(HUBS).toContain(option.via);
      const [first, second] = option.legs;
      expect(first.to).toBe(option.via);
      expect(second.from).toBe(option.via);
      expect(option.layoverMinutes).toBeGreaterThanOrEqual(MIN_LAYOVER_MINUTES);
      expect(option.layoverMinutes).toBeLessThanOrEqual(MAX_LAYOVER_MINUTES);
      expect(option.stops).toBeGreaterThanOrEqual(1);
    }
  });

  it('skips hubs that would be a big detour or are an end of the trip', () => {
    expect(buildConnections('SEA', 'LAX', 'ATL', DATE)).toEqual([]);
    expect(buildConnections('ORD', 'JFK', 'ORD', DATE)).toEqual([]);
  });

  it('skips days before today', () => {
    const later = buildAlternatives(original, 'main', '2026-11-13');
    expect(later.every((option) => option.date >= '2026-11-13')).toBe(true);
  });

  it('upgrades the seat when the same fare is sold out', () => {
    for (const option of options) {
      expect(option.seatFare).toBe(option.sameFareAvailable ? 'main' : 'flex');
    }
  });
});

describe('visibleOptions', () => {
  it('shows the top six by best match by default', () => {
    expect(visibleOptions(options)).toEqual(options.slice(0, RESULT_LIMIT));
  });

  it('sorts by earliest arrival', () => {
    const shown = visibleOptions(options, { sort: 'earliest' });
    expect(shown).toHaveLength(RESULT_LIMIT);
    for (let i = 1; i < shown.length; i += 1) expect(shown[i].arriveAt).toBeGreaterThanOrEqual(shown[i - 1].arriveAt);
  });

  it('sorts by fewest stops, best match within the same stop count', () => {
    const shown = visibleOptions(options, { sort: 'fewest', limit: options.length });
    for (let i = 1; i < shown.length; i += 1) {
      expect(shown[i].stops).toBeGreaterThanOrEqual(shown[i - 1].stops);
      if (shown[i].stops === shown[i - 1].stops) expect(shown[i].penalty).toBeGreaterThanOrEqual(shown[i - 1].penalty);
    }
  });

  it('filters to same-day options', () => {
    const shown = visibleOptions(options, { sameDayOnly: true });
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((option) => option.sameDay)).toBe(true);
  });
});

describe('formatDelta', () => {
  it('describes arrival changes in plain words', () => {
    expect(formatDelta(75)).toBe('arrives 1h 15m later');
    expect(formatDelta(-40)).toBe('arrives 40m earlier');
    expect(formatDelta(120)).toBe('arrives 2h later');
    expect(formatDelta(2)).toBe('arrives on time');
  });
});

describe('sample booking', () => {
  const now = new Date('2026-10-29T17:00:00Z');

  it('finds FLY-48213 for Chen, ignoring case and spaces', () => {
    expect(matchesSampleBooking(' fly-48213 ', 'chen')).toBe(true);
    expect(matchesSampleBooking('FLY-48214', 'Chen')).toBe(false);
    expect(matchesSampleBooking('FLY-48213', 'Smith')).toBe(false);
  });

  it('sits on a canceled SFO to JFK flight two weeks out', () => {
    const flight = sampleBookingFlight(now);
    expect(flight?.date).toBe(defaultTravelDate(now));
    expect(flight?.from).toBe('SFO');
    expect(disruptionFor(flight!).kind).toBe('canceled');
    expect(sampleBookingHref(now)).toBe(`/trips/disruption?flight=${encodeURIComponent(flight!.id)}&fare=main&passengers=2`);
    expect(findFlight(flight!.id)).toEqual(flight);
  });

  it('follows the real date', () => {
    expect(sampleBookingFlight()?.date).toBe(isoDate(addDays(new Date(), 14)));
  });
});

describe('buildIcs', () => {
  it('writes one event per leg with CRLF line endings', () => {
    const connection = options.find((option) => option.legs.length === 2)!;
    const ics = buildIcs({ confirmation: 'FLY-50001', legs: connection.legs, travelers: 2, now: new Date('2026-10-29T17:00:00Z') });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('DTSTAMP:20261029T170000Z');
    const [first] = connection.legs;
    expect(ics).toContain(`DTSTART:${first.date.replace(/-/g, '')}T${first.departs.replace(':', '')}00`);
    expect(ics).toContain('SAMPLE booking FLY-50001');
    expect(ics.split('\r\n').every((line) => line.length <= 75)).toBe(true);
  });
});
