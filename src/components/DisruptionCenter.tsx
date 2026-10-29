'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AlertIcon, CalendarIcon, CheckIcon, ClockIcon, GiftIcon, HeadsetIcon, RefundIcon, RouteArt } from '@/components/icons';
import { OptionBar, ScheduleTimeline, optionSegments, type TimelineRow } from '@/components/RebookTimeline';
import { findAirport } from '@/lib/airports';
import { buildIcs } from '@/lib/calendar';
import { formatDuration, formatTripDate, type FareKey } from '@/lib/flights';
import { formatCents } from '@/lib/pricing';
import {
  formatClock,
  formatDelta,
  legTimes,
  visibleOptions,
  type Disruption,
  type RebookLeg,
  type RebookOption,
  type SortMode,
} from '@/lib/rebooking';

type Props = {
  flight: RebookLeg;
  fare: FareKey;
  fareNames: Record<FareKey, string>;
  passengers: number;
  disruption: Disruption;
  options: RebookOption[];
  refundCents: number;
  booking: { reference: string; travelers: string[] } | null;
};

type Sheet = { type: 'rebook'; option: RebookOption } | { type: 'refund' } | { type: 'credit' };

type Outcome =
  | { type: 'rebooked'; option: RebookOption; confirmation: string }
  | { type: 'refund'; reference: string }
  | { type: 'credit'; code: string };

const SORTS: Array<{ value: SortMode; label: string }> = [
  { value: 'best', label: 'Best match' },
  { value: 'earliest', label: 'Earliest arrival' },
  { value: 'fewest', label: 'Fewest stops' },
];

const PROCESSING_MS = 1100;

