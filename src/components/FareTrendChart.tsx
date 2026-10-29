'use client';

import { useId, useState, type PointerEvent } from 'react';
import { dayLabel, fareStats, formatDollars, shortDayLabel, type DayFare } from '@/lib/fare-calendar';

type Props = {
  fares: DayFare[];
  selectedDate: string;
  highlightDates: string[];
};

const WIDTH = 560;
const HEIGHT = 300;
const PAD = { top: 36, right: 18, bottom: 30, left: 50 };
const INNER_W = WIDTH - PAD.left - PAD.right;
const INNER_H = HEIGHT - PAD.top - PAD.bottom;

type Point = { x: number; y: number };

function smoothPath(points: Point[]): string {
  if (points.length === 0) return '';
  let path = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    path += ` C${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return path;
}

export function FareTrendChart({ fares, selectedDate, highlightDates }: Props) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const stats = fareStats(fares);
  if (!stats || fares.length < 2) return null;

  const span = stats.maxCents - stats.minCents || 100;
  const low = stats.minCents - span * 0.15;
  const high = stats.maxCents + span * 0.15;
  const x = (index: number) => PAD.left + (index / (fares.length - 1)) * INNER_W;
  const y = (cents: number) => PAD.top + (1 - (cents - low) / (high - low)) * INNER_H;

  const points = fares.map((fare, index) => ({ x: x(index), y: y(fare.cents) }));
  const line = smoothPath(points);
  const bottom = PAD.top + INNER_H;
  const area = `${line} L${points[points.length - 1].x.toFixed(1)},${bottom} L${points[0].x.toFixed(1)},${bottom} Z`;
  const averageY = y(stats.averageCents);
  const selectedIndex = fares.findIndex((fare) => fare.date === selectedDate);
  const selected = selectedIndex >= 0 ? fares[selectedIndex] : null;
  const ticks = [0, 15, 30, 45, fares.length - 1].filter((tick) => tick < fares.length);
  const gridValues = [stats.minCents, Math.round((stats.minCents + stats.maxCents) / 2), stats.maxCents];
  const hovered = hover === null ? null : fares[hover];

  function onPointerMove(event: PointerEvent<SVGRectElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - box.left) / box.width;
    setHover(Math.min(fares.length - 1, Math.max(0, Math.round(ratio * (fares.length - 1)))));
  }

  const first = fares[0].date;
  const last = fares[fares.length - 1].date;
  const description =
    `From ${dayLabel(first)} to ${dayLabel(last)}, the lowest daily fare ranges from ${formatDollars(stats.minCents)} to ${formatDollars(stats.maxCents)} per traveler, averaging ${formatDollars(stats.averageCents)}.` +
    (selected ? ` Your date, ${dayLabel(selected.date)}, is ${formatDollars(selected.cents)}.` : '');

  return (
    <svg
      className="fc-trend"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`Cheapest fare per day, next ${fares.length} days`}
      aria-describedby={`${id}-desc`}
    >
      <desc id={`${id}-desc`}>{description}</desc>
      <defs>
        <linearGradient id={`${id}-area`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#1d4ed8" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0" />
        </linearGradient>
      </defs>

      <g className="fc-trend-grid">
        {gridValues.map((value) => (
          <g key={value}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(value)} y2={y(value)} />
            <text x={PAD.left - 8} y={y(value)} dy="0.32em" textAnchor="end">
              {formatDollars(value)}
            </text>
          </g>
        ))}
        {ticks.map((tick) => (
          <text key={tick} className="fc-trend-x" x={x(tick)} y={HEIGHT - 8} textAnchor={tick === 0 ? 'start' : tick === fares.length - 1 ? 'end' : 'middle'}>
            {shortDayLabel(fares[tick].date)}
          </text>
        ))}
      </g>

      <path className="fc-trend-area" d={area} fill={`url(#${id}-area)`} />
      <path className="fc-trend-line" d={line} pathLength={1} />

      <g className="fc-trend-avg">
        <line x1={PAD.left} x2={WIDTH - PAD.right} y1={averageY} y2={averageY} />
        <text x={WIDTH - PAD.right} y={averageY - 6} textAnchor="end">
          Average {formatDollars(stats.averageCents)}
        </text>
      </g>

      {highlightDates.map((date) => {
        const index = fares.findIndex((fare) => fare.date === date);
        if (index < 0) return null;
        return <circle key={date} className="fc-trend-deal" cx={x(index)} cy={y(fares[index].cents)} r={4} />;
      })}

      {selected && (
        <g className="fc-trend-selected" style={{ transform: `translate(${x(selectedIndex)}px, ${y(selected.cents)}px)` }}>
          <line x1={0} x2={0} y1={0} y2={bottom - y(selected.cents)} />
          <circle r={7} />
          <text y={-14} textAnchor={selectedIndex > fares.length * 0.8 ? 'end' : selectedIndex < fares.length * 0.15 ? 'start' : 'middle'}>
            Your date · {formatDollars(selected.cents)}
          </text>
        </g>
      )}

      {hovered && hover !== null && (
        <g className="fc-trend-hover" aria-hidden="true">
          <line x1={x(hover)} x2={x(hover)} y1={PAD.top - 6} y2={bottom} />
          <circle cx={x(hover)} cy={y(hovered.cents)} r={5} />
          <g transform={`translate(${Math.min(Math.max(x(hover), PAD.left + 62), WIDTH - PAD.right - 62)}, ${PAD.top - 22})`}>
            <rect x={-62} y={-14} width={124} height={24} rx={7} />
            <text y={3} textAnchor="middle">
              {shortDayLabel(hovered.date)} · {formatDollars(hovered.cents)}
            </text>
          </g>
        </g>
      )}

      <rect
        className="fc-trend-hit"
        x={PAD.left}
        y={0}
        width={INNER_W}
        height={HEIGHT}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
      />
    </svg>
  );
}
