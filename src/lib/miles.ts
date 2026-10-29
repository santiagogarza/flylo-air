import { distanceKm, findAirport } from './airports';
import { addDays, isoDate } from './dates';
import { searchFlights, type FareKey } from './flights';

export const KM_PER_MILE = 1.609344;

export const FARE_MULTIPLIERS: Record<FareKey, number> = { basic: 1, main: 1.5, flex: 2 };

export const FARE_NAMES: Record<FareKey, string> = { basic: 'Basic', main: 'Main', flex: 'Flex' };

export const SAMPLE_MEMBER = { name: 'Maya Chen', number: 'FLY-48213' } as const;

/** Distance flown in whole miles, or 0 when the route is not a real FlyLo-Air route. */
export function routeMiles(from: string, to: string): number {
  const origin = findAirport(from);
  const destination = findAirport(to);
  if (!origin || !destination || origin.code === destination.code) return 0;
  return Math.round(distanceKm(origin, destination) / KM_PER_MILE);
}

export function earnedMiles(from: string, to: string, fare: FareKey): number {
  return Math.round(routeMiles(from, to) * FARE_MULTIPLIERS[fare]);
}

// Tiers

export type TierKey = 'breeze' | 'cruise' | 'altitude' | 'stratos';

export type Tier = {
  key: TierKey;
  name: string;
  threshold: number;
  tagline: string;
};

export const TIERS: Tier[] = [
  { key: 'breeze', name: 'Breeze', threshold: 0, tagline: 'Every trip counts.' },
  { key: 'cruise', name: 'Cruise', threshold: 10_000, tagline: 'Bags on us, boarding sooner.' },
  { key: 'altitude', name: 'Altitude', threshold: 25_000, tagline: 'Lounges, legroom and upgrades.' },
  { key: 'stratos', name: 'Stratos', threshold: 50_000, tagline: 'The whole sky, your way.' },
];

export type BenefitValue = string | boolean;

export const TIER_BENEFITS: { label: string; values: Record<TierKey, BenefitValue> }[] = [
  { label: 'Earn miles on every flight', values: { breeze: true, cruise: true, altitude: true, stratos: true } },
  { label: 'Free checked bags', values: { breeze: false, cruise: '1 bag', altitude: '2 bags', stratos: '3 bags' } },
  { label: 'Priority boarding', values: { breeze: false, cruise: 'Group 3', altitude: 'Group 2', stratos: 'Group 1' } },
  { label: 'Seat selection', values: { breeze: 'At check-in', cruise: 'Free Main seats', altitude: 'Free extra legroom', stratos: 'Any seat, any time' } },
  { label: 'Lounge passes each year', values: { breeze: false, cruise: false, altitude: '4 passes', stratos: 'Unlimited' } },
  { label: 'Complimentary upgrades', values: { breeze: false, cruise: false, altitude: 'When available', stratos: 'Confirmed at booking' } },
  { label: 'Dedicated support line', values: { breeze: false, cruise: false, altitude: false, stratos: true } },
];

export function tierFor(qualifyingMiles: number): Tier {
  let current = TIERS[0];
  for (const tier of TIERS) {
    if (qualifyingMiles >= tier.threshold) current = tier;
  }
  return current;
}

export function nextTier(qualifyingMiles: number): Tier | undefined {
  return TIERS.find((tier) => tier.threshold > qualifyingMiles);
}

export type TierProgress = {
  tier: Tier;
  next: Tier | undefined;
  /** Miles still needed for the next tier (0 at the top tier). */
  toNext: number;
  /** 0 to 1, measured from the current tier's threshold to the next one. */
  fraction: number;
};

export function tierProgress(qualifyingMiles: number): TierProgress {
  const miles = Math.max(0, Math.floor(qualifyingMiles));
  const tier = tierFor(miles);
  const next = nextTier(miles);
  if (!next) return { tier, next, toNext: 0, fraction: 1 };
  return {
    tier,
    next,
    toNext: next.threshold - miles,
    fraction: (miles - tier.threshold) / (next.threshold - tier.threshold),
  };
}

// Activity

export type EntryKind = 'flight' | 'partner' | 'promo' | 'redemption';

export type MilesEntry = {
  id: string;
  kind: EntryKind;
  /** ISO date, YYYY-MM-DD (UTC). */
  date: string;
  title: string;
  detail: string;
  miles: number;
  flight?: {
    from: string;
    to: string;
    flightNumber: string;
    fare: FareKey;
    baseMiles: number;
    multiplier: number;
  };
};