export function DisruptionCenter({ flight, fare, fareNames, passengers, disruption, options, refundCents, booking }: Props) {
  const [sort, setSort] = useState<SortMode>('best');
  const [sameDayOnly, setSameDayOnly] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const outcomeRef = useRef<HTMLHeadingElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (!outcome) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    outcomeRef.current?.focus({ preventScroll: true });
  }, [outcome]);

  const base = flight.date;
  const original = legTimes(flight, base);
  const canceled = disruption.kind === 'canceled';
  const pool = sameDayOnly ? options.filter((option) => option.sameDay) : options;
  const shown = visibleOptions(options, { sort, sameDayOnly });
  const bestId = pool[0]?.id;
  const best = options[0];
  const creditCents = Math.round(refundCents * 1.1);
  const travelersLabel = booking ? booking.travelers.join(', ') : `${passengers} ${passengers === 1 ? 'traveler' : 'travelers'}`;
  const city = (code: string) => findAirport(code)?.city ?? code;
  const status = canceled ? 'canceled' : `delayed ${formatDuration(disruption.delayMinutes)}`;

  const timelineRows: TimelineRow[] = [
    {
      key: 'original',
      label: 'Original',
      detail: `${flight.flightNumber} · ${flight.departs} to ${flight.arrives}`,
      tone: canceled ? 'canceled' : 'original',
      segments: [{ start: original.departAt, end: original.arriveAt, kind: 'flight' }],
    },
  ];
  if (!canceled) {
    timelineRows.push({
      key: 'new',
      label: 'New time',
      detail: `${flight.flightNumber} · ${formatClock(original.departAt + disruption.delayMinutes)} to ${formatClock(original.arriveAt + disruption.delayMinutes)}`,
      tone: 'new',
      segments: [{ start: original.departAt + disruption.delayMinutes, end: original.arriveAt + disruption.delayMinutes, kind: 'flight' }],
      badge: `+${formatDuration(disruption.delayMinutes)}`,
    });
  } else if (best) {
    timelineRows.push({
      key: 'best',
      label: 'Best match',
      detail: `${flightNumbers(best)} · ${best.departs} to ${best.arrives}`,
      tone: 'new',
      segments: optionSegments(best, base),
      badge: shortDelta(best.arrivalDeltaMinutes),
    });
  }
  const timelineSummary = canceled
    ? `Original schedule: ${flight.flightNumber} departing ${flight.departs}, arriving ${flight.arrives}, now canceled.` +
      (best ? ` Best match: ${flightNumbers(best)} departing ${best.departs}, arriving ${best.arrives}, ${formatDelta(best.arrivalDeltaMinutes)}.` : '')
    : `Original schedule: departs ${flight.departs}, arrives ${flight.arrives}. New schedule: departs ${formatClock(original.departAt + disruption.delayMinutes)}, arrives ${formatClock(original.arriveAt + disruption.delayMinutes)}.`;

  const closeSheet = () => {
    if (!pending) setSheet(null);
  };

  const confirm = () => {
    if (!sheet || pending) return;
    const current = sheet;
    setPending(true);
    setAnnouncement(
      current.type === 'rebook'
        ? `Rebooking you on ${flightNumbers(current.option)}…`
        : current.type === 'refund'
          ? 'Requesting your refund…'
          : 'Creating your travel credit…',
    );
    timer.current = window.setTimeout(() => {
      let next: Outcome;
      if (current.type === 'rebook') {
        next = { type: 'rebooked', option: current.option, confirmation: `FLY-${randomDigits(5)}` };
        setAnnouncement(
          `You're rebooked on ${flightNumbers(current.option)}, departing ${formatTripDate(current.option.date)} at ${current.option.departs}. ` +
            `New confirmation number ${next.confirmation}. No charge.`,
        );
      } else if (current.type === 'refund') {
        next = { type: 'refund', reference: `RF-${randomDigits(6)}` };
        setAnnouncement(`Refund requested: ${formatCents(refundCents)} back to your original payment. Reference ${next.reference}.`);
      } else {
        next = { type: 'credit', code: `FLYC-${randomCode(4)}-${randomCode(4)}` };
        setAnnouncement(`Travel credit created: ${formatCents(creditCents)}. Code ${next.code}.`);
      }
      setOutcome(next);
      setPending(false);
      setSheet(null);
    }, PROCESSING_MS);
  };

  const startOver = () => {
    setOutcome(null);
    setAnnouncement('Back to your options.');
  };

  const downloadCalendar = (option: RebookOption, confirmation: string) => {
    const ics = buildIcs({ confirmation, legs: option.legs, travelers: passengers });
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `flylo-air-${confirmation}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setAnnouncement(`Calendar file for ${confirmation} downloaded.`);
  };

  return (
    <>
      <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      {outcome ? (
        <OutcomeView
          outcome={outcome}
          headingRef={outcomeRef}
          flight={flight}
          fare={fare}
          fareNames={fareNames}
          travelersLabel={travelersLabel}
          booking={booking}
          canceled={canceled}
          refundCents={refundCents}
          creditCents={creditCents}
          onCalendar={downloadCalendar}
          onStartOver={startOver}
        />
      ) : (
        <>
          <section className="dis-hero" aria-labelledby="dis-title">
            <RouteArt className="hero-plane" />
            <div className="wrap">
              <p className="eyebrow">{booking ? `Manage trip · Booking ${booking.reference}` : 'Manage trip · Sample trip'}</p>
              <div className="dis-alert" data-kind={disruption.kind}>
                <span className="dis-alert-icon" aria-hidden="true">
                  {canceled ? <AlertIcon className="btn-icon" /> : <ClockIcon className="btn-icon" />}
                </span>
                <div>
                  <p className="dis-pill">{canceled ? 'Flight canceled' : 'Flight delayed'}</p>
                  <h1 id="dis-title">
                    Your flight {flight.flightNumber} {flight.from} to {flight.to} is {status}
                  </h1>
                  <p className="dis-lead">
                    {canceled
                      ? `This is due to ${disruption.reason}. We're sorry. Pick any flight below: rebooking is free and the fare difference is on us.`
                      : `This is due to ${disruption.reason}. Your seat is still yours, so you don't need to do anything. If the new time doesn't work, switch for free below.`}
                  </p>
                  <ul className="dis-facts">
                    <li>{formatTripDate(flight.date)}</li>
                    <li>
                      {city(flight.from)} to {city(flight.to)}
                    </li>
                    <li>{travelersLabel}</li>
                    <li>{fareNames[fare]} fare</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <div className="wrap">
            <section className="card dis-timeline" aria-labelledby="timeline-title">
              <div className="card-head">
                <h2 id="timeline-title">{canceled ? 'Your schedule, then and now' : 'Your new schedule'}</h2>
                <p className="muted">{canceled ? 'Original flight against our best match' : `Departs ${formatDuration(disruption.delayMinutes)} later than planned`}</p>
              </div>
              <ScheduleTimeline base={base} rows={timelineRows} summary={timelineSummary} />
            </section>

            <section className="section" aria-labelledby="options-title">
              <div className="options-head">
                <div>
                  <p className="eyebrow">{canceled ? 'Free rebooking' : 'Or switch flights, free'}</p>
                  <h2 id="options-title">{canceled ? 'Pick a new flight' : 'Other flights that might suit you better'}</h2>
                  <p className="muted">
                    Same route over the next three days, nonstop or through Chicago, Denver or Atlanta. Ranked by arrival time, stops, layover and fare.
                  </p>
                </div>
              </div>

              <div className="options-toolbar">
                <fieldset className="seg">
                  <legend>Sort by</legend>
                  <div className="seg-options">
                    {SORTS.map((option) => (
                      <label key={option.value} className="seg-option">
                        <input
                          type="radio"
                          name="rebook-sort"
                          value={option.value}
                          checked={sort === option.value}
                          onChange={() => setSort(option.value)}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="toggle">
                  <input type="checkbox" role="switch" checked={sameDayOnly} onChange={(event) => setSameDayOnly(event.target.checked)} />
                  <span className="toggle-track" aria-hidden="true" />
                  Same day only ({formatTripDate(base)})
                </label>
                <p className="options-count" aria-live="polite">
                  Showing {shown.length} of {pool.length} {sameDayOnly ? 'same-day ' : ''}options
                </p>
              </div>

              {shown.length === 0 ? (
                <div className="card empty-state">
                  <h3>No same-day flights left</h3>
                  <p className="muted">Turn off &ldquo;Same day only&rdquo; to see flights over the next two days.</p>
                </div>
              ) : (
                <ol className="rebook-list" key={`${sort}-${sameDayOnly}`}>
                  {shown.map((option, index) => (
                    <OptionCard
                      key={option.id}
                      option={option}
                      index={index}
                      base={base}
                      originalArrival={original.arriveAt}
                      isBest={option.id === bestId}
                      fare={fare}
                      fareNames={fareNames}
                      onRebook={() => setSheet({ type: 'rebook', option })}
                    />
                  ))}
                </ol>
              )}
            </section>

            <section className="section" aria-labelledby="other-title">
              <p className="eyebrow">Not flying after all?</p>
              <h2 id="other-title">Other ways we can make it right</h2>
              <div className="grid-3 extra-options">
                <div className="card extra-option">
                  <div className="feature-icon">
                    <RefundIcon className="btn-icon" />
                  </div>
                  <h3>Get a refund to original payment</h3>
                  <p className="extra-amount">{formatCents(refundCents)}</p>
                  <p className="muted">The full fare for {travelersLabel}, back where it came from.</p>
                  <button className="btn btn-ghost" type="button" onClick={() => setSheet({ type: 'refund' })}>
                    Get a refund
                  </button>
                </div>
                <div className="card extra-option is-featured">
                  <span className="extra-tag">+10% bonus</span>
                  <div className="feature-icon">
                    <GiftIcon className="btn-icon" />
                  </div>
                  <h3>Get a travel credit +10%</h3>
                  <p className="extra-amount">{formatCents(creditCents)}</p>
                  <p className="muted">Your fare plus 10% on us, for any FlyLo-Air flight in the next 12 months.</p>
                  <button className="btn" type="button" onClick={() => setSheet({ type: 'credit' })}>
                    Get a travel credit
                  </button>
                </div>
                <div className="card extra-option">
                  <div className="feature-icon">
                    <HeadsetIcon className="btn-icon" />
                  </div>
                  <h3>Talk it through</h3>
                  <p className="muted">Our support team picks up, and can help with anything this page can&apos;t.</p>
                  <p className="extra-link">
                    <Link href="/support/">Need a person?</Link>
                  </p>
                </div>
              </div>
            </section>
          </div>
        </>
      )}

      <ConfirmSheet open={sheet !== null} pending={pending} onClose={closeSheet} onConfirm={confirm} sheet={sheet}>
        {sheet?.type === 'rebook' && (
          <RebookSheetBody option={sheet.option} flight={flight} fare={fare} fareNames={fareNames} travelersLabel={travelersLabel} />
        )}
        {sheet?.type === 'refund' && (
          <>
            <p className="sheet-amount">{formatCents(refundCents)}</p>
            <p>
              Back to your original payment for {travelersLabel}. It usually shows up in 5 to 7 business days, and your seats on{' '}
              {flight.flightNumber} are released.
            </p>
          </>
        )}
        {sheet?.type === 'credit' && (
          <>
            <p className="sheet-amount">{formatCents(creditCents)}</p>
            <ul className="sheet-lines">
              <li>
                <span>Your fare</span>
                <span>{formatCents(refundCents)}</span>
              </li>
              <li>
                <span>Bonus from FlyLo-Air (10%)</span>
                <span>+{formatCents(creditCents - refundCents)}</span>
              </li>
            </ul>
            <p>Good on any FlyLo-Air flight for 12 months, for anyone you like. Your seats on {flight.flightNumber} are released.</p>
          </>
        )}
        <p className="sheet-sample">Sample only: nothing is charged, refunded or booked.</p>
      </ConfirmSheet>
    </>
  );
}

