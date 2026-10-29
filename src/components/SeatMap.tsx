'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SeatIcon } from '@/components/icons';
import { findAirport } from '@/lib/airports';
import { formatTripDate, type Fare, type FareKey, type Flight } from '@/lib/flights';
import { formatCents } from '@/lib/pricing';
import {
  ZONE_LABELS,
  buildCabinLayout,
  findSeat,
  formatSeatPrice,
  neighborSeat,
  occupiedSeats,
  seatAriaLabel,
  seatFeatures,
  seatPriceCents,
  seatStatus,
  type CabinLayout,
  type Direction,
  type Facility,
  type Seat,
  type SeatStatus,
} from '@/lib/seats';

type Props = {
  flight: Flight;
  fare: Fare;
  passengers: number;
};

const WALL = 9;
const NOSE = 150;
const TAIL = 170;

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Home: 'home',
  End: 'end',
};

const FARE_NOTES: Record<FareKey, string> = {
  basic: "Basic fare: we'll assign your seats for free at check-in. Want to sit together? Pick a paid seat now.",
  main: 'Main fare: standard seats are included. Extra Legroom and exit rows are a small extra.',
  flex: 'Flex fare: every seat is included, Extra Legroom too. Go on, stretch out.',
};

export function SeatMap({ flight, fare, passengers }: Props) {
  const layout = useMemo(() => buildCabinLayout(flight.aircraft), [flight.aircraft]);
  const occupied = useMemo(() => occupiedSeats(layout, flight.id), [layout, flight.id]);
  const storageKey = `flylo-seats:${flight.id}:${fare.key}:${passengers}`;
  const [assignments, setAssignments] = useState<(string | null)[]>(() => Array.from({ length: passengers }, () => null));
  const [active, setActive] = useState(0);
  const [focusId, setFocusId] = useState(() => firstOpenSeat(layout, occupied));
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusTipId, setFocusTipId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [restored, setRestored] = useState(false);
  const seatRefs = useRef(new Map<string, SVGGElement>());

  useEffect(() => {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(storageKey) ?? 'null') as unknown;
      if (Array.isArray(saved) && saved.length === passengers) {
        const seen = new Set<string>();
        const valid = saved.map((id) => {
          if (typeof id !== 'string' || seen.has(id) || occupied.has(id) || !findSeat(layout, id)) return null;
          seen.add(id);
          return id;
        });
        setAssignments(valid);
        const open = valid.indexOf(null);
        setActive(open < 0 ? 0 : open);
      }
    } catch {
      // A blocked or malformed sessionStorage just means starting fresh.
    }
    setRestored(true);
  }, [storageKey, passengers, occupied, layout]);

  useEffect(() => {
    if (!restored) return;
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(assignments));
    } catch {
      // Selections still work for this visit without storage.
    }
  }, [assignments, storageKey, restored]);

  const lines = assignments.map((id, index) => {
    const seat = id ? findSeat(layout, id) : undefined;
    return { index, seat, priceCents: seat ? seatPriceCents(seat, fare.key) : 0 };
  });
  const extrasCents = lines.reduce((total, line) => total + line.priceCents, 0);
  const shownCents = useCountUp(extrasCents);
  const chosen = lines.filter((line) => line.seat).length;

  const origin = findAirport(flight.from);
  const destination = findAirport(flight.to);
  const checkoutHref = `/checkout?flight=${encodeURIComponent(flight.id)}&fare=${fare.key}&passengers=${passengers}`;

  const choose = (id: string) => {
    const seat = findSeat(layout, id);
    if (!seat) return;
    if (occupied.has(id)) {
      setAnnouncement(`Seat ${id} is taken. Try another seat.`);
      return;
    }
    const owner = assignments.indexOf(id);
    if (owner === active) {
      setAssignments((current) => current.map((value, i) => (i === active ? null : value)));
      setAnnouncement(`Seat ${id} released. Traveler ${active + 1} has no seat yet.`);
      return;
    }
    if (owner >= 0) {
      setActive(owner);
      setAnnouncement(`Seat ${id} belongs to Traveler ${owner + 1}. Now choosing for Traveler ${owner + 1}.`);
      return;
    }
    const next = assignments.map((value, i) => (i === active ? id : value));
    setAssignments(next);
    const price = seatPriceCents(seat, fare.key);
    const nextActive = nextOpenTraveler(next, active);
    setActive(nextActive);
    setAnnouncement(
      `Seat ${id} assigned to Traveler ${active + 1}, ${price ? formatSeatPrice(price) : 'included in your fare'}.` +
        (nextActive !== active ? ` Now choosing for Traveler ${nextActive + 1}.` : ''),
    );
  };

  const moveFocus = (id: string) => {
    setFocusId(id);
    seatRefs.current.get(id)?.focus();
  };

  const onSeatKeyDown = (event: React.KeyboardEvent<SVGGElement>, id: string) => {
    const direction = KEY_DIRECTIONS[event.key];
    if (direction) {
      event.preventDefault();
      moveFocus(neighborSeat(layout, id, direction));
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(id);
    }
  };

  const clearAll = () => {
    setAssignments(Array.from({ length: passengers }, () => null));
    setActive(0);
    setAnnouncement('All seats cleared. Now choosing for Traveler 1.');
  };

  const tipSeat = findSeat(layout, hoverId ?? focusTipId ?? '');
  const geometry = cabinGeometry(layout);

  return (
    <div className="checkout-layout seats-layout">
      <section className="card seatmap-card" aria-labelledby="seatmap-title">
        <div className="card-head">
          <h2 id="seatmap-title">Pick a seat for each traveler</h2>
          <button type="button" className="btn-link" onClick={clearAll} disabled={chosen === 0}>
            Clear seats
          </button>
        </div>

        <div className="traveler-chips" role="group" aria-label="Travelers">
          {assignments.map((id, index) => (
            <button
              key={index}
              type="button"
              className={`traveler-chip${index === active ? ' is-active' : ''}${id ? ' has-seat' : ''}`}
              aria-pressed={index === active}
              onClick={() => {
                setActive(index);
                setAnnouncement(`Now choosing for Traveler ${index + 1}.`);
              }}
            >
              <SeatIcon className="chip-icon" />
              <span>Traveler {index + 1}</span>
              <span key={id ?? 'none'} className="chip-seat">
                {id ?? (fare.key === 'basic' ? 'At check-in' : 'No seat')}
              </span>
            </button>
          ))}
        </div>
        <p className="seat-hint">
          Choosing for <strong>Traveler {active + 1}</strong>. Click a seat, or tab into the map and use the arrow keys, then
          Enter or Space.
        </p>
        <p className={`alert alert-info fare-note fare-note-${fare.key}`}>{FARE_NOTES[fare.key]}</p>

        <Legend fare={fare.key} />

        <div className="seatmap-frame">
          <svg
            className="seatmap"
            viewBox={`0 0 ${geometry.width} ${geometry.height}`}
            width={geometry.width}
            role="group"
            aria-label={`Seat map for ${flight.flightNumber}, ${layout.aircraft}. Front of the plane is at the top. Use the arrow keys to move between seats and Enter or Space to choose.`}
          >
            <CabinArt layout={layout} geometry={geometry} />
            {layout.rows.map((row) =>
              row.seats.map((seat) => {
                const status = seatStatus(seat, fare.key, occupied, assignments);
                const traveler = assignments.indexOf(seat.id);
                return (
                  <SeatShape
                    key={seat.id}
                    seat={seat}
                    status={status}
                    traveler={traveler}
                    x={geometry.cabinX + seat.x}
                    y={geometry.cabinY + seat.y}
                    label={seatAriaLabel(seat, status, fare.key, traveler >= 0 ? traveler : undefined)}
                    focusable={seat.id === focusId}
                    register={(node) => {
                      if (node) seatRefs.current.set(seat.id, node);
                      else seatRefs.current.delete(seat.id);
                    }}
                    onChoose={() => {
                      setFocusId(seat.id);
                      choose(seat.id);
                    }}
                    onKeyDown={(event) => onSeatKeyDown(event, seat.id)}
                    onFocus={() => {
                      setFocusId(seat.id);
                      setFocusTipId(seat.id);
                    }}
                    onBlur={() => setFocusTipId((current) => (current === seat.id ? null : current))}
                    onHover={(hovering) => setHoverId(hovering ? seat.id : null)}
                  />
                );
              }),
            )}
          </svg>
          {tipSeat && (
            <SeatTooltip
              seat={tipSeat}
              fare={fare.key}
              status={seatStatus(tipSeat, fare.key, occupied, assignments)}
              traveler={assignments.indexOf(tipSeat.id)}
              left={((geometry.cabinX + tipSeat.x + tipSeat.width / 2) / geometry.width) * 100}
              top={((geometry.cabinY + tipSeat.y) / geometry.height) * 100}
            />
          )}
        </div>
        <p className="visually-hidden" aria-live="polite">
          {announcement}
        </p>
      </section>

      <aside className="card summary-card seat-summary" aria-labelledby="seat-summary-title">
        <p className="eyebrow">Seat extras</p>
        <h2 id="seat-summary-title" className="summary-route">
          {origin?.city} → {destination?.city}
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          {formatTripDate(flight.date)} · {flight.departs}–{flight.arrives}
          {flight.arrivesNextDay ? ' +1' : ''}
        </p>
        <p className="muted">
          {flight.flightNumber} · {layout.aircraft} · {fare.name} fare
        </p>

        <ul className="summary-lines seat-lines">
          {lines.map((line) => (
            <li key={line.index}>
              <span>
                <strong>Traveler {line.index + 1}</strong>
                <small>
                  {line.seat
                    ? `${line.seat.id} · ${capitalize(seatFeatures(line.seat).join(' · '))}`
                    : fare.key === 'basic'
                      ? 'Assigned at check-in'
                      : 'No seat chosen yet'}
                </small>
              </span>
              <span>{line.seat ? (line.priceCents ? formatSeatPrice(line.priceCents) : 'Included') : 'Free'}</span>
            </li>
          ))}
        </ul>

        <div className="extras-total">
          <span>Seat extras (sample, collected at check-in)</span>
          <span className="extras-amount" aria-hidden="true">
            {formatCents(shownCents)}
          </span>
          <span className="visually-hidden" aria-live="polite">
            {formatCents(extrasCents)}
          </span>
        </div>
        <p className="muted extras-note">
          {chosen} of {passengers} {passengers === 1 ? 'seat' : 'seats'} chosen. Seat extras are sample amounts and are paid at
          check-in.
        </p>
        <Link className="btn btn-lg continue-btn" href={checkoutHref}>
          Continue to checkout
        </Link>
      </aside>
    </div>
  );
}

