import type { Metadata } from 'next';
import Link from 'next/link';
import { TripLookup } from '@/components/TripLookup';
import { SAMPLE_BOOKING, sampleBookingHref } from '@/lib/rebooking';

export const metadata: Metadata = { title: 'Manage trip' };
export const dynamic = 'force-dynamic';

export default function ManageTripPage() {
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <p className="eyebrow">Manage trip</p>
          <h1>Find your booking</h1>
          <p>Check your flight status, change flights for free when plans go sideways, or get your money back.</p>
        </div>
      </section>
      <div className="wrap section">
        <div className="trip-lookup-layout">
          <section className="card" aria-labelledby="lookup-title">
            <h2 id="lookup-title">Look up a trip</h2>
            <p className="muted">You&apos;ll find your booking reference in your confirmation email. It starts with FLY-.</p>
            <TripLookup href={sampleBookingHref() ?? '/'} sampleReference={SAMPLE_BOOKING.reference} sampleLastName={SAMPLE_BOOKING.lastName} />
          </section>
          <aside className="card trip-lookup-aside" aria-labelledby="lookup-help-title">
            <h2 id="lookup-help-title">When flights change</h2>
            <ul className="trip-lookup-points">
              <li>Free rebooking on any FlyLo-Air flight, fare difference waived.</li>
              <li>Prefer not to fly? Get a refund to your original payment, or a travel credit worth 10% more.</li>
              <li>
                Need a person? <Link href="/support/">Talk to FlyLo-Air Support</Link>.
              </li>
            </ul>
          </aside>
        </div>
      </div>
    </>
  );
}