function OptionCard({
  option,
  index,
  base,
  originalArrival,
  isBest,
  fare,
  fareNames,
  onRebook,
}: {
  option: RebookOption;
  index: number;
  base: string;
  originalArrival: number;
  isBest: boolean;
  fare: FareKey;
  fareNames: Record<FareKey, string>;
  onRebook: () => void;
}) {
  const id = `option-${index}`;
  const last = option.legs[option.legs.length - 1];
  const nextDay = option.arrivalDate !== option.date;
  const deltaTone = option.arrivalDeltaMinutes <= 5 ? 'good' : option.arrivalDeltaMinutes <= 120 ? 'mild' : 'late';
  const viaCity = option.via ? (findAirport(option.via)?.city ?? option.via) : null;
  const stopsLabel =
    option.stops === 0 ? 'Nonstop' : `${option.stops} ${option.stops === 1 ? 'stop' : 'stops'}${viaCity ? ` · ${formatDuration(option.layoverMinutes)} in ${viaCity}` : ''}`;

  return (
    <li className="rebook-item" style={{ '--i': index } as CSSProperties}>
      <article className={`card rebook-card${isBest ? ' is-best' : ''}`} aria-labelledby={`${id}-title`} aria-describedby={`${id}-details`}>
        {isBest && <p className="ribbon">Best match</p>}
        <div className="rebook-card-head">
          <p className="rebook-date">
            {formatTripDate(option.date)}
            {option.sameDay && <span className="rebook-sameday">Same day</span>}
          </p>
          <p className="rebook-score">
            <strong>{option.score}</strong>
            <span>% match</span>
          </p>
        </div>

        <h3 id={`${id}-title`} className="rebook-times">
          <span className="rebook-time">
            {option.departs}
            <small>{option.legs[0].from}</small>
          </span>
          <span className="rebook-arrow" aria-hidden="true">
            <span />
          </span>
          <span className="visually-hidden"> to </span>
          <span className="rebook-time rebook-time-end">
            {option.arrives}
            {nextDay && (
              <sup>
                {' '}+1<span className="visually-hidden"> next day</span>
              </sup>
            )}
            <small>{last.to}</small>
          </span>
          <span className="visually-hidden">, {formatTripDate(option.date)}, {flightNumbers(option)}</span>
        </h3>

        <OptionBar option={option} base={base} originalArrival={originalArrival} />

        <ul className="badges" id={`${id}-details`}>
          <li className="badge" data-tone={deltaTone}>
            {capitalize(formatDelta(option.arrivalDeltaMinutes))}
          </li>
          <li className="badge" data-tone={option.stops === 0 ? 'good' : 'neutral'}>
            {stopsLabel}
          </li>
          <li className="badge" data-tone={option.sameFareAvailable ? 'good' : 'sun'}>
            {option.sameFareAvailable ? `${fareNames[fare]} seats available` : `${fareNames[fare]} full · ${fareNames[option.seatFare]} on us`}
          </li>
        </ul>

        <p className="rebook-meta">
          {flightNumbers(option)} · {formatDuration(option.totalMinutes)} total · {option.legs[0].aircraft}
        </p>

        <button className="btn rebook-btn" type="button" onClick={onRebook} aria-describedby={`${id}-title ${id}-details`}>
          Rebook on this flight
        </button>
      </article>
    </li>
  );
}

