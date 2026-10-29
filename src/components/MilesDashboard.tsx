'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BagIcon, CardIcon, CheckIcon, CoffeeIcon, GiftIcon, PlaneIcon, SeatIcon, SparkleIcon } from '@/components/icons';
import { ProgressRing, Sparkline, TierCard, useCountUp } from '@/components/MilesVisuals';
import { RedeemDialog } from '@/components/RedeemDialog';
import {
  ACTIVITY_FILTERS,
  REWARDS,
  SAMPLE_MEMBER,
  TIERS,
  TIER_BENEFITS,
  buildSampleHistory,
  filterEntries,
  formatMiles,
  milesBalance,
  monthlyEarned,
  qualifyingMiles,
  redeem,
  tierProgress,
  type ActivityFilter,
  type EntryKind,
  type MilesEntry,
  type Reward,
  type RewardKey,
} from '@/lib/miles';

const STORAGE_KEY = 'flylo-miles:sample-account';

const KIND_ICONS: Record<EntryKind, (props: { className?: string }) => React.ReactNode> = {
  flight: PlaneIcon,
  partner: CardIcon,
  promo: SparkleIcon,
  redemption: GiftIcon,
};

const KIND_LABELS: Record<EntryKind, string> = {
  flight: 'Flight',
  partner: 'Partner',
  promo: 'Bonus',
  redemption: 'Redeemed',
};

const REWARD_ICONS: Record<RewardKey, (props: { className?: string }) => React.ReactNode> = {
  'seat-upgrade': SeatIcon,
  'checked-bag': BagIcon,
  'lounge-pass': CoffeeIcon,
  'award-flight': PlaneIcon,
};

function isEntry(value: unknown): value is MilesEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
    typeof entry.title === 'string' &&
    typeof entry.detail === 'string' &&
    typeof entry.miles === 'number' &&
    Number.isFinite(entry.miles) &&
    ['flight', 'partner', 'promo', 'redemption'].includes(entry.kind as string)
  );
}

function loadSaved(): MilesEntry[] | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { version?: number; entries?: unknown };
    if (saved.version !== 1 || !Array.isArray(saved.entries) || !saved.entries.every(isEntry)) return null;
    return saved.entries;
  } catch {
    return null;
  }
}

function formatEntryDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function MilesDashboard({ nowIso }: { nowIso: string }) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [entries, setEntries] = useState<MilesEntry[]>(() => buildSampleHistory(now));
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [dialog, setDialog] = useState<{ open: boolean; reward: RewardKey }>({ open: false, reward: 'seat-upgrade' });
  const [status, setStatus] = useState('');
  const flashTimer = useRef<number | undefined>(undefined);
  const [flashId, setFlashId] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadSaved();
    if (saved) setEntries(saved);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, entries }));
    } catch {
      // Private browsing can block storage; the sample still works for this visit.
    }
  }, [entries, loaded]);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const balance = milesBalance(entries);
  const qualifying = qualifyingMiles(entries, now);
  const progress = tierProgress(qualifying);
  const months = monthlyEarned(entries, now);
  const visible = filterEntries(entries, filter);
  const shownBalance = useCountUp(balance, { duration: 1400 });
  const validThru = `12/${String(now.getUTCFullYear() + 1).slice(2)}`;

  function openRedeem(reward: RewardKey) {
    setDialog({ open: true, reward });
  }

  function handleRedeem(reward: Reward, route?: { from: string; to: string }) {
    const result = redeem(entries, reward, new Date(), route);
    if (result.ok) {
      setEntries(result.entries);
      setFilter('all');
      setFlashId(result.entry.id);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlashId(null), 4000);
      setStatus(`Redeemed ${formatMiles(-result.entry.miles)} miles for ${reward.name.toLowerCase()}. New balance ${formatMiles(balance + result.entry.miles)} miles.`);
    }
    return result;
  }

  function resetAccount() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore: the in-memory sample is reset below either way.
    }
    setEntries(buildSampleHistory(new Date()));
    setFilter('all');
    setStatus('Sample account reset. Maya is back to her original balance and history.');
  }

  return (
    <>
      <section className="miles-hero" aria-labelledby="miles-title">
        <div className="wrap miles-hero-grid">
          <div>
            <p className="eyebrow">FlyLo Miles · Sample member</p>
            <h1 id="miles-title">Welcome back, Maya</h1>
            <p className="lead">Fly more. Pay less. And earn miles on every single trip.</p>
            <dl className="miles-stats">
              <div>
                <dt>Miles balance</dt>
                <dd>
                  <span aria-hidden="true">{formatMiles(shownBalance)}</span>
                  <span className="visually-hidden">{formatMiles(balance)} miles</span>
                </dd>
              </div>
              <div>
                <dt>Tier</dt>
                <dd>{progress.tier.name}</dd>
              </div>
              <div>
                <dt>Member number</dt>
                <dd className="mono">{SAMPLE_MEMBER.number}</dd>
              </div>
            </dl>
            <div className="miles-hero-actions">
              <button type="button" className="btn btn-sun btn-lg" onClick={() => openRedeem('seat-upgrade')}>
                <GiftIcon className="btn-icon" />
                Redeem miles
              </button>
              <button type="button" className="btn btn-on-dark" onClick={resetAccount}>
                Reset sample account
              </button>
            </div>
            <p className="miles-status" role="status" aria-live="polite">
              {status}
            </p>
          </div>
          <TierCard tier={progress.tier} name={SAMPLE_MEMBER.name} number={SAMPLE_MEMBER.number} validThru={validThru} />
        </div>
      </section>

      <div className="wrap section">
        <div className="miles-grid">
          <section className="card miles-progress" aria-labelledby="progress-title">
            <h2 id="progress-title">Your tier progress</h2>
            <ProgressRing qualifying={qualifying} progress={progress} />
            <p className="miles-to-next">
              {progress.next ? (
                <>
                  <strong>{formatMiles(progress.toNext)} miles</strong> to {progress.next.name}
                </>
              ) : (
                <strong>You&apos;re at the top: {progress.tier.name}</strong>
              )}
            </p>
            <p className="muted miles-small">
              Qualifying miles from the last 12 months. Redeeming miles never lowers your tier.
            </p>
            <ol className="tier-ladder" aria-label="Tiers">
              {TIERS.map((tier) => {
                const reached = qualifying >= tier.threshold;
                return (
                  <li key={tier.key} data-tier={tier.key} data-reached={reached || undefined} aria-current={tier.key === progress.tier.key ? 'step' : undefined}>
                    <span className="tier-dot" aria-hidden="true">
                      {reached && <CheckIcon className="tier-check" />}
                    </span>
                    <span className="tier-name">{tier.name}</span>
                    <span className="tier-threshold">{tier.threshold === 0 ? 'Join free' : `${formatMiles(tier.threshold)} mi`}</span>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="card miles-activity" aria-labelledby="activity-title">
            <div className="card-head">
              <h2 id="activity-title">Activity</h2>
              <span className="muted miles-small">Earned in the last 12 months</span>
            </div>
            <Sparkline months={months} />
            <div className="activity-filters" role="group" aria-label="Filter activity">
              {ACTIVITY_FILTERS.map((item) => (
                <button key={item.key} type="button" className="filter-chip" aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>
                  {item.label}
                  <span className="filter-count">{filterEntries(entries, item.key).length}</span>
                </button>
              ))}
            </div>
            <ul className="activity-list" aria-label={`${ACTIVITY_FILTERS.find((item) => item.key === filter)?.label} activity`}>
              {visible.length === 0 && <li className="activity-empty muted">Nothing here yet. Your next trip is waiting.</li>}
              {visible.map((entry) => {
                const Icon = KIND_ICONS[entry.kind];
                return (
                  <li key={entry.id} className="activity-item" data-kind={entry.kind} data-flash={entry.id === flashId || undefined}>
                    <span className="activity-icon" aria-hidden="true">
                      <Icon className="btn-icon" />
                    </span>
                    <span className="activity-text">
                      <span className="activity-title">{entry.title}</span>
                      <span className="activity-detail">
                        <span className="activity-kind">{KIND_LABELS[entry.kind]}</span> · {formatEntryDate(entry.date)} · {entry.detail}
                      </span>
                    </span>
                    <span className="activity-miles" data-negative={entry.miles < 0 || undefined}>
                      {entry.miles > 0 ? '+' : '−'}
                      {formatMiles(Math.abs(entry.miles))}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <section className="section" aria-labelledby="rewards-title">
          <h2 id="rewards-title">Spend your miles</h2>
          <p className="muted">Real treats for a pretend account. Pick one and watch your balance go to work.</p>
          <div className="reward-grid">
            {REWARDS.map((reward) => {
              const Icon = REWARD_ICONS[reward.key];
              return (
                <div key={reward.key} className="card reward-card">
                  <span className="feature-icon">
                    <Icon className="btn-icon" />
                  </span>
                  <h3>{reward.name}</h3>
                  <p className="muted">{reward.description}</p>
                  <p className="reward-card-price">{reward.miles ? `${formatMiles(reward.miles)} miles` : 'From 7,500 miles'}</p>
                  <button type="button" className="btn btn-ghost" onClick={() => openRedeem(reward.key)} aria-label={`Redeem ${reward.name}`}>
                    Redeem
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <section className="section" aria-labelledby="benefits-title">
          <h2 id="benefits-title">Tier benefits</h2>
          <p className="muted">Earn 1 mile per mile flown on Basic, 1.5x on Main and 2x on Flex. You can see what each fare earns on every search.</p>
          <div className="card benefits-card">
            <table className="benefits-table">
              <caption className="visually-hidden">FlyLo Miles benefits by tier</caption>
              <thead>
                <tr>
                  <th scope="col">Benefit</th>
                  {TIERS.map((tier) => (
                    <th key={tier.key} scope="col" data-tier={tier.key} aria-current={tier.key === progress.tier.key ? 'true' : undefined}>
                      <span className="benefit-tier">{tier.name}</span>
                      <span className="benefit-threshold">{tier.threshold === 0 ? 'Join free' : `${formatMiles(tier.threshold)} mi`}</span>
                      {tier.key === progress.tier.key && <span className="benefit-you">You</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIER_BENEFITS.map((benefit) => (
                  <tr key={benefit.label}>
                    <th scope="row">{benefit.label}</th>
                    {TIERS.map((tier) => {
                      const value = benefit.values[tier.key];
                      return (
                        <td key={tier.key} data-current={tier.key === progress.tier.key || undefined}>
                          {value === true ? (
                            <>
                              <CheckIcon className="benefit-check" />
                              <span className="visually-hidden">Included</span>
                            </>
                          ) : value === false ? (
                            <>
                              <span aria-hidden="true" className="benefit-none">
                                —
                              </span>
                              <span className="visually-hidden">Not included</span>
                            </>
                          ) : (
                            value
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted miles-small" style={{ marginTop: '1rem' }}>
            FlyLo Miles is a sample program on a fictional airline. Miles, rewards and tiers are made up.{' '}
            <Link href="/">Search flights</Link> to see what you would earn.
          </p>
        </section>
      </div>

      <RedeemDialog
        open={dialog.open}
        initialReward={dialog.reward}
        balance={balance}
        onClose={() => setDialog((current) => ({ ...current, open: false }))}
        onRedeem={handleRedeem}
      />
    </>
  );
}
