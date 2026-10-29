'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlightMap } from '@/components/FlightMap';
import { PlaneIcon } from '@/components/icons';
import { AIRPORTS, findAirport } from '@/lib/airports';
import { defaultTravelDate } from '@/lib/dates';
import {
  compassPoint,
  findTrackedFlight,
  flightStatus,
  flightsForDay,
  formatClock,
  greatCirclePoint,
  initialBearing,
  isAirborne,
  localIsoDate,
  matchesQuery,
  startOfLocalDay,
  telemetry,
  type FlightStatus,
  type TrackedFlight,
} from '@/lib/flight-tracker';
import { formatDuration, formatTripDate } from '@/lib/flights';

const MINUTE = 60_000;
const KM_TO_MILES = 0.621371;
const FAST = 60;

type Clock = { baseReal: number; baseSim: number; speed: number };

type Row = {
  flight: TrackedFlight;
  status: FlightStatus;
  altitudeFeet: number;
  groundSpeedKnots: number;
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

function city(code: string): string {
  return findAirport(code)?.city ?? code;
}

function formatMinutes(minutes: number): string {
  return minutes < 60 ? `${minutes}m` : formatDuration(minutes);
}

function nextDay(ms: number, date: string): boolean {
  return localIsoDate(new Date(ms)) > date;
}

export function FlightTracker({ initialFlight }: { initialFlight?: string }) {
  const clockRef = useRef<Clock>({ baseReal: 0, baseSim: 0, speed: 1 });
  const [now, setNow] = useState<number | null>(null);
  const [speed, setSpeed] = useState(1);
  const [live, setLive] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const deepLinkDone = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  const getNow = useCallback(() => {
    const clock = clockRef.current;
    return clock.baseSim + (Date.now() - clock.baseReal) * clock.speed;
  }, []);

  const setClock = useCallback((simMs: number, nextSpeed: number) => {
    clockRef.current = { baseReal: Date.now(), baseSim: simMs, speed: nextSpeed };
    setSpeed(nextSpeed);
    setNow(simMs);
  }, []);

  useEffect(() => {
    setClock(Date.now(), 1);
  }, [setClock]);

  const ready = now !== null;
  useEffect(() => {
    if (!ready) return;
    const interval = reducedMotion ? 5000 : speed > 1 ? 250 : 1000;
    const id = window.setInterval(() => setNow(getNow()), interval);
    return () => window.clearInterval(id);
  }, [ready, speed, reducedMotion, getNow]);

  const day = now === null ? null : localIsoDate(new Date(now));
  const flights = useMemo(() => (day ? flightsForDay(day) : []), [day]);

  const rows: Row[] = useMemo(() => {
    if (now === null) return [];
    const all = flights.map((flight) => ({ flight, status: flightStatus(flight, now), ...telemetry(flight, now) }));
    const landedLast = (row: Row) => (row.status.key === 'landed' ? 1 : 0);
    return all.sort((a, b) => landedLast(a) - landedLast(b));
  }, [flights, now]);

  const visibleRows = useMemo(() => rows.filter((row) => matchesQuery(row.flight, query)), [rows, query]);
  const airborne = rows.filter((row) => isAirborne(row.status));
  const dimmed = useMemo(
    () => (query.trim() ? new Set(rows.filter((row) => !matchesQuery(row.flight, query)).map((row) => row.flight.id)) : null),
    [rows, query],
  );
  const selectedRow = rows.find((row) => row.flight.id === selectedId) ?? null;

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      setMissing(null);
      const url = new URL(window.location.href);
      if (id) url.searchParams.set('flight', id);
      else url.searchParams.delete('flight');
      window.history.replaceState(null, '', `${url.pathname}${url.search}`);
      const flight = id ? flights.find((f) => f.id === id) : undefined;
      setAnnouncement(flight ? `Following ${flight.flightNumber}, ${city(flight.from)} to ${city(flight.to)}.` : 'Showing all flights.');
    },
    [flights],
  );

  useEffect(() => {
    if (deepLinkDone.current || flights.length === 0) return;
    deepLinkDone.current = true;
    if (!initialFlight) return;
    const match = findTrackedFlight(flights, initialFlight);
    if (match) setSelectedId(match.id);
    else setMissing(initialFlight);
  }, [flights, initialFlight]);

  useEffect(() => {
    const board = boardRef.current;
    if (!selectedId || !board) return;
    const row = board.querySelector<HTMLElement>(`[data-flight-id="${CSS.escape(selectedId)}"]`);
    if (!row) return;
    const top = row.offsetTop - board.clientHeight / 2 + row.offsetHeight / 2;
    board.scrollTo({ top, behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [selectedId, reducedMotion]);

  const dayStart = now === null ? 0 : startOfLocalDay(now);
  const minuteOfDay = now === null ? 0 : Math.floor((now - dayStart) / MINUTE);
  const landed = rows.filter((row) => row.status.key === 'landed').length;
  const delayed = rows.filter((row) => row.flight.delayMinutes > 0).length;

  const description = useMemo(() => {
    const airports = AIRPORTS.map((airport) => `${airport.city} (${airport.code})`).join(', ');
    const base = `Map of the United States with Hawaii in an inset, showing FlyLo-Air's 12 airports: ${airports}, joined by great-circle routes.`;
    if (now === null) return base;
    const inAir = `At ${formatClock(now)}, ${airborne.length} ${airborne.length === 1 ? 'flight is' : 'flights are'} in the air.`;
    const focus = selectedRow
      ? ` Following ${selectedRow.flight.flightNumber} from ${city(selectedRow.flight.from)} to ${city(selectedRow.flight.to)}: ${selectedRow.status.label}.`
      : '';
    return `${base} ${inAir}${focus} Every flight is also listed in the flight board table.`;
  }, [now, airborne.length, selectedRow]);

  return (
    <section className="tracker" aria-label="Live flight tracker">
      <div className="tracker-wrap">
        <div className="tracker-main">
          <div className="tracker-bar">
            <div className="tracker-clock" aria-live="off">
              <span className={`tracker-live${live ? ' is-live' : ''}`}>
                <span className="tracker-live-dot" aria-hidden="true" />
                {live ? 'Live' : speed > 1 ? `Simulated · ${FAST}x` : 'Simulated'}
              </span>
              <span className="tracker-time">{now === null ? '--:--' : formatClock(now)}</span>
              <span className="tracker-date">{day ? formatTripDate(day) : 'Today'}</span>
            </div>
            <div className="tracker-controls">
              <button
                type="button"
                className="tracker-toggle"
                aria-pressed={speed > 1}
                disabled={!ready}
                onClick={() => {
                  setClock(getNow(), speed > 1 ? 1 : FAST);
                  setLive(false);
                }}
              >
                <PlaneIcon className="btn-icon" />
                Simulate {FAST}x
              </button>
              <label className="tracker-scrub">
                <span className="visually-hidden">Time of day</span>
                <input
                  type="range"
                  min={0}
                  max={24 * 60 - 1}
                  step={1}
                  value={minuteOfDay}
                  disabled={!ready}
                  aria-valuetext={now === null ? undefined : formatClock(now)}
                  onChange={(event) => {
                    setClock(dayStart + Number(event.target.value) * MINUTE, speed);
                    setLive(false);
                  }}
                />
              </label>
              <button
                type="button"
                className="tracker-toggle"
                disabled={!ready || live}
                onClick={() => {
                  setClock(Date.now(), 1);
                  setLive(true);
                }}
              >
                Back to live
              </button>
            </div>
          </div>

          <div className="tracker-map">
            <FlightMap
              flights={airborne.map((row) => row.flight)}
              selected={selectedRow?.flight ?? null}
              dimmed={dimmed}
              getNow={getNow}
              reducedMotion={reducedMotion}
              description={description}
              onSelect={select}
            />
            {selectedRow && (
              <button type="button" className="tracker-reset" onClick={() => select(null)}>
                Show all flights
              </button>
            )}
          </div>

          <p className="visually-hidden" aria-live="polite">
            {announcement}
          </p>

          {selectedRow ? (
            <FlightDetail row={selectedRow} now={now ?? 0} onClose={() => select(null)} />
          ) : (
            <div className="card tracker-detail tracker-detail-empty">
              {missing ? (
                <p>
                  <strong>We couldn’t find “{missing}” on today’s board.</strong> It may be on another day. Search below or pick
                  any flight to follow it.
                </p>
              ) : ready && airborne.length === 0 ? (
                <p>
                  <strong>All quiet up there right now.</strong> Drag the time slider or press Simulate {FAST}x to watch
                  today’s flights take off.
                </p>
              ) : (
                <p>
                  <strong>Pick a flight on the board or click a plane</strong> to follow it across the map.
                </p>
              )}
              <ul className="tracker-stats" aria-label="Today at a glance">
                <li>
                  <span>{airborne.length}</span> in the air
                </li>
                <li>
                  <span>{landed}</span> landed
                </li>
                <li>
                  <span>{delayed}</span> running late
                </li>
              </ul>
            </div>
          )}
        </div>

        <div className="board-panel">
          <div className="board-head">
            <h2>Departures &amp; arrivals</h2>
            <p className="board-sub">Sample data · times in your local time</p>
          </div>
          <form className="board-search" role="search" onSubmit={(event) => event.preventDefault()}>
            <label htmlFor="flight-search">Find a flight</label>
            <input
              id="flight-search"
              type="search"
              value={query}
              placeholder="FL 4xx, SFO to JFK, or Boston"
              autoComplete="off"
              aria-describedby="flight-search-count"
              onChange={(event) => setQuery(event.target.value)}
            />
            <p id="flight-search-count" className="board-count" aria-live="polite">
              {ready ? `${visibleRows.length} of ${rows.length} flights` : 'Loading today’s flights…'}
            </p>
          </form>
          <div className="board-scroll" ref={boardRef} tabIndex={-1}>
            <table className="board">
              <caption className="visually-hidden">
                FlyLo-Air flights for {day ? formatTripDate(day) : 'today'}. Choose a flight number to follow it on the map.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Flight</th>
                  <th scope="col">Route · Dep</th>
                  <th scope="col">Status</th>
                  <th scope="col">ETA</th>
                  <th scope="col">Alt · Speed</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <BoardRow
                    key={row.flight.id}
                    row={row}
                    day={day ?? ''}
                    selected={row.flight.id === selectedId}
                    onSelect={select}
                  />
                ))}
                {ready && visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="board-empty">
                      No flights match “{query}”. Try a flight number like FL 4xx or a route like SEA to LAX.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: FlightStatus }) {
  return <span className={`status-pill is-${status.key}`}>{status.label}</span>;
}

