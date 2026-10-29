'use client';

import { useEffect, useRef, useState } from 'react';
import { BagIcon, CheckIcon, CloseIcon, CoffeeIcon, PlaneIcon, SeatIcon } from '@/components/icons';
import { Confetti, useCountUp, usePrefersReducedMotion } from '@/components/MilesVisuals';
import { AIRPORTS } from '@/lib/airports';
import { defaultTravelDate } from '@/lib/dates';
import { formatTripDate, searchFlights } from '@/lib/flights';
import { REWARDS, formatMiles, rewardCost, type RedeemResult, type Reward, type RewardKey } from '@/lib/miles';

const REWARD_ICONS: Record<RewardKey, (props: { className?: string }) => React.ReactNode> = {
  'seat-upgrade': SeatIcon,
  'checked-bag': BagIcon,
  'lounge-pass': CoffeeIcon,
  'award-flight': PlaneIcon,
};

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Step = 'choose' | 'confirm' | 'done';

type Props = {
  open: boolean;
  initialReward: RewardKey;
  balance: number;
  onClose: () => void;
  onRedeem: (reward: Reward, route?: { from: string; to: string }) => RedeemResult;
};

export function RedeemDialog({ open, initialReward, balance, onClose, onRedeem }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      const opener = document.activeElement as HTMLElement | null;
      const scrollbar = window.innerWidth - document.documentElement.clientWidth;
      dialog.showModal();
      document.body.classList.add('has-modal');
      document.body.style.paddingRight = scrollbar > 0 ? `${scrollbar}px` : '';
      return () => {
        if (dialog.open) dialog.close();
        document.body.classList.remove('has-modal');
        document.body.style.paddingRight = '';
        opener?.focus();
      };
    }
  }, [open]);

  function trapFocus(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return;
    const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((item) => item.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="redeem-dialog"
      aria-labelledby="redeem-title"
      onKeyDown={trapFocus}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      {open && <RedeemFlow initialReward={initialReward} balance={balance} onClose={onClose} onRedeem={onRedeem} />}
    </dialog>
  );
}