function ConfirmSheet({
  open,
  pending,
  sheet,
  onClose,
  onConfirm,
  children,
}: {
  open: boolean;
  pending: boolean;
  sheet: Sheet | null;
  onClose: () => void;
  onConfirm: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const lastSheet = useRef<Sheet | null>(sheet);
  if (sheet) lastSheet.current = sheet;
  const shown = sheet ?? lastSheet.current;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      confirmRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const title =
    shown?.type === 'rebook'
      ? `Rebook on ${flightNumbers(shown.option)}?`
      : shown?.type === 'refund'
        ? 'Get a refund to your original payment?'
        : 'Get a travel credit worth 10% more?';
  const action =
    shown?.type === 'rebook' ? 'Confirm rebooking' : shown?.type === 'refund' ? 'Request refund' : 'Get my travel credit';
  const pendingLabel = shown?.type === 'rebook' ? 'Rebooking…' : shown?.type === 'refund' ? 'Requesting…' : 'Creating credit…';

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      aria-labelledby="sheet-title"
      aria-describedby="sheet-body"
      aria-busy={pending}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="sheet-panel">
        <p className="eyebrow">{shown?.type === 'rebook' ? 'Confirm your new flight' : 'Confirm'}</p>
        <h2 id="sheet-title">{title}</h2>
        <div id="sheet-body" className="sheet-body">
          {children}
        </div>
        <div className="sheet-actions">
          <button ref={confirmRef} className="btn btn-lg" type="button" onClick={onConfirm} disabled={pending}>
            {pending ? (
              <>
                <span className="spinner" aria-hidden="true" /> {pendingLabel}
              </>
            ) : (
              action
            )}
          </button>
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={pending}>
            Keep looking
          </button>
        </div>
      </div>
    </dialog>
  );
}

