'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef } from 'react';
import { PlaneIcon } from '@/components/icons';
import { AIRPORTS, findAirport, type Airport } from '@/lib/airports';
import { TRACKER_ROUTES, flightProgress, type Point, type TrackedFlight } from '@/lib/flight-tracker';
import {
  BORDERS_PATH,
  FULL_VIEW,
  GRATICULE_PATH,
  HAWAII_INSET,
  HAWAII_PATH,
  LAND_PATH,
  MAP_HEIGHT,
  MAP_WIDTH,
  flownPoints,
  mixView,
  pathFromPoints,
  pointAlong,
  projectPoint,
  projectRoute,
  viewFor,
  type View,
} from '@/lib/us-map';

const routeCache = new Map<string, Point[]>();

export function routePoints(from: string, to: string): Point[] {
  const key = `${from}-${to}`;
  let points = routeCache.get(key);
  if (!points) {
    const a = findAirport(from);
    const b = findAirport(to);
    points = a && b ? projectRoute(a, b) : [];
    routeCache.set(key, points);
  }
  return points;
}

const ARCS = (() => {
  const seen = new Set<string>();
  const arcs: { key: string; from: string; to: string; d: string }[] = [];
  for (const [from, to] of TRACKER_ROUTES) {
    const key = [from, to].sort().join('-');
    if (seen.has(key)) continue;
    seen.add(key);
    arcs.push({ key, from, to, d: pathFromPoints(routePoints(from, to)) });
  }
  return arcs;
})();

type LabelPlacement = { dx: number; dy: number; anchor: 'start' | 'end' | 'middle' };

const LABELS: Record<string, LabelPlacement> = {
  ATL: { dx: -10, dy: 4, anchor: 'end' },
  AUS: { dx: -10, dy: 12, anchor: 'end' },
  BOS: { dx: 9, dy: -6, anchor: 'start' },
  ORD: { dx: 0, dy: -12, anchor: 'middle' },
  DEN: { dx: 10, dy: 4, anchor: 'start' },
  HNL: { dx: 10, dy: 14, anchor: 'start' },
  LAS: { dx: 10, dy: -2, anchor: 'start' },
  LAX: { dx: 6, dy: 17, anchor: 'start' },
  MIA: { dx: 10, dy: 4, anchor: 'start' },
  JFK: { dx: 10, dy: 12, anchor: 'start' },
  SFO: { dx: 9, dy: -8, anchor: 'start' },
  SEA: { dx: 10, dy: -4, anchor: 'start' },
};

const AIRPORT_POINTS = AIRPORTS.map((airport) => ({ airport, point: projectPoint(airport) }));

const VIEW_MS = 900;

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

type Props = {
  flights: TrackedFlight[];
  selected: TrackedFlight | null;
  dimmed: Set<string> | null;
  getNow: () => number;
  reducedMotion: boolean;
  description: string;
  onSelect: (id: string) => void;
};

