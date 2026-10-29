import { findAirport } from './airports';
import { clockMinutes, momentAt, type RebookLeg } from './rebooking';

type IcsInput = {
  confirmation: string;
  legs: RebookLeg[];
  travelers: number;
  now?: Date;
};

/** A local .ics file with one event per leg. Times are floating local airport times. */
export function buildIcs({ confirmation, legs, travelers, now = new Date() }: IcsInput): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FlyLo-Air//Sample rebooking//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];

  for (const leg of legs) {
    const start = clockMinutes(leg.departs);
    const end = momentAt(leg.date, start + leg.durationMinutes);
    const from = findAirport(leg.from)?.city ?? leg.from;
    const to = findAirport(leg.to)?.city ?? leg.to;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${confirmation}-${leg.id}@flylo-air.example`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsLocal(leg.date, leg.departs)}`,
      `DTEND:${icsLocal(end.date, end.clock)}`,
      `SUMMARY:${escapeText(`FlyLo-Air ${leg.flightNumber} ${leg.from} to ${leg.to}`)}`,
      `LOCATION:${escapeText(`${from} (${leg.from})`)}`,
      `DESCRIPTION:${escapeText(
        `SAMPLE booking ${confirmation}. ${from} to ${to}, ${travelers} ${travelers === 1 ? 'traveler' : 'travelers'}. ` +
          'FlyLo-Air is a fictional airline. Fly more. Pay less.',
      )}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

function icsLocal(date: string, clock: string): string {
  return `${date.replace(/-/g, '')}T${clock.replace(':', '')}00`;
}

function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(` ${line.slice(i, i + 74)}`);
  return parts.join('\r\n');
}