function BoardRow({ row, day, selected, onSelect }: { row: Row; day: string; selected: boolean; onSelect: (id: string) => void }) {
  const { flight, status } = row;
  const flying = isAirborne(status);
  return (
    <tr data-flight-id={flight.id} className={selected ? 'is-selected' : undefined} onClick={() => onSelect(flight.id)}>
      <th scope="row">
        <button type="button" className="board-flight" aria-pressed={selected}>
          {flight.flightNumber}
        </button>
      </th>
      <td>
        <span className="board-route">
          {flight.from}
          <span aria-hidden="true"> → </span>
          <span className="visually-hidden"> to </span>
          {flight.to}
        </span>
        <span className="board-dep">
          <span className="visually-hidden">departs </span>
          {flight.delayMinutes > 0 && (
            <>
              <s>
                <span className="visually-hidden">was </span>
                {flight.departs}
              </s>{' '}
            </>
          )}
          {formatClock(flight.departMs)}
          {flight.date < day && <sup> −1</sup>}
        </span>
      </td>
      <td>
        <StatusPill status={status} />
      </td>
      <td className="board-time">
        {formatClock(flight.arriveMs)}
        {nextDay(flight.arriveMs, day) && <sup> +1</sup>}
      </td>
      <td className="board-telemetry">
        {flying ? (
          <>
            {row.altitudeFeet.toLocaleString('en-US')} ft
            <small>{row.groundSpeedKnots} kt</small>
          </>
        ) : (
          <span aria-label="On the ground">—</span>
        )}
      </td>
    </tr>
  );
}

