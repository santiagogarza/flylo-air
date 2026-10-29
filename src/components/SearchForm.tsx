'use client';

import { useState } from 'react';
import { useI18n } from '@/i18n/client';
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
  const i18n = useI18n();
  const { t } = i18n;
  const same = origin === destination;

  return (
    <form action="/results" method="get" className={compact ? 'search-compact' : undefined} aria-label={t('search.label')}>
      {!compact && (
        <div className="trip-type" aria-hidden="true">
          <span>{t('search.oneWay')}</span>
        </div>
      )}
      <div className="search-grid">
        <div className="field">
          <label htmlFor="search-from">{t('search.from')}</label>
          <select id="search-from" name="from" value={origin} onChange={(event) => setOrigin(event.target.value)}>
            {AIRPORTS.map((airport) => (
              <option key={airport.code} value={airport.code}>
                {i18n.city(airport.code)} ({airport.code})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="search-to">{t('search.to')}</label>
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
                {i18n.city(airport.code)} ({airport.code})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="search-date">{t('search.depart')}</label>
          <input id="search-date" name="date" type="date" defaultValue={date} min={minDate} required />
        </div>
        <div className="field">
          <label htmlFor="search-passengers">{t('search.travelers')}</label>
          <select id="search-passengers" name="passengers" defaultValue={String(passengers)}>
            {Array.from({ length: MAX_PASSENGERS }, (_, i) => i + 1).map((count) => (
              <option key={count} value={count}>
                {i18n.tc('common.travelers', count)}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-lg" type="submit" disabled={same}>
          {t('search.submit')}
        </button>
      </div>
      {same && (
        <p id="search-same" className="field-error" style={{ marginTop: '0.75rem' }}>
          {t('search.same')}
        </p>
      )}
    </form>
  );
}