export type ActivityFilter = 'all' | 'flights' | 'bonuses' | 'redemptions';

export const ACTIVITY_FILTERS: { key: ActivityFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'flights', label: 'Flights' },
  { key: 'bonuses', label: 'Bonuses' },
  { key: 'redemptions', label: 'Redemptions' },
];

export function filterEntries(entries: MilesEntry[], filter: ActivityFilter): MilesEntry[] {
  switch (filter) {
    case 'flights':
      return entries.filter((entry) => entry.kind === 'flight');
    case 'bonuses':
      return entries.filter((entry) => entry.kind === 'partner' || entry.kind === 'promo');
    case 'redemptions':
      return entries.filter((entry) => entry.kind === 'redemption');
    default:
      return entries;
  }
}

export function milesBalance(entries: MilesEntry[]): number {
  return entries.reduce((total, entry) => total + entry.miles, 0);
}

/** Miles earned (not redeemed) in the 365 days up to and including `now`. Redemptions never lower your tier. */
export function qualifyingMiles(entries: MilesEntry[], now: Date): number {
  const today = isoDate(now);
  const from = isoDate(addDays(now, -364));
  return entries
    .filter((entry) => entry.kind !== 'redemption' && entry.miles > 0 && entry.date >= from && entry.date <= today)
    .reduce((total, entry) => total + entry.miles, 0);
}

export type MonthTotal = { month: string; label: string; miles: number };

/** Miles earned in each of the last 12 calendar months (UTC), oldest first, ending with the current month. */
export function monthlyEarned(entries: MilesEntry[], now: Date): MonthTotal[] {
  const months: MonthTotal[] = [];
  for (let back = 11; back >= 0; back -= 1) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    months.push({
      month: start.toISOString().slice(0, 7),
      label: start.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
      miles: 0,
    });
  }
  for (const entry of entries) {
    if (entry.kind === 'redemption' || entry.miles <= 0) continue;
    const bucket = months.find((month) => month.month === entry.date.slice(0, 7));
    if (bucket) bucket.miles += entry.miles;
  }
  return months;
}

type SampleTrip = { daysAgo: number; from: string; to: string; fare: FareKey };
type SampleExtra = { daysAgo: number; kind: Exclude<EntryKind, 'flight'>; title: string; detail: string; miles: number };

const SAMPLE_TRIPS: SampleTrip[] = [
  { daysAgo: 9, from: 'JFK', to: 'SFO', fare: 'basic' },
  { daysAgo: 14, from: 'SFO', to: 'JFK', fare: 'main' },
  { daysAgo: 38, from: 'SEA', to: 'SFO', fare: 'main' },
  { daysAgo: 41, from: 'SFO', to: 'SEA', fare: 'flex' },
  { daysAgo: 77, from: 'LAX', to: 'SFO', fare: 'basic' },
  { daysAgo: 79, from: 'SFO', to: 'LAX', fare: 'flex' },
  { daysAgo: 162, from: 'MIA', to: 'BOS', fare: 'main' },
  { daysAgo: 167, from: 'BOS', to: 'MIA', fare: 'basic' },
  { daysAgo: 281, from: 'DEN', to: 'SFO', fare: 'main' },
  { daysAgo: 285, from: 'SFO', to: 'DEN', fare: 'basic' },
];

// Every date stays within 300 days so the whole sample fits the 12-month window whatever today is.
const SAMPLE_EXTRAS: SampleExtra[] = [
  { daysAgo: 23, kind: 'partner', title: 'FlyLo Rewards Card', detail: 'Sample card purchases · 1 mile per $1', miles: 1_497 },
  { daysAgo: 40, kind: 'promo', title: 'Double-miles weekend', detail: 'Bonus on your San Francisco to Seattle trip', miles: 679 },
  { daysAgo: 104, kind: 'redemption', title: 'Free checked bag', detail: 'Used on Seattle to San Francisco', miles: -2_500 },
  { daysAgo: 37, kind: 'promo', title: 'Welcome to Cruise', detail: 'Tier bonus for reaching Cruise', miles: 2_500 },
  { daysAgo: 226, kind: 'partner', title: 'Harbor & Pine Hotels', detail: 'Partner stay · 3 nights × 500 miles', miles: 1_500 },
];

