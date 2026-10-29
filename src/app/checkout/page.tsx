import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckoutForm } from '@/components/CheckoutForm';
import { findFare, findFlight } from '@/lib/flights';
import { param, passengerCount, type SearchParams } from '@/lib/params';

export const metadata: Metadata = { title: 'Checkout' };

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const flight = findFlight(param(params, 'flight'));
  const fare = flight ? findFare(flight, param(params, 'fare')) : undefined;
  const passengers = passengerCount(param(params, 'passengers'));

  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <p className="eyebrow">Step 2 of 2 · Checkout</p>
          <h1>Review and pay</h1>
          <p>Add traveler details and pay to confirm your seats.</p>
        </div>
      </section>
      <div className="wrap section">
        {flight && fare ? (
          <CheckoutForm key={`${flight.id}-${fare.key}-${passengers}`} flight={flight} fare={fare} passengers={passengers} />
        ) : (
          <div className="card empty-state">
            <h2>That flight is no longer available</h2>
            <p className="muted">Search again to see current flights and fares.</p>
            <Link className="btn" href="/">
              Search flights
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
