import type { Metadata } from 'next';
import { FlightTracker } from '@/components/FlightTracker';
import { param, type SearchParams } from '@/lib/params';

export const metadata: Metadata = { title: 'Flight status' };

export default async function FlightStatusPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  return (
    <>
      <section className="page-head tracker-head">
        <div className="wrap">
          <p className="eyebrow">Live flight status · sample data</p>
          <h1>Flight status</h1>
          <p>Follow every FlyLo-Air nonstop in the sky today. Fly more. Pay less. Worry less.</p>
        </div>
      </section>
      <FlightTracker initialFlight={param(params, 'flight')} />
    </>
  );
}
