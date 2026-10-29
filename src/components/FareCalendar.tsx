'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { FareTrendChart } from '@/components/FareTrendChart';
import { CalendarIcon, ChevronIcon } from '@/components/icons';
import { findAirport } from '@/lib/airports';
import {
  TREND_DAYS,
  calendarMonths,
  cheapestDays,
  clampMonth,
  compareToSelected,
  dateRange,
  dayAriaLabel,
  dayLabel,
  daysInMonth,
  fareStats,
  formatDollars,
  heatLevel,
  lowestFareForDay,
  lowestFaresByDay,
  monthDates,
  monthOf,
  monthWeeks,
  shiftDate,
  shiftDateByMonths,
  shiftMonth,
  weekday,
  type DayFare,
} from '@/lib/fare-calendar';
import { formatDuration } from '@/lib/flights';
import { formatCents } from '@/lib/pricing';

type Props = {
  from: string;
  to: string;
  date: string;
  passengers: number;
  today: string;
  headingLevel?: 2 | 3;
  keepScroll?: boolean;
};

type Slide = 'next' | 'prev' | null;

const WEEKDAYS = [
  ['Sun', 'Sunday'],
  ['Mon', 'Monday'],
  ['Tue', 'Tuesday'],
  ['Wed', 'Wednesday'],
  ['Thu', 'Thursday'],
  ['Fri', 'Friday'],
  ['Sat', 'Saturday'],
] as const;

