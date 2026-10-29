import type { CSSProperties } from 'react';
import { PlaneIcon } from '@/components/icons';
import { formatTripDate } from '@/lib/flights';
import { formatClock, legTimes, momentAt, type RebookOption } from '@/lib/rebooking';

export type TimelineSegment = { start: number; end: number; kind: 'flight' | 'layover' };

export type TimelineRow = {
  key: string;
  label: string;
  detail: string;
  tone: 'canceled' | 'original' | 'new';
  segments: TimelineSegment[];
  badge?: string;
};

const HOUR = 60;

export function optionSegments(option: RebookOption, base: string): TimelineSegment[] {
  const segments: TimelineSegment[] = [];
  option.legs.forEach((leg, index) => {
    const times = legTimes(leg, base);
    if (index > 0) segments.push({ start: segments[segments.length - 1].end, end: times.departAt, kind: 'layover' });
    segments.push({ start: times.departAt, end: times.arriveAt, kind: 'flight' });
  });
  return segments;
}

/** Original schedule against the new one, on one shared hour axis. */
export function ScheduleTimeline({ base, rows, summary }: { base: string; rows: TimelineRow[]; summary: string }) {
  const all = rows.flatMap((row) => row.segments);
  const start = Math.floor((Math.min(...all.map((s) => s.start)) - HOUR) / HOUR) * HOUR;
  const end = Math.ceil((Math.max(...all.map((s) => s.end)) + HOUR) / HOUR) * HOUR;
  const span = end - start;
  const step = span <= 14 * HOUR ? 2 * HOUR : span <= 30 * HOUR ? 4 * HOUR : 8 * HOUR;
  const ticks: number[] = [];
  for (let t = Math.ceil(start / step) * step; t <= end; t += step) ticks.push(t);
  const pct = (minutes: number) => `${((minutes - start) / span) * 100}%`;

  return (
    <figure className="tl">
      <figcaption className="visually-hidden">{summary}</figcaption>
      <div className="tl-grid" aria-hidden="true">
        {rows.map((row, index) => {
          const first = row.segments[0];
          const last = row.segments[row.segments.length - 1];
          return (
            <div key={row.key} className="tl-row" data-tone={row.tone} style={{ '--row': index } as CSSProperties}>
              <div className="tl-label">
                <strong>{row.label}</strong>
                <span>{row.detail}</span>
              </div>
              <div className="tl-track">
                {ticks.map((tick) => (
                  <span key={tick} className="tl-gridline" style={{ left: pct(tick) }} />
                ))}
                {row.segments.map((segment) => (
                  <span
                    key={`${segment.kind}-${segment.start}`}
                    className="tl-seg"
                    data-kind={segment.kind}
                    style={{ left: pct(segment.start), width: `calc(${pct(segment.end)} - ${pct(segment.start)})` }}
                  />
                ))}
                {row.tone !== 'canceled' && (
                  <span className="tl-plane" style={{ '--from': pct(first.start), '--to': pct(last.end) } as CSSProperties}>
                    <PlaneIcon className="tl-plane-icon" />
                  </span>
                )}
                {row.tone === 'canceled' && (
                  <span className="tl-stamp" style={{ left: pct((first.start + last.end) / 2) }}>
                    Canceled
                  </span>
                )}
                {row.badge && (
                  <span className="tl-badge" style={{ left: pct(last.end) }}>
                    {row.badge}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <div className="tl-row tl-axis-row">
          <span />
          <div className="tl-axis">
            {ticks.map((tick) => {
              const moment = momentAt(base, tick);
              const newDay = tick % (24 * HOUR) === 0 || tick === ticks[0];
              return (
                <span key={tick} className="tl-tick" style={{ left: pct(tick) }}>
                  {formatClock(tick)}
                  {newDay && <small>{formatTripDate(moment.date)}</small>}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </figure>
  );
}

/** A small bar across the option's departure day, with a marker at the original arrival time. */
export function OptionBar({ option, base, originalArrival }: { option: RebookOption; base: string; originalArrival: number }) {
  const dayStart = (Math.floor(option.departAt / (24 * HOUR)) * 24 + 5) * HOUR;
  const span = 24 * HOUR;
  const clamp = (minutes: number) => Math.min(100, Math.max(0, ((minutes - dayStart) / span) * 100));
  const marker = originalArrival >= dayStart && originalArrival <= dayStart + span ? clamp(originalArrival) : null;

  return (
    <div className="option-bar" aria-hidden="true">
      <div className="option-bar-track">
        {optionSegments(option, base).map((segment) => (
          <span
            key={`${segment.kind}-${segment.start}`}
            className="option-bar-seg"
            data-kind={segment.kind}
            style={{ left: `${clamp(segment.start)}%`, width: `${clamp(segment.end) - clamp(segment.start)}%` }}
          />
        ))}
        {marker !== null && (
          <span className="option-bar-marker" style={{ left: `${marker}%` }}>
            <span>Original arrival</span>
          </span>
        )}
      </div>
      <div className="option-bar-scale">
        {[6, 12, 18, 24].map((hour) => (
          <span key={hour} style={{ left: `${((hour - 5) / 24) * 100}%` }}>
            {formatClock(hour * HOUR)}
          </span>
        ))}
      </div>
    </div>
  );
}
