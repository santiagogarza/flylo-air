import type { Metadata } from 'next';
import Link from 'next/link';
import { SearchForm } from '@/components/SearchForm';
import { findAirport } from '@/lib/airports';
import { defaultTravelDate, isoDate } from '@/lib/dates';
import { formatDuration, formatTripDate, isIsoDate, searchFlights } from '@/lib/flights';
import { param, passengerCount, type SearchParams } from '@/lib/params';
import { formatCents, perTravelerCents } from '@/lib/pricing';

export const metadata: Metadata = { title: 'Choose a flight' };

export default async function ResultsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const from = findAirport(param(params, 'from'));
  const to = findAirport(param(params, 'to'));
  const rawDate = param(params, 'date');
  const date = isIsoDate(rawDate) ? rawDate : defaultTravelDate();
  const passengers = passengerCount(param(params, 'passengers'));
  const flights = from && to ? searchFlights(from.code, to.code, date) : [];
  const travelers = `${passengers} ${passengers === 1 ? 'traveler' : 'travelers'}`;

  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <p className="eyebrow">Step 1 of 2 · Choose a flight</p>
          <h1>
            {from && to ? `${from.city} to ${to.city}` : 'Find a flight'}
          </h1>
          <p>
            {formatTripDate(date)} · One way · {travelers}
          </p>
        </div>
      </section>

      <div className="wrap section">
        <details className="card" style={{ marginBottom: '1.5rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Edit search</summary>
          <div style={{ marginTop: '1rem' }}>
            <SearchForm
              compact
              from={from?.code}
              to={to?.code}
              date={date}
              minDate={isoDate(new Date())}
              passengers={passengers}
            />
          </div>
        </details>

        {flights.length === 0 ? (
          <div className="card empty-state">
            <h2>No flights for that search</h2>
            <p className="muted">Pick two different airports and a valid date.</p>
            <Link className="btn" href="/">
              Start a new search
            </Link>
          </div>
        ) : (
          <>
            <div className="results-summary">
              <h2 style={{ margin: 0 }}>
                {flights.length} flights · prices per traveler
              </h2>
              <p className="muted" style={{ margin: 0 }}>
                Taxes and fees included
              </p>
            </div>
            <ol className="flight-list">
              {flights.map((flight) => (
                <li key={flight.id} className="card flight" aria-labelledby={`${flight.id}-title`}>
                  <div>
                    <h3 id={`${flight.id}-title`} className="visually-hidden">
                      {flight.flightNumber}, departs {flight.departs}, arrives {flight.arrives}
                    </h3>
                    <div className="flight-times">
                      <p className="flight-time" style={{ margin: 0 }}>
                        {flight.departs}
                        <small>{flight.from}</small>
                      </p>
                      <div className="flight-line" aria-hidden="true">
                        {formatDuration(flight.durationMinutes)}
                        <div className="bar" />
                        {flight.stops === 0 ? 'Nonstop' : '1 stop'}
                      </div>
                      <p className="flight-time" style={{ margin: 0, textAlign: 'right' }}>
                        {flight.arrives}
                        {flight.arrivesNextDay && <sup> +1</sup>}
                        <small>{flight.to}</small>
                      </p>
                    </div>
                    <p className="flight-meta">
                      {flight.flightNumber} · {flight.aircraft} · {flight.stops === 0 ? 'Nonstop' : '1 stop'},{' '}
                      {formatDuration(flight.durationMinutes)}
                    </p>
                  </div>
                  <div className="fare-options" role="group" aria-label={`Fares for ${flight.flightNumber}`}>
                    {flight.fares.map((fare) => (
                      <Link
                        key={fare.key}
                        className="fare-option"
                        href={`/checkout?flight=${encodeURIComponent(flight.id)}&fare=${fare.key}&passengers=${passengers}`}
                        aria-label={`Select ${fare.name} on ${flight.flightNumber} for ${formatCents(perTravelerCents(fare))} per traveler`}
                      >
                        <span className="fare-name">{fare.name}</span>
                        <span className="fare-price">{formatCents(perTravelerCents(fare))}</span>
                        <span className="fare-note">{fare.perks[0]}</span>
                      </Link>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </>
  );
}
