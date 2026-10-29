import Link from 'next/link';
import { ClockIcon, HeadsetIcon, RouteArt, SeatIcon } from '@/components/icons';
import { IntentPrefetchLink } from '@/components/IntentPrefetchLink';
import { SearchForm } from '@/components/SearchForm';
import { defaultTravelDate, isoDate } from '@/lib/dates';
import { popularDeals } from '@/lib/deals';
import { formatCents } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const date = defaultTravelDate();
  const today = isoDate(new Date());

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <RouteArt className="hero-plane" />
        <div className="wrap">
          <p className="eyebrow">Fares that land softly</p>
          <h1 id="hero-title">Fly more. Pay less.</h1>
          <p className="lead">Nonstop routes across the country, fair prices for every traveler, and a support team that picks up.</p>
        </div>
      </section>

      <div className="wrap">
        <section className="search-card" aria-labelledby="search-title">
          <h2 id="search-title" className="visually-hidden">
            Search flights
          </h2>
          <SearchForm date={date} minDate={today} />
        </section>

        <section className="section" aria-labelledby="popular-title">
          <h2 id="popular-title">Popular routes</h2>
          <p className="muted">One-way fares per traveler, taxes and fees included.</p>
          <div className="grid-3">
            {popularDeals(date).map(({ from, to, fromCity, toCity, cheapestCents }) => (
              <Link key={`${from}-${to}`} className="card deal" href={`/results?from=${from}&to=${to}&date=${date}&passengers=1`}>
                <div>
                  <p className="eyebrow">
                    {fromCity} to {toCity}
                  </p>
                  <p className="deal-route">
                    {from} → {to}
                  </p>
                </div>
                <p className="deal-price">From {formatCents(cheapestCents)}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="why-title">
          <h2 id="why-title">Why FlyLo-Air</h2>
          <div className="grid-3">
            <div className="card feature">
              <div className="feature-icon">
                <SeatIcon className="btn-icon" />
              </div>
              <h3>Room to breathe</h3>
              <p>Every Main seat comes with a carry-on and a seat you choose.</p>
            </div>
            <div className="card feature">
              <div className="feature-icon">
                <ClockIcon className="btn-icon" />
              </div>
              <h3>On time, mostly</h3>
              <p>Short turnarounds and nonstop routes keep your day on schedule.</p>
            </div>
            <div className="card feature">
              <div className="feature-icon">
                <HeadsetIcon className="btn-icon" />
              </div>
              <h3>Support that answers</h3>
              <p>
                Call us right from your browser. <IntentPrefetchLink href="/support/">Talk to support</IntentPrefetchLink>.
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
