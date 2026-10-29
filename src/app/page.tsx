import Link from 'next/link';
import { ClockIcon, HeadsetIcon, RouteArt, SeatIcon } from '@/components/icons';
import { SearchForm } from '@/components/SearchForm';
import { findAirport } from '@/lib/airports';
import { defaultTravelDate, isoDate } from '@/lib/dates';
import { searchFlights } from '@/lib/flights';
import { formatCents, perTravelerCents } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

const POPULAR = [
  ['SFO', 'JFK'],
  ['SEA', 'LAX'],
  ['BOS', 'MIA'],
  ['DEN', 'HNL'],
] as const;

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
            {POPULAR.map(([from, to]) => {
              const flights = searchFlights(from, to, date);
              const cheapest = Math.min(...flights.map((flight) => perTravelerCents(flight.fares[0])));
              return (
                <Link key={`${from}-${to}`} className="card deal" href={`/results?from=${from}&to=${to}&date=${date}&passengers=1`}>
                  <div>
                    <p className="eyebrow">
                      {findAirport(from)?.city} to {findAirport(to)?.city}
                    </p>
                    <p className="deal-route">
                      {from} <span aria-hidden="true">→</span>
                      <span className="visually-hidden">to</span> {to}
                    </p>
                  </div>
                  <p className="deal-price">From {formatCents(cheapest)}</p>
                </Link>
              );
            })}
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
                Call us right from your browser. <Link href="/support/">Talk to support</Link>.
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
