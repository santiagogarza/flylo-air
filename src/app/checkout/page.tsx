import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckoutForm } from '@/components/CheckoutForm';
import { getI18n } from '@/i18n/server';
import { findFare, findFlight } from '@/lib/flights';
import { param, passengerCount, type SearchParams } from '@/lib/params';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('checkout.meta') };
}

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { t } = await getI18n();
  const flight = findFlight(param(params, 'flight'));
  const fare = flight ? findFare(flight, param(params, 'fare')) : undefined;
  const passengers = passengerCount(param(params, 'passengers'));

  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <p className="eyebrow">{t('checkout.step')}</p>
          <h1>{t('checkout.title')}</h1>
          <p>{t('checkout.lead')}</p>
        </div>
      </section>
      <div className="wrap section">
        {flight && fare ? (
          <CheckoutForm key={`${flight.id}-${fare.key}-${passengers}`} flight={flight} fare={fare} passengers={passengers} />
        ) : (
          <div className="card empty-state">
            <h2>{t('checkout.goneTitle')}</h2>
            <p className="muted">{t('checkout.goneBody')}</p>
            <Link className="btn" href="/">
              {t('checkout.goneCta')}
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