function FlightDetail({ row, now, onClose }: { row: Row; now: number; onClose: () => void }) {
  const { flight, status } = row;
  const origin = findAirport(flight.from);
  const destination = findAirport(flight.to);
  const percent = Math.floor(status.progress * 100);
  const flying = isAirborne(status);
  const here = origin && destination ? greatCirclePoint(origin, destination, status.progress) : null;
  const heading = here && destination ? initialBearing(here, destination) : null;
  const totalMiles = Math.round(flight.distanceKm * KM_TO_MILES);
  const flownMiles = Math.round(totalMiles * status.progress);
  const minutesLeft = Math.max(0, Math.ceil((flight.arriveMs - now) / MINUTE));
  const minutesToGo = Math.max(0, Math.ceil((flight.departMs - now) / MINUTE));

  return (
    <section className="card tracker-detail" aria-labelledby="tracker-detail-title">
      <div className="detail-head">
        <div>
          <p className="eyebrow">Following</p>
          <h2 id="tracker-detail-title">
            {flight.flightNumber} · {city(flight.from)} to {city(flight.to)}
          </h2>
          <p className="muted detail-sub">
            {flight.aircraft} · {formatDuration(flight.durationMinutes)} nonstop
            {flight.delayMinutes > 0 && ` · running ${flight.delayMinutes} minutes late, sorry about that`}
          </p>
        </div>
        <StatusPill status={status} />
      </div>

      <div className="detail-progress">
        <div className="detail-ends">
          <span>
            <strong>{flight.from}</strong> {formatClock(flight.departMs)}
          </span>
          <span>
            <strong>{flight.to}</strong> {formatClock(flight.arriveMs)}
          </span>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-label={`${flight.flightNumber} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${percent}% complete`}
        >
          <span className="progress-fill" style={{ width: `${status.progress * 100}%` }} />
          <span className="progress-plane" style={{ left: `${status.progress * 100}%` }}>
            <PlaneIcon />
          </span>
        </div>
      </div>

      <dl className="detail-stats">
        <div>
          <dt>Progress</dt>
          <dd>{percent}%</dd>
        </div>
        <div>
          <dt>Altitude</dt>
          <dd>{flying ? `${row.altitudeFeet.toLocaleString('en-US')} ft` : 'On the ground'}</dd>
        </div>
        <div>
          <dt>Ground speed</dt>
          <dd>{flying ? `${row.groundSpeedKnots} kt` : '—'}</dd>
        </div>
        <div>
          <dt>Heading</dt>
          <dd>{flying && heading !== null ? `${Math.round(heading)}° ${compassPoint(heading)}` : '—'}</dd>
        </div>
        <div>
          <dt>Distance</dt>
          <dd>
            {flownMiles.toLocaleString('en-US')} of {totalMiles.toLocaleString('en-US')} mi
          </dd>
        </div>
        <div>
          <dt>{status.key === 'landed' ? 'Landed' : flying ? 'Time left' : 'Departs in'}</dt>
          <dd>
            {status.key === 'landed'
              ? formatClock(flight.arriveMs)
              : formatMinutes(flying ? minutesLeft : minutesToGo)}
          </dd>
        </div>
      </dl>

      <div className="detail-actions">
        <Link className="btn" href={`/results?from=${flight.from}&to=${flight.to}&date=${defaultTravelDate()}&passengers=1`}>
          Like this route? Book it
        </Link>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Show all flights
        </button>
      </div>
    </section>
  );
}