type Geometry = {
  width: number;
  height: number;
  side: number;
  fuselageX: number;
  fuselageWidth: number;
  cabinX: number;
  cabinY: number;
  center: number;
};

function cabinGeometry(layout: CabinLayout): Geometry {
  const side = layout.wideBody ? 180 : 165;
  const fuselageWidth = layout.cabinWidth + WALL * 2;
  const width = fuselageWidth + side * 2;
  return {
    width,
    height: NOSE + layout.cabinLength + TAIL,
    side,
    fuselageX: side,
    fuselageWidth,
    cabinX: side + WALL,
    cabinY: NOSE,
    center: width / 2,
  };
}

function CabinArt({ layout, geometry }: { layout: CabinLayout; geometry: Geometry }) {
  const { fuselageX: fx, fuselageWidth: fw, cabinX: ox, cabinY: oy, center: cx, side } = geometry;
  const bottom = oy + layout.cabinLength;
  const ws = oy + layout.wing.start;
  const we = oy + layout.wing.end;
  const chord = we - ws;
  const span = side - 14;
  const sweep = chord * 0.95;
  const tip = chord * 0.3;
  const engineAt = 0.58;
  const engineY = ws + sweep * engineAt - 30;

  const fuselage = [
    `M ${fx} ${oy}`,
    `C ${fx} ${oy - 95} ${cx - fw * 0.32} 6 ${cx} 6`,
    `C ${cx + fw * 0.32} 6 ${fx + fw} ${oy - 95} ${fx + fw} ${oy}`,
    `L ${fx + fw} ${bottom}`,
    `C ${fx + fw} ${bottom + TAIL * 0.55} ${cx + 12} ${bottom + TAIL - 18} ${cx + 5} ${bottom + TAIL - 4}`,
    `L ${cx - 5} ${bottom + TAIL - 4}`,
    `C ${cx - 12} ${bottom + TAIL - 18} ${fx} ${bottom + TAIL * 0.55} ${fx} ${bottom}`,
    'Z',
  ].join(' ');

  return (
    <g aria-hidden="true">
      <defs>
        <linearGradient id="seatmap-wing" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e6eefc" />
          <stop offset="1" stopColor="#c3d3ef" />
        </linearGradient>
        <linearGradient id="seatmap-shade-left" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1d4ed8" stopOpacity="0.16" />
          <stop offset="1" stopColor="#1d4ed8" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="seatmap-shade-right" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#1d4ed8" stopOpacity="0.16" />
          <stop offset="1" stopColor="#1d4ed8" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="seatmap-body" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e8eef7" />
          <stop offset="0.12" stopColor="#ffffff" />
          <stop offset="0.88" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e8eef7" />
        </linearGradient>
        <filter id="seatmap-shadow" x="-20%" y="-5%" width="140%" height="110%">
          <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#0b2545" floodOpacity="0.18" />
        </filter>
      </defs>

      <g filter="url(#seatmap-shadow)">
        {[-1, 1].map((dir) => {
          const root = dir < 0 ? fx + 4 : fx + fw - 4;
          const tipX = root + dir * span;
          const engineX = root + dir * span * engineAt;
          return (
            <g key={dir}>
              <polygon
                className="seatmap-wing"
                points={`${root},${ws} ${tipX},${ws + sweep} ${tipX},${ws + sweep + tip} ${root},${we}`}
              />
              <rect className="seatmap-engine" x={engineX - 13} y={engineY} width={26} height={60} rx={11} />
              <ellipse cx={engineX} cy={engineY + 6} rx={9} ry={4} fill="#94a3b8" />
            </g>
          );
        })}
        {[-1, 1].map((dir) => (
          <polygon
            key={`stab${dir}`}
            className="seatmap-wing"
            points={`${cx + dir * 10},${bottom + TAIL - 84} ${cx + dir * 108},${bottom + TAIL - 34} ${cx + dir * 108},${bottom + TAIL - 14} ${cx + dir * 10},${bottom + TAIL - 36}`}
          />
        ))}
        <path className="seatmap-fuselage" d={fuselage} />
      </g>

      {[-1.5, -0.5, 0.5, 1.5].map((offset) => (
        <rect
          key={offset}
          x={cx + offset * 22 - 9}
          y={60 + Math.abs(offset) * 7}
          width={18}
          height={9}
          rx={3}
          fill="#0b2545"
          opacity={0.85}
        />
      ))}
      <text className="seatmap-brand" x={cx} y={112}>
        FlyLo<tspan fill="#1d4ed8">-Air</tspan>
      </text>
      <circle cx={cx + 44} cy={104} r={3.5} fill="#f97316" />

      <rect className="seatmap-floor" x={ox} y={oy - 4} width={layout.cabinWidth} height={layout.cabinLength + 8} rx={10} />
      <rect x={ox} y={ws} width={layout.cabinWidth / 2} height={chord} fill="url(#seatmap-shade-left)" />
      <rect x={ox + layout.cabinWidth / 2} y={ws} width={layout.cabinWidth / 2} height={chord} fill="url(#seatmap-shade-right)" />
      {layout.rows.map((row) => (
        <g key={row.number}>
          <rect className="seatmap-window" x={fx + 2.5} y={oy + row.y + row.height / 2 - 5} width={4} height={10} rx={2} />
          <rect className="seatmap-window" x={fx + fw - 6.5} y={oy + row.y + row.height / 2 - 5} width={4} height={10} rx={2} />
          {row.exitRow && (
            <rect className="seatmap-exit-row" x={ox + 3} y={oy + row.y + 1} width={layout.cabinWidth - 6} height={row.height - 2} rx={8} />
          )}
          {layout.aisles.map((aisle) => (
            <text
              key={aisle.x}
              className="seatmap-row-number"
              x={ox + aisle.x + aisle.width / 2}
              y={oy + row.seats[0].y + row.seats[0].height / 2 + 3.5}
            >
              {row.number}
            </text>
          ))}
        </g>
      ))}

      {layout.exits.map((exit) => (
        <g key={exit.row}>
          {[-1, 1].map((dir) => {
            const wall = dir < 0 ? fx : fx + fw;
            const tagX = dir < 0 ? wall - 48 : wall + 6;
            return (
              <g key={dir}>
                <rect className="seatmap-door" x={dir < 0 ? wall - 1 : wall - WALL - 1} y={oy + exit.y + 2} width={WALL + 2} height={20} rx={2} />
                <rect className="seatmap-exit-tag" x={tagX} y={oy + exit.y + 3} width={42} height={18} rx={4} />
                <text className="seatmap-exit-text" x={tagX + 21} y={oy + exit.y + 15.5}>
                  EXIT
                </text>
              </g>
            );
          })}
        </g>
      ))}

      {layout.sections.map((section) =>
        section.kind === 'zone' ? (
          <g key={`zone-${section.y}`}>
            <line className="seatmap-zone-line" x1={ox + 10} x2={ox + layout.cabinWidth - 10} y1={oy + section.y + 3} y2={oy + section.y + 3} />
            <text className={`seatmap-zone-label zone-${section.zone}`} x={cx} y={oy + section.y + 17}>
              {ZONE_LABELS[section.zone].toUpperCase()}
            </text>
            {section.letters.map((item) => (
              <text key={item.letter} className="seatmap-letter" x={ox + item.x} y={oy + section.y + 32}>
                {item.letter}
              </text>
            ))}
          </g>
        ) : (
          <Facilities key={`fac-${section.y}`} facilities={section.facilities} x={ox} y={oy + section.y} width={layout.cabinWidth} />
        ),
      )}
    </g>
  );
}