function RedeemFlow({ initialReward, balance, onClose, onRedeem }: Omit<Props, 'open'>) {
  const [step, setStep] = useState<Step>('choose');
  const [rewardKey, setRewardKey] = useState<RewardKey>(initialReward);
  const [route, setRoute] = useState({ from: 'SFO', to: 'HNL' });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ before: number; after: number; reward: Reward; detail: string } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reduced = usePrefersReducedMotion();

  const reward = REWARDS.find((item) => item.key === rewardKey)!;
  const isAward = reward.key === 'award-flight';
  const cost = rewardCost(reward, isAward ? route : undefined);
  const affordable = cost > 0 && cost <= balance;
  const travelDate = defaultTravelDate();
  const awardFlight = isAward ? searchFlights(route.from, route.to, travelDate)[0] : undefined;
  const shownBalance = useCountUp(result?.after ?? balance, { from: result?.before ?? balance, duration: 1400 });

  useEffect(() => {
    if (step === 'choose') {
      document.getElementById(`reward-${rewardKey}`)?.focus();
    } else {
      headingRef.current?.focus();
    }
    // Focus moves only when the step changes, not when another reward is picked.
  }, [step]);

  function confirm() {
    const outcome = onRedeem(reward, isAward ? route : undefined);
    if (!outcome.ok) {
      setError(outcome.reason);
      return;
    }
    setResult({ before: balance, after: balance - cost, reward, detail: outcome.entry.detail });
    setStep('done');
  }

  const stepNumber = step === 'choose' ? 1 : step === 'confirm' ? 2 : 3;

  return (
    <div className="redeem-panel" data-step={step}>
      {step === 'done' && !reduced && <Confetti />}
      <div className="redeem-head">
        <p className="eyebrow">Redeem miles · Step {stepNumber} of 3</p>
        <button type="button" className="redeem-close" onClick={onClose} aria-label="Close">
          <CloseIcon className="btn-icon" />
        </button>
      </div>

      {step === 'choose' && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (affordable) setStep('confirm');
          }}
        >
          <h2 id="redeem-title" ref={headingRef} tabIndex={-1}>
            Choose a reward
          </h2>
          <p className="muted">
            You have <strong>{formatMiles(balance)} miles</strong> to spend. Redeeming never lowers your tier.
          </p>
          <fieldset className="reward-options">
            <legend className="visually-hidden">Rewards</legend>
            {REWARDS.map((item) => {
              const Icon = REWARD_ICONS[item.key];
              const price = item.key === 'award-flight' ? rewardCost(item, route) : rewardCost(item);
              const short = price > balance;
              return (
                <label key={item.key} className="reward-option" data-selected={item.key === rewardKey || undefined} data-short={short || undefined}>
                  <input
                    id={`reward-${item.key}`}
                    type="radio"
                    name="reward"
                    value={item.key}
                    checked={item.key === rewardKey}
                    onChange={() => {
                      setRewardKey(item.key);
                      setError(null);
                    }}
                  />
                  <span className="reward-icon">
                    <Icon className="btn-icon" />
                  </span>
                  <span className="reward-text">
                    <span className="reward-name">{item.name}</span>
                    <span className="reward-desc">{item.description}</span>
                  </span>
                  <span className="reward-price">
                    {item.key === 'award-flight' ? 'from 7,500' : formatMiles(price)}
                    <small>miles</small>
                  </span>
                </label>
              );
            })}
          </fieldset>

          {isAward && (
            <div className="award-picker">
              <div className="field">
                <label htmlFor="award-from">From</label>
                <select id="award-from" value={route.from} onChange={(event) => setRoute({ ...route, from: event.target.value })}>
                  {AIRPORTS.map((airport) => (
                    <option key={airport.code} value={airport.code}>
                      {airport.city} ({airport.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="award-to">To</label>
                <select id="award-to" value={route.to} onChange={(event) => setRoute({ ...route, to: event.target.value })}>
                  {AIRPORTS.map((airport) => (
                    <option key={airport.code} value={airport.code}>
                      {airport.city} ({airport.code})
                    </option>
                  ))}
                </select>
              </div>
              <p className="award-quote" aria-live="polite">
                {cost > 0 ? (
                  <>
                    <strong>{formatMiles(cost)} miles</strong> one way
                    {awardFlight && (
                      <span className="muted">
                        {' '}
                        · {awardFlight.flightNumber}, {formatTripDate(travelDate)} at {awardFlight.departs}
                      </span>
                    )}
                  </>
                ) : (
                  'Pick two different airports.'
                )}
              </p>
            </div>
          )}

          {cost > balance && <p className="field-error">You need {formatMiles(cost - balance)} more miles for this one. Keep flying!</p>}

          <div className="redeem-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={!affordable}>
              Continue
            </button>
          </div>
        </form>
      )}

      {step === 'confirm' && (
        <div>
          <h2 id="redeem-title" ref={headingRef} tabIndex={-1}>
            Confirm your reward
          </h2>
          <dl className="redeem-summary">
            <div>
              <dt>Reward</dt>
              <dd>
                {reward.name}
                {isAward && (
                  <span className="muted">
                    {' '}
                    · {AIRPORTS.find((a) => a.code === route.from)?.city} to {AIRPORTS.find((a) => a.code === route.to)?.city}
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt>Cost</dt>
              <dd>{formatMiles(cost)} miles</dd>
            </div>
            <div>
              <dt>Balance now</dt>
              <dd>{formatMiles(balance)} miles</dd>
            </div>
            <div className="redeem-summary-total">
              <dt>Balance after</dt>
              <dd>{formatMiles(balance - cost)} miles</dd>
            </div>
          </dl>
          <p className="muted">This is a sample account: nothing real is booked and no real miles move.</p>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div className="redeem-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setStep('choose')}>
              Back
            </button>
            <button type="button" className="btn btn-sun" onClick={confirm}>
              Redeem {formatMiles(cost)} miles
            </button>
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="redeem-done">
          <div className="success-icon">
            <CheckIcon className="btn-icon" />
          </div>
          <h2 id="redeem-title" ref={headingRef} tabIndex={-1}>
            Enjoy your {result.reward.name.toLowerCase()}!
          </h2>
          <p className="muted">{result.detail}</p>
          <p className="redeem-balance">
            <span className="redeem-balance-value" aria-hidden="true">
              {formatMiles(shownBalance)}
            </span>
            <span className="visually-hidden">
              New balance: {formatMiles(result.after)} miles, down from {formatMiles(result.before)}.
            </span>
            <span className="redeem-balance-unit" aria-hidden="true">
              miles left · −{formatMiles(result.before - result.after)}
            </span>
          </p>
          <p>Fly more. Pay less. Treat yourself.</p>
          <div className="redeem-actions" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn" onClick={onClose}>
              Back to my miles
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
