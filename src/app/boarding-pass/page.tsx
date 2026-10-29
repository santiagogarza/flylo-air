import type { Metadata } from 'next';
import Link from 'next/link';
import { BoardingPass } from '@/components/BoardingPass';
import { boardingPassHref, buildBoardingPass, SAMPLE_PASSENGER } from '@/lib/boarding';
import { defaultTravelDate } from '@/lib/dates';
import { findFare, findFlight, searchFlights } from '@/lib/flights';
import { param, type SearchParams } from '@/lib/params';

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ['flight', 'fare', 'name', 'seat']) {
    const value = param(params, key);
    if (value) query.set(key, value);
  }
  const manifest = `/boarding-pass/manifest.webmanifest${query.size ? `?${query.toString()}` : ''}`;
  return {
    title: 'Boarding pass',
    manifest,
    icons: {
      icon: [{ url: '/boarding-pass/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      apple: [{ url: '/boarding-pass/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
    appleWebApp: { capable: true, title: 'FlyLo Pass', statusBarStyle: 'black-translucent' },
  };
}

export default async function BoardingPassPage({ searchParams }: Props) {
  const params = await searchParams;
  const flight = findFlight(param(params, 'flight'));
  const fare = flight ? findFare(flight, param(params, 'fare')) : undefined;

  if (!flight || !fare) {
    const sample = searchFlights('SFO', 'JFK', defaultTravelDate())[1];
    return (
      <>
        <section className="page-head">
          <div className="wrap">
            <p className="eyebrow">Boarding pass</p>
            <h1>We couldn&apos;t find that pass</h1>
            <p>The link may be incomplete. Open your pass from the booking confirmation, or try a sample.</p>
          </div>
        </section>
        <div className="wrap section">
          <div className="card empty-state">
            <h2>No boarding pass for that link</h2>
            <p className="muted">Passes need a flight and a fare. Here&apos;s a sample one so you can look around.</p>
            <div className="inline-actions">
              {sample && (
                <Link className="btn" href={boardingPassHref(sample.id, 'main', SAMPLE_PASSENGER)}>
                  Open a sample pass
                </Link>
              )}
              <Link className="btn btn-ghost" href="/">
                Search flights
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  const pass = buildBoardingPass(flight, fare, param(params, 'name'), param(params, 'seat'));
  return (
    <section className="pass-stage" aria-label={`Boarding pass for ${pass.passenger.display}`}>
      <div className="wrap">
        <BoardingPass key={`${pass.flightId}-${pass.fareKey}-${pass.passenger.display}-${pass.seat}`} pass={pass} />
      </div>
    </section>
  );
}
