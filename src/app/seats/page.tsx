import type { Metadata } from 'next';
import Link from 'next/link';
import { SeatMap } from '@/components/SeatMap';
import { findAirport } from '@/lib/airports';
import { findFare, findFlight, formatTripDate } from '@/lib/flights';
import { param, passengerCount, type SearchParams } from '@/lib/params';

export const metadata: Metadata = { title: 'Choose seats' };

export default async function SeatsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const flight = findFlight(param(params, 'flight'));
  const fare = flight ? findFare(flight, param(params, 'fare')) : undefined;
  const passengers = passengerCount(param(params, 'passengers'));
  const origin = flight ? findAirport(flight.from) : undefined;
  const destination = flight ? findAirport(flight.to) : undefined;

  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <p className="eyebrow">Optional · Choose seats</p>
          <h1>Pick your seats</h1>
          <p>
            {flight
              ? `${flight.flightNumber} · ${origin?.city} to ${destination?.city} · ${formatTripDate(flight.date)} · ${flight.aircraft}`
              : 'Fly more. Pay less. Sit where you like.'}
          </p>
        </div>
      </section>
      <div className="wrap section">
        {flight && fare ? (
          <SeatMap key={`${flight.id}-${fare.key}-${passengers}`} flight={flight} fare={fare} passengers={passengers} />
        ) : (
          <div className="card empty-state">
            <h2>That flight is no longer available</h2>
            <p className="muted">Search again to see current flights and seats.</p>
            <Link className="btn" href="/">
              Search flights
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