export function FlightMap({ flights, selected, dimmed, getNow, reducedMotion, description, onSelect }: Props) {
  const titleId = useId();
  const descId = useId();
  const glowId = useId().replace(/:/g, '');
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<SVGGElement>(null);
  const flownRef = useRef<SVGPathElement>(null);
  const airportRefs = useRef(new Map<string, SVGGElement>());
  const planeRefs = useRef(new Map<string, SVGGElement>());
  const viewRef = useRef<View>(FULL_VIEW);
  const animation = useRef<{ from: View; to: View; start: number } | null>(null);
  const latest = useRef({ flights, selected, getNow });
  latest.current = { flights, selected, getNow };

  const selectedRoute = selected ? routePoints(selected.from, selected.to) : null;
  const targetView = useMemo(() => (selectedRoute ? viewFor(selectedRoute) : FULL_VIEW), [selectedRoute]);

  function draw(nowMs: number, frameMs: number) {
    const anim = animation.current;
    if (anim) {
      const t = Math.min(1, (frameMs - anim.start) / VIEW_MS);
      viewRef.current = mixView(anim.from, anim.to, ease(t));
      if (t >= 1) animation.current = null;
    }
    const { k, x, y } = viewRef.current;
    const toScreen = (p: Point) => `translate(${(p.x * k + x).toFixed(2)} ${(p.y * k + y).toFixed(2)})`;

    viewportRef.current?.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${k.toFixed(4)})`);
    svgRef.current?.style.setProperty('--k', k.toFixed(4));
    for (const { airport, point } of AIRPORT_POINTS) {
      airportRefs.current.get(airport.code)?.setAttribute('transform', toScreen(point));
    }

    const current = latest.current;
    for (const flight of current.flights) {
      const el = planeRefs.current.get(flight.id);
      if (!el) continue;
      const along = pointAlong(routePoints(flight.from, flight.to), flightProgress(flight.departMs, flight.arriveMs, nowMs));
      el.setAttribute('transform', toScreen(along));
      el.firstElementChild?.setAttribute('transform', `rotate(${(along.angle + 45).toFixed(1)})`);
    }

    const flown = flownRef.current;
    if (flown) {
      const sel = current.selected;
      flown.setAttribute(
        'd',
        sel ? pathFromPoints(flownPoints(routePoints(sel.from, sel.to), flightProgress(sel.departMs, sel.arriveMs, nowMs))) : '',
      );
    }
  }

  useEffect(() => {
    if (reducedMotion) {
      animation.current = null;
      viewRef.current = targetView;
    } else {
      animation.current = { from: viewRef.current, to: targetView, start: performance.now() };
    }
  }, [targetView, reducedMotion]);

  useLayoutEffect(() => {
    draw(getNow(), performance.now());
  });

  useEffect(() => {
    if (reducedMotion) return;
    let frame = 0;
    const loop = (frameMs: number) => {
      draw(latest.current.getNow(), frameMs);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion]);

  const selectedKey = selected ? [selected.from, selected.to].sort().join('-') : null;

  return (
    <svg
      ref={svgRef}
      className={`flight-map${selected ? ' has-selection' : ''}`}
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      role="img"
      aria-labelledby={`${titleId} ${descId}`}
    >
      <title id={titleId}>FlyLo-Air live flight map</title>
      <desc id={descId}>{description}</desc>
      <defs>
        <radialGradient id={`${glowId}-sea`} cx="50%" cy="38%" r="75%">
          <stop offset="0%" stopColor="#163a6b" />
          <stop offset="100%" stopColor="#071a33" />
        </radialGradient>
        <filter id={`${glowId}-glow`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill={`url(#${glowId}-sea)`} />

      <g ref={viewportRef}>
        <path className="map-graticule" d={GRATICULE_PATH} />
        <path className="map-land" d={LAND_PATH} />
        <path className="map-borders" d={BORDERS_PATH} />
        <rect
          className="map-inset"
          x={HAWAII_INSET.x}
          y={HAWAII_INSET.y}
          width={HAWAII_INSET.width}
          height={HAWAII_INSET.height}
          rx="12"
        />
        <text
          className="map-inset-label"
          x={HAWAII_INSET.x + HAWAII_INSET.width - 12}
          y={HAWAII_INSET.y + HAWAII_INSET.height - 12}
          textAnchor="end"
        >
          HAWAII
        </text>
        <path className="map-land" d={HAWAII_PATH} />

        <g className="map-arcs">
          {ARCS.map((arc, index) => (
            <path
              key={arc.key}
              className={`map-arc${arc.key === selectedKey ? ' is-selected' : ''}`}
              d={arc.d}
              pathLength={1}
              style={{ animationDelay: `${0.15 + index * 0.09}s` }}
            />
          ))}
        </g>

        {selectedRoute && (
          <g className="map-focus">
            <path className="map-focus-remaining" d={pathFromPoints(selectedRoute)} pathLength={1} />
            <path ref={flownRef} className="map-focus-flown" filter={`url(#${glowId}-glow)`} />
          </g>
        )}
      </g>

      <g className="map-airports">
        {AIRPORT_POINTS.map(({ airport }) => (
          <AirportMarker
            key={airport.code}
            airport={airport}
            label={LABELS[airport.code]}
            glow={`url(#${glowId}-glow)`}
            highlighted={Boolean(selected && (selected.from === airport.code || selected.to === airport.code))}
            register={(el) => {
              if (el) airportRefs.current.set(airport.code, el);
              else airportRefs.current.delete(airport.code);
            }}
          />
        ))}
      </g>

      <g className="map-planes">
        {flights.map((flight) => {
          const isSelected = selected?.id === flight.id;
          const size = isSelected ? 30 : 22;
          return (
            <g
              key={flight.id}
              ref={(el) => {
                if (el) planeRefs.current.set(flight.id, el);
                else planeRefs.current.delete(flight.id);
              }}
              className={`map-plane${isSelected ? ' is-selected' : ''}${dimmed?.has(flight.id) ? ' is-dim' : ''}`}
              onClick={() => onSelect(flight.id)}
            >
              <g>
                <circle className="map-plane-hit" r="15" />
                <g filter={`url(#${glowId}-glow)`}>
                  <svg x={-size / 2} y={-size / 2} width={size} height={size} overflow="visible">
                    <PlaneIcon className="map-plane-icon" />
                  </svg>
                </g>
              </g>
              <text className="map-plane-label" x="14" y="-12">
                {flight.flightNumber}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function AirportMarker({
  airport,
  label,
  glow,
  highlighted,
  register,
}: {
  airport: Airport;
  label: LabelPlacement;
  glow: string;
  highlighted: boolean;
  register: (el: SVGGElement | null) => void;
}) {
  const point = projectPoint(airport);
  return (
    <g ref={register} className={`map-airport${highlighted ? ' is-highlighted' : ''}`} transform={`translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`}>
      <circle className="map-airport-pulse" r="4" />
      <circle className="map-airport-dot" r="4" filter={glow} />
      <text className="map-airport-label" x={label.dx} y={label.dy} textAnchor={label.anchor}>
        {airport.city}
        <tspan className="map-airport-code" dx="4">
          {airport.code}
        </tspan>
      </text>
    </g>
  );
}