function Facilities({ facilities, x, y, width }: { facilities: Facility[]; x: number; y: number; width: number }) {
  const gap = 8;
  const boxWidth = (width - 16 - gap * (facilities.length - 1)) / facilities.length;
  return (
    <g>
      {facilities.map((facility, index) => {
        const bx = x + 8 + index * (boxWidth + gap);
        const mid = bx + boxWidth / 2;
        return (
          <g key={index} className={`seatmap-facility is-${facility}`}>
            <rect x={bx} y={y + 8} width={boxWidth} height={38} rx={7} />
            {facility === 'galley' ? (
              <path
                className="seatmap-facility-icon"
                d={`M ${mid - 7} ${y + 15} h 11 v 7 a 5.5 5.5 0 0 1 -11 0 Z M ${mid + 4} ${y + 17} h 2 a 2.5 2.5 0 0 1 0 5 h -2`}
              />
            ) : (
              <g className="seatmap-facility-icon">
                <circle cx={mid} cy={y + 15.5} r={2.3} />
                <path d={`M ${mid - 4} ${y + 27} l 1.5 -7.5 h 5 l 1.5 7.5 Z`} />
              </g>
            )}
            <text className="seatmap-facility-text" x={mid} y={y + 39}>
              {facility === 'galley' ? 'Galley' : 'Lavatory'}
            </text>
          </g>
        );
      })}
    </g>
  );
}

