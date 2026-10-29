'use client';

import { useState } from 'react';
import { AIRPORTS } from '@/lib/airports';
import { MAX_PASSENGERS } from '@/lib/flights';

type Props = {
  from?: string;
  to?: string;
  date: string;
  minDate: string;
  passengers?: number;
  compact?: boolean;
};

export function SearchForm({ from = 'SFO', to = 'JFK', date, minDate, passengers = 1, compact = false }: Props) {
  const [origin, setOrigin] = useState(from);
  const [destination, setDestination] = useState(to);
  const same = origin === destination;

  return (
    <form action="/results" method="get" className={compact ? 'search-compact' : undefined} role="search" aria-label="Search flights">
      {!compact && (
        <p className="trip-type">
          <span>One way</span>
        </p>
      )}
      <div className="search-grid">
        <div className="field">
          <label htmlFor="search-from">From</label>
          <select id="search-from" name="from" value={origin} onChange={(event) => setOrigin(event.target.value)}>
            {AIRPORTS.map((airport) => (
              <option key={airport.code} value={airport.code}>
                {airport.city} ({airport.code})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="search-to">To</label>
          <select
            id="search-to"
            name="to"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            aria-invalid={same}
            aria-describedby={same ? 'search-same' : undefined}
          >
            {AIRPORTS.map((airport) => (
              <option key={airport.code} value={airport.code}>
                {airport.city} ({airport.code})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="search-date">Depart</label>
          <input id="search-date" name="date" type="date" defaultValue={date} min={minDate} required />
        </div>
        <div className="field">
          <label htmlFor="search-passengers">Travelers</label>
          <select id="search-passengers" name="passengers" defaultValue={String(passengers)}>
            {Array.from({ length: MAX_PASSENGERS }, (_, i) => i + 1).map((count) => (
              <option key={count} value={count}>
                {count} {count === 1 ? 'traveler' : 'travelers'}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-lg" type="submit" disabled={same}>
          Search flights
        </button>
      </div>
      <div aria-live="polite">
        {same && (
          <p id="search-same" className="field-error" style={{ marginTop: '0.75rem' }}>
            Choose a different destination.
          </p>
        )}
      </div>
    </form>
  );
}
