import type { Metadata } from 'next';
import { SupportCall } from '@/components/SupportCall';

export const metadata: Metadata = { title: 'Call FlyLo-Air Support' };

export default function SupportPage() {
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <p className="eyebrow">Help center</p>
          <h1>Call FlyLo-Air Support</h1>
          <p>Booking trouble, refunds, changes or bags: talk to us right here, and we&apos;ll fill in the ticket while you talk.</p>
        </div>
      </section>
      <div className="wrap section">
        <SupportCall />
      </div>
    </>
  );
}