/** Maya Chen's sample history, dated relative to `now`, newest first. Same `now` day, same history. */
export function buildSampleHistory(now: Date): MilesEntry[] {
  const entries: { daysAgo: number; entry: MilesEntry }[] = [];

  for (const trip of SAMPLE_TRIPS) {
    const date = isoDate(addDays(now, -trip.daysAgo));
    const flights = searchFlights(trip.from, trip.to, date);
    if (flights.length === 0) continue;
    const flight = flights[trip.daysAgo % flights.length];
    const baseMiles = routeMiles(trip.from, trip.to);
    const multiplier = FARE_MULTIPLIERS[trip.fare];
    const origin = findAirport(trip.from);
    const destination = findAirport(trip.to);
    entries.push({
      daysAgo: trip.daysAgo,
      entry: {
        id: `flight-${flight.id}`,
        kind: 'flight',
        date,
        title: `${origin?.city} to ${destination?.city}`,
        detail: `${flight.flightNumber} · ${FARE_NAMES[trip.fare]} fare · ${baseMiles.toLocaleString('en-US')} mi × ${multiplier}`,
        miles: earnedMiles(trip.from, trip.to, trip.fare),
        flight: { from: trip.from, to: trip.to, flightNumber: flight.flightNumber, fare: trip.fare, baseMiles, multiplier },
      },
    });
  }

  for (const extra of SAMPLE_EXTRAS) {
    const date = isoDate(addDays(now, -extra.daysAgo));
    entries.push({
      daysAgo: extra.daysAgo,
      entry: { id: `${extra.kind}-${date}-${extra.miles}`, kind: extra.kind, date, title: extra.title, detail: extra.detail, miles: extra.miles },
    });
  }

  return entries.sort((a, b) => a.daysAgo - b.daysAgo).map(({ entry }) => entry);
}

// Rewards

export type RewardKey = 'seat-upgrade' | 'checked-bag' | 'lounge-pass' | 'award-flight';

export type Reward = {
  key: RewardKey;
  name: string;
  description: string;
  /** Fixed price in miles; award flights are priced by route with awardFlightMiles(). */
  miles?: number;
};

export const REWARDS: Reward[] = [
  { key: 'seat-upgrade', name: 'Seat upgrade', description: 'Move up to an extra legroom seat on your next trip.', miles: 7_500 },
  { key: 'checked-bag', name: 'Free checked bag', description: 'One checked bag, any route, any fare.', miles: 2_500 },
  { key: 'lounge-pass', name: 'Lounge pass', description: 'A day in the FlyLo Lounge: snacks, coffee and quiet.', miles: 4_000 },
  { key: 'award-flight', name: 'One-way award flight', description: 'Fly anywhere FlyLo-Air flies, priced by distance.' },
];

export const AWARD_BANDS: { upToMiles: number; miles: number }[] = [
  { upToMiles: 700, miles: 7_500 },
  { upToMiles: 1_500, miles: 12_500 },
  { upToMiles: 2_500, miles: 17_500 },
  { upToMiles: Number.POSITIVE_INFINITY, miles: 22_500 },
];

/** Price of a one-way award seat in miles, or 0 when the route does not exist. */
export function awardFlightMiles(from: string, to: string): number {
  const distance = routeMiles(from, to);
  if (distance === 0) return 0;
  return AWARD_BANDS.find((band) => distance <= band.upToMiles)!.miles;
}

export function rewardCost(reward: Reward, route?: { from: string; to: string }): number {
  if (reward.key === 'award-flight') return route ? awardFlightMiles(route.from, route.to) : 0;
  return reward.miles ?? 0;
}

export type RedeemResult = { ok: true; entries: MilesEntry[]; entry: MilesEntry } | { ok: false; reason: string };

export function redeem(entries: MilesEntry[], reward: Reward, now: Date, route?: { from: string; to: string }): RedeemResult {
  const cost = rewardCost(reward, route);
  if (cost <= 0) return { ok: false, reason: 'Pick a valid route first.' };
  const balance = milesBalance(entries);
  if (cost > balance) return { ok: false, reason: `You need ${(cost - balance).toLocaleString('en-US')} more miles.` };

  let detail = reward.description;
  if (reward.key === 'award-flight' && route) {
    detail = `${findAirport(route.from)?.city} to ${findAirport(route.to)?.city} · one way`;
  }
  const date = isoDate(now);
  const entry: MilesEntry = {
    id: `redemption-${reward.key}-${now.getTime()}`,
    kind: 'redemption',
    date,
    title: reward.name,
    detail,
    miles: -cost,
  };
  return { ok: true, entries: [entry, ...entries], entry };
}

export function formatMiles(miles: number): string {
  return Math.round(miles).toLocaleString('en-US');
}