function monthTitle(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function FareCalendar({ from, to, date, passengers, today, headingLevel = 2, keepScroll = false }: Props) {
  const router = useRouter();
  const id = useId();
  const origin = findAirport(from);
  const destination = findAirport(to);
  const valid = Boolean(origin && destination && origin.code !== destination.code);
  const range = calendarMonths(today, date);

  const [month, setMonth] = useState(() => clampMonth(monthOf(date), range));
  const [slide, setSlide] = useState<Slide>(null);
  const [seenDate, setSeenDate] = useState(date);
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const [tipDate, setTipDate] = useState<string | null>(null);
  const focusPending = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);

  if (seenDate !== date) {
    setSeenDate(date);
    const target = clampMonth(monthOf(date), range);
    if (target !== month) {
      setSlide(target > month ? 'next' : 'prev');
      setMonth(target);
    }
  }

  const monthFares = useMemo(() => {
    const fares = valid ? lowestFaresByDay(from, to, monthDates(month)) : [];
    return new Map(fares.map((fare) => [fare.date, fare]));
  }, [valid, from, to, month]);
  const upcoming = useMemo(() => (valid ? lowestFaresByDay(from, to, dateRange(today, TREND_DAYS)) : []), [valid, from, to, today]);
  const selected = useMemo(() => (valid ? lowestFareForDay(from, to, date) : null), [valid, from, to, date]);

  const bookable = [...monthFares.values()].filter((fare) => fare.date >= today);
  const monthStats = fareStats(bookable);
  const ranks = new Map(bookable.length > 3 ? cheapestDays(bookable, 3).map((fare, index) => [fare.date, index + 1]) : []);
  const deals = cheapestDays(upcoming, 5);
  const upcomingStats = fareStats(upcoming);

  const days = monthDates(month);
  const rovingDate =
    focusDate && monthOf(focusDate) === month ? focusDate : monthOf(date) === month ? date : (days.find((day) => day >= today) ?? days[0]);

  useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    viewportRef.current?.querySelector<HTMLElement>(`[data-date="${rovingDate}"]`)?.focus();
  }, [rovingDate, month]);

  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const SubHeading = headingLevel === 2 ? 'h3' : 'h4';

  if (!valid || !origin || !destination) {
    return (
      <section className="card fare-calendar fc-empty-state">
        <CalendarIcon className="btn-icon" />
        <p className="muted">Pick two different airports to see the cheapest days to fly.</p>
      </section>
    );
  }

  const firstDay = `${range.first}-01`;
  const lastDay = `${range.last}-${String(daysInMonth(range.last)).padStart(2, '0')}`;
  const href = (day: string) => `/results?from=${origin.code}&to=${destination.code}&date=${day}&passengers=${passengers}`;

  function goToMonth(target: string) {
    const next = clampMonth(target, range);
    if (next === month) return;
    setSlide(next > month ? 'next' : 'prev');
    setMonth(next);
    setTipDate(null);
  }

  function moveFocus(target: string) {
    const day = target < firstDay ? firstDay : target > lastDay ? lastDay : target;
    if (monthOf(day) !== month) goToMonth(monthOf(day));
    setFocusDate(day);
    focusPending.current = true;
  }

  function onDayKeyDown(event: KeyboardEvent<HTMLElement>, day: string, canBook: boolean) {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => shiftDate(day, -1),
      ArrowRight: () => shiftDate(day, 1),
      ArrowUp: () => shiftDate(day, -7),
      ArrowDown: () => shiftDate(day, 7),
      Home: () => shiftDate(day, -weekday(day)),
      End: () => shiftDate(day, 6 - weekday(day)),
      PageUp: () => shiftDateByMonths(day, -1),
      PageDown: () => shiftDateByMonths(day, 1),
    };
    if (event.key === 'Escape') {
      setTipDate(null);
      return;
    }
    if (event.key === ' ' && canBook) {
      event.preventDefault();
      router.push(href(day), { scroll: !keepScroll });
      return;
    }
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    moveFocus(move());
  }

  function renderDay(day: string, column: number) {
    const fare = monthFares.get(day) ?? null;
    const past = day < today;
    const canBook = !past && fare !== null;
    const rank = canBook ? ranks.get(day) : undefined;
    const isSelected = day === date;
    const isToday = day === today;
    const tipId = `${id}-tip-${day}`;
    const label = dayAriaLabel(day, fare, { past, today: isToday, rank });
    const className = ['fc-day', past && 'is-past', !fare && 'is-empty', isSelected && 'is-selected', isToday && 'is-today', rank && 'is-deal']
      .filter(Boolean)
      .join(' ');
    const style = canBook ? ({ '--heat': `${Math.round(heatLevel(fare.cents, monthStats) * 100)}%` } as CSSProperties) : undefined;
    const common = {
      className,
      style,
      'data-date': day,
      tabIndex: day === rovingDate ? 0 : -1,
      'aria-label': label,
      onFocus: () => {
        setFocusDate(day);
        setTipDate(day);
      },
      onBlur: () => setTipDate((current) => (current === day ? null : current)),
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => onDayKeyDown(event, day, canBook),
    };
    const body = (
      <>
        <span className="fc-date" aria-hidden="true">
          {Number(day.slice(8, 10))}
        </span>
        {rank && (
          <span className="fc-badge" aria-hidden="true">
            #{rank}
          </span>
        )}
        <span className="fc-price" aria-hidden="true">
          {past ? '' : fare ? formatDollars(fare.cents) : '—'}
        </span>
      </>
    );

    return (
      <td
        key={day}
        role="gridcell"
        aria-selected={isSelected}
        className="fc-cell"
        onMouseEnter={() => setTipDate(day)}
        onMouseLeave={() => setTipDate((current) => (current === day ? null : current))}
      >
        {canBook ? (
          <Link {...common} href={href(day)} prefetch={false} scroll={!keepScroll} aria-describedby={tipId}>
            {body}
          </Link>
        ) : (
          <span {...common} aria-disabled="true">
            {body}
          </span>
        )}
        {fare && !past && (
          <div role="tooltip" id={tipId} className={`fc-tip${column === 0 ? ' is-start' : column === 6 ? ' is-end' : ''}`} hidden={tipDate !== day}>
            <strong>{dayLabel(day)}</strong>
            <span>
              Cheapest: {fare.flight.flightNumber}, departs {fare.flight.departs}
            </span>
            <span>
              {fare.flight.stops === 0 ? 'Nonstop' : '1 stop'} · {formatDuration(fare.flight.durationMinutes)}
            </span>
            <span className="fc-tip-price">
              {formatCents(fare.cents)} <small>per traveler</small>
            </span>
          </div>
        )}
      </td>
    );
  }

  return (
    <section className="card fare-calendar" aria-labelledby={`${id}-heading`}>
      <header className="fc-head">
        <div>
          <p className="eyebrow">Flexible dates</p>
          <Heading id={`${id}-heading`} className="fc-title">
            Cheapest days to fly {origin.city} to {destination.city}
          </Heading>
          <p className="muted fc-note">Lowest one-way fare per traveler, taxes and fees included. Pick a day to see its flights.</p>
        </div>
        <div className="fc-legend" aria-hidden="true">
          <span>Lower</span>
          <span className="fc-legend-bar" />
          <span>Higher</span>
        </div>
      </header>

      <div className="fc-body">
        <div className="fc-calendar">
          <div className="fc-month-nav">
            <button type="button" className="fc-arrow" onClick={() => goToMonth(shiftMonth(month, -1))} disabled={month <= range.first} aria-label="Previous month">
              <ChevronIcon className="btn-icon fc-flip" />
            </button>
            <p className="fc-month" id={`${id}-month`} aria-live="polite">
              {monthTitle(month)}
            </p>
            <button type="button" className="fc-arrow" onClick={() => goToMonth(shiftMonth(month, 1))} disabled={month >= range.last} aria-label="Next month">
              <ChevronIcon className="btn-icon" />
            </button>
          </div>
          <div className="fc-viewport" ref={viewportRef}>
            <table key={month} role="grid" aria-labelledby={`${id}-month`} className={`fc-grid${slide ? ` slide-${slide}` : ''}`}>
              <thead>
                <tr role="row">
                  {WEEKDAYS.map(([short, long]) => (
                    <th key={short} role="columnheader" scope="col" abbr={long}>
                      {short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthWeeks(month).map((week) => (
                  <tr key={week.find(Boolean)} role="row">
                    {week.map((day, column) => (day ? renderDay(day, column) : <td key={`blank-${column}`} role="gridcell" className="fc-cell fc-blank" />))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="fc-hint">
            <span className="fc-badge fc-badge-inline" aria-hidden="true">
              #1
            </span>
            Cheapest 3 days this month · Use arrow keys to move between days
          </p>
        </div>

        <div className="fc-trend-panel">
          <SubHeading className="fc-subtitle">Price trend · next {TREND_DAYS} days</SubHeading>
          <FareTrendChart key={`${origin.code}-${destination.code}`} fares={upcoming} selectedDate={date} highlightDates={deals.map((deal) => deal.date)} />
          {upcomingStats && (
            <dl className="fc-stats">
              <div>
                <dt>Lowest</dt>
                <dd>{formatDollars(upcomingStats.minCents)}</dd>
              </div>
              <div>
                <dt>Average</dt>
                <dd>{formatDollars(upcomingStats.averageCents)}</dd>
              </div>
              <div>
                <dt>Your date</dt>
                <dd>{selected ? formatDollars(selected.cents) : '—'}</dd>
              </div>
            </dl>
          )}
        </div>
      </div>

      <div className="fc-deals">
        <SubHeading className="fc-subtitle">Cheapest days in the next {TREND_DAYS} days</SubHeading>
        <ol className="fc-strip" key={`${origin.code}-${destination.code}`}>
          {deals.map((deal, index) => (
            <DealCard key={deal.date} deal={deal} rank={index + 1} selected={selected} href={href(deal.date)} keepScroll={keepScroll} />
          ))}
        </ol>
      </div>
    </section>
  );
}

function DealCard({ deal, rank, selected, href, keepScroll }: { deal: DayFare; rank: number; selected: DayFare | null; href: string; keepScroll: boolean }) {
  const delta = compareToSelected(deal, selected);
  return (
    <li style={{ '--i': rank - 1 } as CSSProperties}>
      <Link
        className={`fc-deal${delta?.kind === 'selected' ? ' is-selected' : ''}`}
        href={href}
        prefetch={false}
        scroll={!keepScroll}
        aria-label={`${dayLabel(deal.date)}, ${formatDollars(deal.cents)} per traveler${delta ? `, ${delta.label}` : ''}`}
      >
        <span className="fc-deal-rank">#{rank}</span>
        <span className="fc-deal-date">{dayLabel(deal.date)}</span>
        <span className="fc-deal-price">
          {formatDollars(deal.cents)} <small>per traveler</small>
        </span>
        <span className="fc-deal-flight">
          {deal.flight.departs} · {deal.flight.stops === 0 ? 'Nonstop' : '1 stop'}
        </span>
        {delta && <span className={`fc-delta is-${delta.kind}`}>{delta.label}</span>}
      </Link>
    </li>
  );
}