type SeatShapeProps = {
  seat: Seat;
  status: SeatStatus;
  traveler: number;
  x: number;
  y: number;
  label: string;
  focusable: boolean;
  register: (node: SVGGElement | null) => void;
  onChoose: () => void;
  onKeyDown: (event: React.KeyboardEvent<SVGGElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
  onHover: (hovering: boolean) => void;
};

function SeatShape({ seat, status, traveler, x, y, label, focusable, register, onChoose, onKeyDown, onFocus, onBlur, onHover }: SeatShapeProps) {
  const { width: w, height: h } = seat;
  return (
    <g
      ref={register}
      className={`seat is-${status} zone-${seat.zone}${seat.exitRow ? ' is-exit' : ''}`}
      transform={`translate(${x} ${y})`}
      role="button"
      tabIndex={focusable ? 0 : -1}
      aria-label={label}
      aria-pressed={status === 'selected'}
      aria-disabled={status === 'occupied' ? true : undefined}
      data-seat={seat.id}
      onClick={onChoose}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <rect className="seat-ring" x={-3.5} y={-3.5} width={w + 7} height={h + 7} rx={9} />
      <g className="seat-shape">
        <rect className="seat-body" width={w} height={h} rx={6} />
        <rect className="seat-back" x={2.5} y={h - 6.5} width={w - 5} height={4} rx={2} />
        {status === 'selected' && (
          <text className="seat-label" x={w / 2} y={h / 2 + 1}>
            {traveler + 1}
          </text>
        )}
        {status === 'occupied' && <path className="seat-mark" d={`M ${w / 2 - 4.5} ${h / 2 - 6.5} l 9 9 m 0 -9 l -9 9`} />}
        {status === 'included' && <path className="seat-mark" d={`M ${w / 2 - 5} ${h / 2 - 2.5} l 3.5 3.5 l 6.5 -6.5`} />}
      </g>
    </g>
  );
}

function SeatTooltip({
  seat,
  fare,
  status,
  traveler,
  left,
  top,
}: {
  seat: Seat;
  fare: FareKey;
  status: SeatStatus;
  traveler: number;
  left: number;
  top: number;
}) {
  const price = seatPriceCents(seat, fare);
  let note = price ? formatSeatPrice(price) : 'Included in your fare';
  if (status === 'occupied') note = 'Occupied';
  return (
    <div className={`seat-tip is-${status}`} style={{ left: `${left}%`, top: `${top}%` }} aria-hidden="true">
      <strong>Seat {seat.id}</strong>
      <span>{capitalize(seatFeatures(seat).join(' · '))}</span>
      <span>Legroom {seat.legroomInches} in</span>
      <span className="seat-tip-price">
        {status === 'selected' && traveler >= 0 ? `Traveler ${traveler + 1} · ${note}` : note}
      </span>
    </div>
  );
}

function Legend({ fare }: { fare: FareKey }) {
  const items: { className: string; label: string }[] = [{ className: 'is-selected', label: 'Your pick' }];
  if (fare !== 'basic') items.push({ className: 'is-included', label: 'Included in your fare' });
  if (fare === 'basic') items.push({ className: 'is-available zone-main', label: 'Standard (from $9)' });
  if (fare !== 'flex') {
    items.push({ className: 'is-available zone-extra', label: 'Extra Legroom' });
    items.push({ className: 'is-available zone-main is-exit', label: 'Exit row ($39)' });
  }
  items.push({ className: 'is-occupied', label: 'Occupied' });

  return (
    <ul className="seat-legend" aria-label="Seat legend">
      {items.map((item) => (
        <li key={item.label}>
          <svg className={`seat legend-swatch ${item.className}`} viewBox="-4 -4 34 34" aria-hidden="true" focusable="false">
            {item.className.includes('is-exit') && <rect className="seatmap-exit-row" x={-3} y={-3} width={32} height={32} rx={6} />}
            <rect className="seat-body" width={26} height={26} rx={6} />
            <rect className="seat-back" x={2.5} y={19.5} width={21} height={4} rx={2} />
            {item.className === 'is-included' && <path className="seat-mark" d="M 8 10.5 l 3.5 3.5 l 6.5 -6.5" />}
            {item.className === 'is-occupied' && <path className="seat-mark" d="M 8.5 6.5 l 9 9 m 0 -9 l -9 9" />}
          </svg>
          {item.label}
        </li>
      ))}
      <li>
        <span className="legend-exit-tag" aria-hidden="true">
          EXIT
        </span>
        Exit door
      </li>
      <li className="legend-note">Hover or focus a seat for details</li>
    </ul>
  );
}

function useCountUp(target: number, duration = 650): number {
  const [value, setValue] = useState(target);
  const shown = useRef(target);

  useEffect(() => {
    const from = shown.current;
    if (from === target) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      shown.current = target;
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const next = Math.round(from + (target - from) * (1 - (1 - progress) ** 3));
      shown.current = next;
      setValue(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

function firstOpenSeat(layout: CabinLayout, occupied: Set<string>): string {
  for (const row of layout.rows) {
    const seat = row.seats.find((candidate) => !occupied.has(candidate.id));
    if (seat) return seat.id;
  }
  return layout.rows[0].seats[0].id;
}

function nextOpenTraveler(assignments: (string | null)[], from: number): number {
  for (let step = 1; step <= assignments.length; step += 1) {
    const index = (from + step) % assignments.length;
    if (!assignments[index]) return index;
  }
  return from;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
