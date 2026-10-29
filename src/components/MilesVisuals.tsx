'use client';

import { useEffect, useRef, useState } from 'react';
import { LogoMark } from '@/components/icons';
import { formatMiles, type MonthTotal, type Tier, type TierProgress } from '@/lib/miles';

export function usePrefersReducedMotion(): boolean {
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

/** Animates a number toward `target` whenever it changes. Jumps straight there when motion is reduced. */
export function useCountUp(target: number, { from = target, duration = 1200 }: { from?: number; duration?: number } = {}): number {
  const [value, setValue] = useState(from);
  const valueRef = useRef(from);

  useEffect(() => {
    const start = valueRef.current;
    if (start === target) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      valueRef.current = target;
      setValue(target);
      return;
    }
    let frame = 0;
    const began = performance.now();
    const tick = (time: number) => {
      const t = Math.min(1, (time - began) / duration);
      const eased = 1 - (1 - t) ** 3;
      const next = Math.round(start + (target - start) * eased);
      valueRef.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function ProgressRing({ qualifying, progress }: { qualifying: number; progress: TierProgress }) {
  const [drawn, setDrawn] = useState(false);
  const shown = useCountUp(qualifying, { from: 0, duration: 1600 });

  useEffect(() => {
    const timer = window.setTimeout(() => setDrawn(true), 80);
    return () => window.clearTimeout(timer);
  }, []);

  const offset = RING_CIRCUMFERENCE * (1 - (drawn ? progress.fraction : 0));
  const percent = Math.round(progress.fraction * 100);
  const label = progress.next
    ? `Tier progress: ${formatMiles(qualifying)} qualifying miles. ${percent}% of the way from ${progress.tier.name} to ${progress.next.name}, ${formatMiles(progress.toNext)} miles to go.`
    : `Tier progress: ${formatMiles(qualifying)} qualifying miles. You have reached ${progress.tier.name}, our top tier.`;

  return (
    <figure className="miles-ring" data-tier={progress.next?.key ?? progress.tier.key}>
      <svg viewBox="0 0 120 120" role="img" aria-label={label}>
        <circle className="miles-ring-track" cx="60" cy="60" r={RING_RADIUS} />
        <circle
          className="miles-ring-bar"
          cx="60"
          cy="60"
          r={RING_RADIUS}
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <figcaption className="miles-ring-center" aria-hidden="true">
        <span className="miles-ring-value">{formatMiles(shown)}</span>
        <span className="miles-ring-unit">qualifying miles</span>
        {progress.next && <span className="miles-ring-target">of {formatMiles(progress.next.threshold)}</span>}
      </figcaption>
    </figure>
  );
}

export function Sparkline({ months }: { months: MonthTotal[] }) {
  const width = 600;
  const height = 110;
  const pad = 10;
  const max = Math.max(1, ...months.map((month) => month.miles));
  const step = (width - pad * 2) / (months.length - 1);
  const points = months.map((month, index) => [pad + index * step, height - pad - (month.miles / max) * (height - pad * 2)] as const);
  const line = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${points[points.length - 1][0].toFixed(1)} ${height - pad} L${pad} ${height - pad} Z`;
  const total = months.reduce((sum, month) => sum + month.miles, 0);
  const label = `Miles earned per month over the last 12 months, ${formatMiles(total)} in total: ${months
    .map((month) => `${month.label} ${formatMiles(month.miles)}`)
    .join(', ')}.`;

  return (
    <div className="sparkline">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        <defs>
          <linearGradient id="sparkline-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#1d4ed8" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#sparkline-fill)" />
        <path className="sparkline-line" d={line} pathLength={1} />
        {points.map(([x, y], index) =>
          months[index].miles > 0 ? <circle key={months[index].month} cx={x} cy={y} r="4.5" className="sparkline-dot" /> : null,
        )}
      </svg>
      <div className="sparkline-labels" aria-hidden="true">
        {months.map((month) => (
          <span key={month.month}>{month.label.slice(0, 1)}</span>
        ))}
      </div>
    </div>
  );
}

export function TierCard({ tier, name, number, validThru }: { tier: Tier; name: string; number: string; validThru: string }) {
  return (
    <div className="member-card" data-tier={tier.key} role="img" aria-label={`FlyLo Miles ${tier.name} membership card for ${name}, member number ${number}, valid through ${validThru}.`}>
      <div className="member-card-shine" aria-hidden="true" />
      <div className="member-card-top" aria-hidden="true">
        <span className="member-card-brand">
          <LogoMark className="member-card-logo" />
          FlyLo Miles
        </span>
        <span className="member-card-tier">{tier.name}</span>
      </div>
      <svg className="member-card-chip" viewBox="0 0 44 34" aria-hidden="true" focusable="false">
        <rect x="1" y="1" width="42" height="32" rx="6" />
        <path d="M1 12h12M1 22h12M31 12h12M31 22h12M13 1v32M31 1v32M13 17h18" />
      </svg>
      <div className="member-card-bottom" aria-hidden="true">
        <div>
          <span className="member-card-label">Member</span>
          <span className="member-card-name">{name}</span>
        </div>
        <div>
          <span className="member-card-label">Number</span>
          <span className="member-card-number">{number}</span>
        </div>
        <div>
          <span className="member-card-label">Valid thru</span>
          <span className="member-card-number">{validThru}</span>
        </div>
      </div>
    </div>
  );
}

const CONFETTI_COLORS = ['#f97316', '#1d4ed8', '#fde68a', '#60a5fa', '#047857', '#fdba74'];

export function Confetti() {
  const pieces = Array.from({ length: 90 }, (_, index) => {
    const spread = (index * 37) % 100;
    return {
      left: `${spread}%`,
      delay: `${((index * 53) % 120) / 100}s`,
      duration: `${3.2 + ((index * 29) % 18) / 10}s`,
      drift: `${((index * 71) % 160) - 80}px`,
      spin: `${360 + ((index * 97) % 540)}deg`,
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
      shape: index % 3,
    };
  });
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((piece, index) => (
        <span
          key={index}
          className={`confetti-piece shape-${piece.shape}`}
          style={
            {
              left: piece.left,
              background: piece.color,
              animationDelay: piece.delay,
              animationDuration: piece.duration,
              '--drift': piece.drift,
              '--spin': piece.spin,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
