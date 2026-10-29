import type { Metadata } from 'next';
import Link from 'next/link';
import { SearchForm } from '@/components/SearchForm';
import { getI18n } from '@/i18n/server';
import { findAirport } from '@/lib/airports';
import { defaultTravelDate, isoDate } from '@/lib/dates';
import { isIsoDate, searchFlights } from '@/lib/flights';
import { param, passengerCount, type SearchParams } from '@/lib/params';
import { perTravelerCents } from '@/lib/pricing';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('results.meta') };
}

export default async function ResultsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const i18n = await getI18n();
  const { t } = i18n;
  const from = findAirport(param(params, 'from'));
  const to = findAirport(param(params, 'to'));
  const rawDate = param(params, 'date');
  const date = isIsoDate(rawDate) ? rawDate : defaultTravelDate();
  const passengers = passengerCount(param(params, 'passengers'));
  const flights = from && to ? searchFlights(from.code, to.code, date) : [];
  const travelers = i18n.tc('common.travelers', passengers);
  const note = i18n.currencyNote();

  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <p className="eyebrow">{t('results.step')}</p>
          <h1>{from && to ? t('common.route', { from: i18n.city(from.code), to: i18n.city(to.code) }) : t('results.find')}</h1>
          <p>
            {i18n.date(date)} · {t('search.oneWay')} · {travelers}
          </p>
        </div>
      </section>

      <div className="wrap section">
        <details className="card" style={{ marginBottom: '1.5rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{t('results.edit')}</summary>
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
            <h2>{t('results.emptyTitle')}</h2>
            <p className="muted">{t('results.emptyBody')}</p>
            <Link className="btn" href="/">
              {t('results.emptyCta')}
            </Link>
          </div>
        ) : (
          <>
            <div className="results-summary">
              <h2 style={{ margin: 0 }}>{i18n.tc('results.count', flights.length)}</h2>
              <p className="muted" style={{ margin: 0 }}>
                {t('results.taxes')}
              </p>
            </div>
            {note && <p className="currency-note">{note}</p>}
            <ol className="flight-list">
              {flights.map((flight) => {
                const stops = flight.stops === 0 ? t('common.nonstop') : t('common.oneStop');
                return (
                  <li key={flight.id} className="card flight" aria-labelledby={`${flight.id}-title`}>
                    <div>
                      <h3 id={`${flight.id}-title`} className="visually-hidden">
                        {t('results.flightLabel', { flight: flight.flightNumber, departs: flight.departs, arrives: flight.arrives })}
                      </h3>
                      <div className="flight-times">
                        <p className="flight-time" style={{ margin: 0 }}>
                          {flight.departs}
                          <small>{flight.from}</small>
                        </p>
                        <div className="flight-line" aria-hidden="true">
                          {i18n.duration(flight.durationMinutes)}
                          <div className="bar" />
                          {stops}
                        </div>
                        <p className="flight-time" style={{ margin: 0, textAlign: 'right' }}>
                          {flight.arrives}
                          {flight.arrivesNextDay && <sup> +1</sup>}
                          <small>{flight.to}</small>
                        </p>
                      </div>
                      <p className="flight-meta">
                        {flight.flightNumber} · {flight.aircraft} · {stops}, {i18n.duration(flight.durationMinutes)}
                      </p>
                    </div>
                    <div className="fare-options" role="group" aria-label={t('results.faresFor', { flight: flight.flightNumber })}>
                      {flight.fares.map((fare) => {
                        const price = i18n.price(perTravelerCents(fare));
                        return (
                          <Link
                            key={fare.key}
                            className="fare-option"
                            href={`/checkout?flight=${encodeURIComponent(flight.id)}&fare=${fare.key}&passengers=${passengers}`}
                            aria-label={t('results.selectFare', { fare: i18n.fare(fare.key), flight: flight.flightNumber, price })}
                          >
                            <span className="fare-name">{i18n.fare(fare.key)}</span>
                            <span className="fare-price">{price}</span>
                            <span className="fare-note">{i18n.perk(fare.key, 0, fare.perks[0])}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </>
  );
}