function RebookSheetBody({
  option,
  flight,
  fare,
  fareNames,
  travelersLabel,
}: {
  option: RebookOption;
  flight: RebookLeg;
  fare: FareKey;
  fareNames: Record<FareKey, string>;
  travelersLabel: string;
}) {
  return (
    <>
      <div className="sheet-itinerary">
        {option.legs.map((leg) => (
          <div key={leg.id} className="sheet-leg">
            <strong>
              {leg.departs} {leg.from} → {leg.arrives} {leg.to}
            </strong>
            <span>
              {leg.flightNumber} · {formatTripDate(leg.date)} · {formatDuration(leg.durationMinutes)}
            </span>
          </div>
        ))}
        {option.via && <p className="sheet-layover">{formatDuration(option.layoverMinutes)} layover in {findAirport(option.via)?.city ?? option.via}</p>}
      </div>
      <ul className="sheet-lines">
        <li>
          <span>Travelers</span>
          <span>{travelersLabel}</span>
        </li>
        <li>
          <span>Seats</span>
          <span>
            {fareNames[option.seatFare]}
            {option.seatFare !== fare && ' (upgrade on us)'}
          </span>
        </li>
        <li>
          <span>Fare difference</span>
          <span>Waived</span>
        </li>
        <li>
          <span>Change fee</span>
          <span>{formatCents(0)}</span>
        </li>
        <li className="sheet-total">
          <span>Due today</span>
          <span>{formatCents(0)}</span>
        </li>
      </ul>
      <p className="sheet-note">
        <span className="no-charge">No charge</span> Your seats on {flight.flightNumber} are swapped for these. {capitalize(formatDelta(option.arrivalDeltaMinutes))} than your original
        flight.
      </p>
    </>
  );
}

