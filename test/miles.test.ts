import { describe, expect, it } from 'vitest';
import { isoDate } from '@/lib/dates';
import {
  REWARDS,
  TIERS,
  awardFlightMiles,
  buildSampleHistory,
  earnedMiles,
  filterEntries,
  milesBalance,
  monthlyEarned,
  qualifyingMiles,
  redeem,
  rewardCost,
  routeMiles,
  tierFor,
  tierProgress,
} from '@/lib/miles';

const NOW = new Date('2026-10-29T15:00:00Z');
const reward = (key: string) => REWARDS.find((item) => item.key === key)!;

describe('earning', () => {
  it('turns route distance into whole miles', () => {
    expect(routeMiles('SFO', 'JFK')).toBe(2580);
    expect(routeMiles('jfk', 'sfo')).toBe(2580);
    expect(routeMiles('SFO', 'SFO')).toBe(0);
    expect(routeMiles('SFO', 'XXX')).toBe(0);
  });

  it('applies the fare multiplier: Basic 1x, Main 1.5x, Flex 2x', () => {
    expect(earnedMiles('SFO', 'JFK', 'basic')).toBe(2580);
    expect(earnedMiles('SFO', 'JFK', 'main')).toBe(3870);
    expect(earnedMiles('SFO', 'JFK', 'flex')).toBe(5160);
    expect(earnedMiles('SFO', 'DEN', 'main')).toBe(Math.round(965 * 1.5));
  });
});

describe('tiers', () => {
  it('has four tiers in order', () => {
    expect(TIERS.map((tier) => tier.name)).toEqual(['Breeze', 'Cruise', 'Altitude', 'Stratos']);
  });

  it('picks the tier at each threshold', () => {
    expect(tierFor(0).key).toBe('breeze');
    expect(tierFor(9_999).key).toBe('breeze');
    expect(tierFor(10_000).key).toBe('cruise');
    expect(tierFor(24_999).key).toBe('cruise');
    expect(tierFor(25_000).key).toBe('altitude');
    expect(tierFor(80_000).key).toBe('stratos');
  });

  it('measures progress toward the next tier', () => {
    const progress = tierProgress(21_580);
    expect(progress.tier.name).toBe('Cruise');
    expect(progress.next?.name).toBe('Altitude');
    expect(progress.toNext).toBe(3_420);
    expect(progress.fraction).toBeCloseTo(11_580 / 15_000, 6);
  });

  it('is full at the top tier', () => {
    expect(tierProgress(60_000)).toMatchObject({ toNext: 0, fraction: 1, next: undefined });
    expect(tierProgress(-5).tier.key).toBe('breeze');
  });
});

describe('sample history', () => {
  it('is deterministic for the same day', () => {
    expect(buildSampleHistory(NOW)).toEqual(buildSampleHistory(new Date('2026-10-29T02:00:00Z')));
  });

  it('puts Maya 3,420 miles from Altitude on any date', () => {
    for (const day of ['2026-10-29', '2027-02-28', '2028-07-04']) {
      const now = new Date(`${day}T12:00:00Z`);
      const entries = buildSampleHistory(now);
      const progress = tierProgress(qualifyingMiles(entries, now));
      expect(progress.tier.name).toBe('Cruise');
      expect(progress.toNext).toBe(3_420);
      expect(milesBalance(entries)).toBe(19_080);
    }
  });

  it('builds flights from real routes and searchFlights()', () => {
    const flights = filterEntries(buildSampleHistory(NOW), 'flights');
    expect(flights.length).toBeGreaterThanOrEqual(8);
    for (const entry of flights) {
      expect(entry.flight?.flightNumber).toMatch(/^FL \d{3}$/);
      expect(entry.miles).toBe(earnedMiles(entry.flight!.from, entry.flight!.to, entry.flight!.fare));
      expect(entry.date < isoDate(NOW)).toBe(true);
    }
  });

  it('filters by kind', () => {
    const entries = buildSampleHistory(NOW);
    expect(filterEntries(entries, 'all')).toHaveLength(entries.length);
    expect(filterEntries(entries, 'bonuses').every((entry) => entry.kind === 'partner' || entry.kind === 'promo')).toBe(true);
    expect(filterEntries(entries, 'bonuses').some((entry) => entry.kind === 'partner')).toBe(true);
    expect(filterEntries(entries, 'redemptions').every((entry) => entry.miles < 0)).toBe(true);
  });

  it('totals earned miles for the last 12 months', () => {
    const entries = buildSampleHistory(NOW);
    const months = monthlyEarned(entries, NOW);
    expect(months).toHaveLength(12);
    expect(months[11].month).toBe('2026-10');
    expect(months[0].month).toBe('2025-11');
    expect(months.reduce((sum, month) => sum + month.miles, 0)).toBe(qualifyingMiles(entries, NOW));
  });
});

describe('redeeming', () => {
  it('prices award flights by distance', () => {
    expect(awardFlightMiles('LAX', 'SFO')).toBe(7_500);
    expect(awardFlightMiles('SEA', 'LAX')).toBe(12_500);
    expect(awardFlightMiles('SFO', 'JFK')).toBe(22_500);
    expect(awardFlightMiles('SFO', 'SFO')).toBe(0);
    expect(rewardCost(reward('award-flight'))).toBe(0);
    expect(rewardCost(reward('lounge-pass'))).toBe(4_000);
  });

  it('lowers the balance but not the tier', () => {
    const entries = buildSampleHistory(NOW);
    const result = redeem(entries, reward('seat-upgrade'), NOW);
    if (!result.ok) throw new Error(result.reason);
    expect(result.entries[0]).toMatchObject({ kind: 'redemption', miles: -7_500, date: '2026-10-29' });
    expect(milesBalance(result.entries)).toBe(19_080 - 7_500);
    expect(qualifyingMiles(result.entries, NOW)).toBe(qualifyingMiles(entries, NOW));
  });

  it('refuses rewards you cannot afford or invalid routes', () => {
    const entries = buildSampleHistory(NOW);
    expect(redeem(entries, reward('award-flight'), NOW, { from: 'SFO', to: 'JFK' })).toEqual({
      ok: false,
      reason: 'You need 3,420 more miles.',
    });
    expect(redeem(entries, reward('award-flight'), NOW, { from: 'SFO', to: 'SFO' }).ok).toBe(false);
    const award = redeem(entries, reward('award-flight'), NOW, { from: 'SEA', to: 'LAX' });
    expect(award.ok && award.entry.detail).toBe('Seattle to Los Angeles · one way');
  });
});
