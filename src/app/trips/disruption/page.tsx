import type { Metadata } from 'next';
import Link from 'next/link';
import { DisruptionCenter } from '@/components/DisruptionCenter';
import { isoDate } from '@/lib/dates';
import { findFare, findFlight, type FareKey } from '@/lib/flights';
import { param, passengerCount, type SearchParams } from '@/lib/params';
import { quoteCents } from '@/lib/pricing';
import { SAMPLE_BOOKING, buildAlternatives, disruptionFor, sampleBookingFlight, toLeg } from '@/lib/rebooking';

export const metadata: Metadata = { title: 'Disruption and rebooking' };

export default async function DisruptionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const flight = findFlight(param(params, 'flight'));
  const fare = flight ? findFare(flight, param(params, 'fare')) : undefined;
  const passengers = passengerCount(param(params, 'passengers'));

  if (!flight || !fare) {
    return (
      <>
        <section className="page-head">
          <div className="wrap">
            <p className="eyebrow">Manage trip</p>
            <h1>We couldn&apos;t find that trip</h1>
            <p>The link may be out of date. Look up your booking to see its latest status.</p>
          </div>
        </section>
        <div className="wrap section">
          <div className="card empty-state">
            <h2>Let&apos;s find your booking</h2>
            <p className="muted">Use your booking reference and last name.</p>
            <Link className="btn" href="/trips">
              Look up a trip
            </Link>
          </div>
        </div>
      </>
    );
  }

  const leg = toLeg(flight);
  const isSample = sampleBookingFlight()?.id === flight.id && fare.key === SAMPLE_BOOKING.fare && passengers === SAMPLE_BOOKING.travelers.length;
  const fareNames = Object.fromEntries(flight.fares.map((option) => [option.key, option.name])) as Record<FareKey, string>;

  return (
    <DisruptionCenter
      key={`${flight.id}-${fare.key}-${passengers}`}
      flight={leg}
      fare={fare.key}
      fareNames={fareNames}
      passengers={passengers}
      disruption={disruptionFor(flight)}
      options={buildAlternatives(leg, fare.key, isoDate(new Date()))}
      refundCents={quoteCents(fare, passengers)}
      booking={isSample ? { reference: SAMPLE_BOOKING.reference, travelers: SAMPLE_BOOKING.travelers } : null}
    />
  );
}