function OutcomeView({
  outcome,
  headingRef,
  flight,
  fare,
  fareNames,
  travelersLabel,
  booking,
  canceled,
  refundCents,
  creditCents,
  onCalendar,
  onStartOver,
}: {
  outcome: Outcome;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  flight: RebookLeg;
  fare: FareKey;
  fareNames: Record<FareKey, string>;
  travelersLabel: string;
  booking: Props['booking'];
  canceled: boolean;
  refundCents: number;
  creditCents: number;
  onCalendar: (option: RebookOption, confirmation: string) => void;
  onStartOver: () => void;
}) {
  const heading =
    outcome.type === 'rebooked'
      ? `You're rebooked on ${flightNumbers(outcome.option)}`
      : outcome.type === 'refund'
        ? 'Your refund is on its way'
        : 'Your travel credit is ready';
  const label = outcome.type === 'rebooked' ? 'New confirmation number' : outcome.type === 'refund' ? 'Refund reference' : 'Travel credit code';
  const code = outcome.type === 'rebooked' ? outcome.confirmation : outcome.type === 'refund' ? outcome.reference : outcome.code;

  return (
    <>
      <section className="page-head dis-resolved-head">
        <div className="wrap">
          <p className="eyebrow">{booking ? `Booking ${booking.reference} · All sorted` : 'Sample trip · All sorted'}</p>
          <h1 ref={headingRef} tabIndex={-1}>
            {heading}
          </h1>
          <p>Thanks for your patience. Fly more. Pay less. Worry less.</p>
        </div>
      </section>
      <div className="wrap section">
        <div className="card success outcome-card">
          <div className="outcome-check" aria-hidden="true">
            <svg viewBox="0 0 52 52">
              <circle cx="26" cy="26" r="24" />
              <path d="M15 27l7 7 15-16" />
            </svg>
          </div>
          <p className="muted outcome-label">{label}</p>
          <p className="ref outcome-ref">{code}</p>
          {outcome.type === 'rebooked' && (
            <p>
              {formatTripDate(outcome.option.date)} · {outcome.option.departs} {outcome.option.legs[0].from} to {outcome.option.arrives}{' '}
              {outcome.option.legs[outcome.option.legs.length - 1].to} · {travelersLabel}. No charge, fare difference waived.
            </p>
          )}
          {outcome.type === 'refund' && (
            <p>
              <strong>{formatCents(refundCents)}</strong> back to your original payment in 5 to 7 business days. We&apos;ll email you when it lands.
            </p>
          )}
          {outcome.type === 'credit' && (
            <p>
              <strong>{formatCents(creditCents)}</strong> to spend on any FlyLo-Air flight in the next 12 months. That&apos;s your fare plus{' '}
              {formatCents(creditCents - refundCents)} on us.
            </p>
          )}
          <div className="inline-actions">
            {outcome.type === 'rebooked' && (
              <button className="btn" type="button" onClick={() => onCalendar(outcome.option, outcome.confirmation)}>
                <CalendarIcon className="btn-icon" />
                Add to calendar
              </button>
            )}
            {outcome.type === 'credit' && (
              <Link className="btn" href="/">
                Book with your credit
              </Link>
            )}
            <button className="btn btn-ghost" type="button" onClick={onStartOver}>
              Choose a different option
            </button>
          </div>
          <p className="sheet-sample">Sample only: this is a fictional airline, so nothing was charged, refunded or booked.</p>
        </div>

        {outcome.type === 'rebooked' && (
          <ItineraryDiff option={outcome.option} flight={flight} fare={fare} fareNames={fareNames} canceled={canceled} />
        )}

        <p className="outcome-help">
          <HeadsetIcon className="btn-icon" /> <Link href="/support/">Need a person?</Link> Our support team picks up.
        </p>
      </div>
    </>
  );
}

