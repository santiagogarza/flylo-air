import Link from 'next/link';
import { ClockIcon, HeadsetIcon, RouteArt, SeatIcon } from '@/components/icons';
import { SearchForm } from '@/components/SearchForm';
import { getI18n } from '@/i18n/server';
import { defaultTravelDate, isoDate } from '@/lib/dates';
import { searchFlights } from '@/lib/flights';
import { perTravelerCents } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

const POPULAR = [
  ['SFO', 'JFK'],
  ['SEA', 'LAX'],
  ['BOS', 'MIA'],
  ['DEN', 'HNL'],
] as const;

export default async function HomePage() {
  const date = defaultTravelDate();
  const today = isoDate(new Date());
  const i18n = await getI18n();
  const { t } = i18n;
  const note = i18n.currencyNote();

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <RouteArt className="hero-plane" />
        <div className="wrap">
          <p className="eyebrow">{t('home.eyebrow')}</p>
          <h1 id="hero-title">{t('home.title')}</h1>
          <p className="lead">{t('home.lead')}</p>
        </div>
      </section>

      <div className="wrap">
        <section className="search-card" aria-labelledby="search-title">
          <h2 id="search-title" className="visually-hidden">
            {t('home.searchTitle')}
          </h2>
          <SearchForm date={date} minDate={today} />
        </section>

        <section className="section" aria-labelledby="popular-title">
          <h2 id="popular-title">{t('home.popular')}</h2>
          <p className="muted">{t('home.popularNote')}</p>
          <div className="grid-3">
            {POPULAR.map(([from, to]) => {
              const flights = searchFlights(from, to, date);
              const cheapest = Math.min(...flights.map((flight) => perTravelerCents(flight.fares[0])));
              return (
                <Link key={`${from}-${to}`} className="card deal" href={`/results?from=${from}&to=${to}&date=${date}&passengers=1`}>
                  <div>
                    <p className="eyebrow">{t('common.route', { from: i18n.city(from), to: i18n.city(to) })}</p>
                    <p className="deal-route">
                      {from} → {to}
                    </p>
                  </div>
                  <p className="deal-price">{t('home.fromPrice', { price: i18n.price(cheapest) })}</p>
                </Link>
              );
            })}
          </div>
          {note && <p className="currency-note">{note}</p>}
        </section>

        <section className="section" aria-labelledby="why-title">
          <h2 id="why-title">{t('home.why')}</h2>
          <div className="grid-3">
            <div className="card feature">
              <div className="feature-icon">
                <SeatIcon className="btn-icon" />
              </div>
              <h3>{t('home.why.room.title')}</h3>
              <p>{t('home.why.room.body')}</p>
            </div>
            <div className="card feature">
              <div className="feature-icon">
                <ClockIcon className="btn-icon" />
              </div>
              <h3>{t('home.why.time.title')}</h3>
              <p>{t('home.why.time.body')}</p>
            </div>
            <div className="card feature">
              <div className="feature-icon">
                <HeadsetIcon className="btn-icon" />
              </div>
              <h3>{t('home.why.support.title')}</h3>
              <p>{i18n.rich('home.why.support.body', { link: <Link href="/support/">{t('home.why.support.link')}</Link> })}</p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