function ItineraryDiff({
  option,
  flight,
  fare,
  fareNames,
  canceled,
}: {
  option: RebookOption;
  flight: RebookLeg;
  fare: FareKey;
  fareNames: Record<FareKey, string>;
  canceled: boolean;
}) {
  const last = option.legs[option.legs.length - 1];
  const rows: Array<{ label: string; before: string; after: string; note?: string }> = [
    { label: 'Status', before: canceled ? 'Canceled' : 'Delayed', after: 'Confirmed' },
    { label: 'Flight', before: flight.flightNumber, after: flightNumbers(option) },
    { label: 'Date', before: formatTripDate(flight.date), after: formatTripDate(option.date) },
    { label: 'Departs', before: `${flight.departs} ${flight.from}`, after: `${option.departs} ${option.legs[0].from}` },
    {
      label: 'Arrives',
      before: `${flight.arrives} ${flight.to}`,
      after: `${option.arrives} ${last.to}${option.arrivalDate !== option.date ? ' (+1)' : ''}`,
      note: formatDelta(option.arrivalDeltaMinutes),
    },
    {
      label: 'Route',
      before: flight.stops === 0 ? 'Nonstop' : '1 stop',
      after: option.via ? `1 stop via ${option.via}, ${formatDuration(option.layoverMinutes)} layover` : option.stops === 0 ? 'Nonstop' : `${option.stops} stop`,
    },
    { label: 'Seats', before: fareNames[fare], after: fareNames[option.seatFare], note: option.seatFare !== fare ? 'upgrade on us' : undefined },
    { label: 'Cost', before: 'Paid', after: `${formatCents(0)} · fare difference waived` },
  ];

  return (
    <section className="card diff-card" aria-labelledby="diff-title">
      <div className="card-head">
        <h2 id="diff-title">What changed</h2>
        <p className="muted">Before and after</p>
      </div>
      <table className="diff">
        <caption className="visually-hidden">Your itinerary before and after rebooking</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">Detail</span>
            </th>
            <th scope="col">Before</th>
            <th scope="col">After</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const changed = row.before !== row.after;
            return (
              <tr key={row.label} data-changed={changed} style={{ '--i': index } as CSSProperties}>
                <th scope="row">{row.label}</th>
                <td className="diff-before">{changed ? <del>{row.before}</del> : row.before}</td>
                <td className="diff-after">
                  {changed ? <ins>{row.after}</ins> : row.after}
                  {row.note && <span className="diff-note">{row.note}</span>}
                  {changed && <CheckIcon className="diff-check" />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function flightNumbers(option: RebookOption): string {
  return option.legs.map((leg) => leg.flightNumber).join(' + ');
}

function shortDelta(minutes: number): string {
  if (Math.abs(minutes) < 5) return 'On time';
  return `${minutes > 0 ? '+' : '−'}${formatDuration(Math.abs(minutes))}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function randomDigits(length: number): string {
  return Array.from({ length }, (_, i) => String(Math.floor(Math.random() * (i === 0 ? 9 : 10)) + (i === 0 ? 1 : 0))).join('');
}

function randomCode(length: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}
