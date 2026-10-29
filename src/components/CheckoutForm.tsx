'use client';

import Link from 'next/link';
import { cloneElement, useRef, useState } from 'react';
import { CheckIcon, LockIcon } from '@/components/icons';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/config';
import type { Fare, Flight } from '@/lib/flights';
import { DEMO_CARD, formatCardNumber, formatExpiry, validateCard, type CardDetails, type CardErrors } from '@/lib/payment';
import { buildLineItems, formatCents, quoteCents, toCents, type Traveler } from '@/lib/pricing';

type Props = {
  flight: Flight;
  fare: Fare;
  passengers: number;
};

type Status = 'idle' | 'paying' | 'declined' | 'failed' | 'booked';

type Message = { key: MessageKey } | { server: string };

const SAMPLE_TRAVELERS: Traveler[] = [
  { firstName: 'Maya', lastName: 'Chen' },
  { firstName: 'Leo', lastName: 'Chen' },
  { firstName: 'Ava', lastName: 'Chen' },
  { firstName: 'Sam', lastName: 'Chen' },
  { firstName: 'Noor', lastName: 'Chen' },
  { firstName: 'Kai', lastName: 'Chen' },
];

const EMPTY_CARD: CardDetails = { name: '', number: '', expiry: '', cvc: '' };

export function CheckoutForm({ flight, fare, passengers }: Props) {
  const [travelers, setTravelers] = useState<Traveler[]>(() =>
    Array.from({ length: passengers }, () => ({ firstName: '', lastName: '' })),
  );
  const [email, setEmail] = useState('');
  const [card, setCard] = useState<CardDetails>(EMPTY_CARD);
  const [errors, setErrors] = useState<{ travelers: boolean[]; email?: MessageKey; card: CardErrors }>({ travelers: [], card: {} });
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState<Message | null>(null);
  const [bookingReference, setBookingReference] = useState('');
  const alertRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);

  const totalCents = quoteCents(fare, travelers.length);
  const taxesCents = toCents(fare.taxes) * travelers.length;
  const items = buildLineItems(fare, travelers);
  const i18n = useI18n();
  const { t } = i18n;
  const route = t('common.route', { from: i18n.city(flight.from), to: i18n.city(flight.to) });
  const stops = flight.stops === 0 ? t('common.nonstop') : t('common.oneStop');
  const fareName = i18n.fare(fare.key);
  const showsUsd = i18n.config.currency === 'USD';
  const note = i18n.currencyNote();

  const updateTraveler = (index: number, key: keyof Traveler, value: string) => {
    setTravelers((current) => current.map((traveler, i) => (i === index ? { ...traveler, [key]: value } : traveler)));
  };

  const fillSample = () => {
    setTravelers((current) => current.map((_, i) => SAMPLE_TRAVELERS[i % SAMPLE_TRAVELERS.length]));
    setEmail('maya.chen@example.com');
    setCard(DEMO_CARD);
    setErrors({ travelers: [], card: {} });
  };

  const focusAlert = () => window.setTimeout(() => alertRef.current?.focus(), 0);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === 'paying') return;
    const travelerErrors = travelers.map((traveler) => !traveler.firstName.trim() || !traveler.lastName.trim());
    const emailError = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? undefined : 'checkout.emailError';
    const cardErrors = validateCard(card);
    setErrors({ travelers: travelerErrors, email: emailError, card: cardErrors });
    if (travelerErrors.some(Boolean) || emailError || Object.keys(cardErrors).length > 0) {
      setStatus('failed');
      setMessage({ key: 'checkout.fixFields' });
      focusAlert();
      return;
    }

    setStatus('paying');
    setMessage(null);
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          flightId: flight.id,
          fare: fare.key,
          travelers: travelers.map((traveler) => ({ firstName: traveler.firstName.trim(), lastName: traveler.lastName.trim() })),
          email: email.trim(),
          card,
          amountCents: totalCents,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; bookingReference?: string; error?: string };
      if (response.ok && payload.ok && payload.bookingReference) {
        setBookingReference(payload.bookingReference);
        setStatus('booked');
        window.setTimeout(() => successRef.current?.focus(), 0);
        return;
      }
      setStatus(response.status === 402 ? 'declined' : 'failed');
      setMessage(payload.error ? { server: payload.error } : { key: 'error.declined' });
    } catch {
      setStatus('declined');
      setMessage({ key: 'error.declined' });
    }
    focusAlert();
  };

  if (status === 'booked') {
    return (
      <section className="card success" aria-labelledby="booked-title">
        <div className="success-icon">
          <CheckIcon className="btn-icon" />
        </div>
        <h1 id="booked-title" tabIndex={-1} style={{ fontSize: '2rem' }}>
          {t('checkout.booked')}
        </h1>
        <p className="muted">{t('checkout.reference')}</p>
        <p className="ref">{bookingReference}</p>
        <p>
          {flight.flightNumber} · {route} · {t('checkout.departsAt', { date: i18n.date(flight.date), time: flight.departs })}
        </p>
        <p className="muted">
          {i18n.tc('checkout.paid', travelers.length, {
            price: showsUsd ? i18n.price(totalCents) : `${i18n.price(totalCents)} (${formatCents(totalCents)})`,
            email,
          })}
        </p>
        <div className="inline-actions">
          <Link className="btn" href="/">
            {t('checkout.bookAnother')}
          </Link>
          <Link className="btn btn-ghost" href="/support/">
            {t('checkout.contact')}
          </Link>
        </div>
      </section>
    );
  }

  const showAlert = status === 'declined' || status === 'failed';

  return (
    <div className="checkout-layout">
      <form className="form-stack" onSubmit={onSubmit} noValidate aria-label={t('checkout.formLabel')}>
        <div ref={alertRef} tabIndex={-1} aria-live="assertive">
          {showAlert && message && (
            <div className="alert alert-error" role="alert">
              <p>
                <strong>{'key' in message ? t(message.key) : i18n.error(message.server)}</strong>
              </p>
              {status === 'declined' && (
                <p>{i18n.rich('checkout.declinedHelp', { link: <Link href="/support/">{t('checkout.declinedLink')}</Link> })}</p>
              )}
            </div>
          )}
        </div>

        <section className="card" aria-labelledby="travelers-title">
          <div className="card-head">
            <h2 id="travelers-title">{t('checkout.who')}</h2>
            <button type="button" className="btn-link" onClick={fillSample}>
              {t('checkout.fillSample')}
            </button>
          </div>
          {travelers.map((traveler, index) => {
            const invalid = errors.travelers[index];
            return (
              <fieldset key={index} className="traveler">
                <legend className="visually-hidden">{t('checkout.traveler', { n: index + 1 })}</legend>
                <h3 aria-hidden="true">
                  {t('checkout.traveler', { n: index + 1 })}
                  {index === 0 ? ` · ${t('checkout.primary')}` : ''}
                </h3>
                <div className="form-grid">
                  <div className={`field${invalid && !traveler.firstName.trim() ? ' is-invalid' : ''}`}>
                    <label htmlFor={`t${index}-first`}>{t('checkout.firstName')}</label>
                    <input
                      id={`t${index}-first`}
                      autoComplete={index === 0 ? 'given-name' : 'off'}
                      value={traveler.firstName}
                      onChange={(event) => updateTraveler(index, 'firstName', event.target.value)}
                      aria-invalid={invalid && !traveler.firstName.trim() ? true : undefined}
                      required
                    />
                  </div>
                  <div className={`field${invalid && !traveler.lastName.trim() ? ' is-invalid' : ''}`}>
                    <label htmlFor={`t${index}-last`}>{t('checkout.lastName')}</label>
                    <input
                      id={`t${index}-last`}
                      autoComplete={index === 0 ? 'family-name' : 'off'}
                      value={traveler.lastName}
                      onChange={(event) => updateTraveler(index, 'lastName', event.target.value)}
                      aria-invalid={invalid && !traveler.lastName.trim() ? true : undefined}
                      required
                    />
                  </div>
                </div>
                {invalid && <p className="field-error">{t('checkout.nameError')}</p>}
              </fieldset>
            );
          })}
          <div className="form-grid" style={{ marginTop: '1rem' }}>
            <div className={`field full${errors.email ? ' is-invalid' : ''}`}>
              <label htmlFor="contact-email">{t('checkout.email')}</label>
              <input
                id="contact-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? 'contact-email-error' : undefined}
                required
              />
              {errors.email && (
                <p className="field-error" id="contact-email-error">
                  {t(errors.email)}
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="card" aria-labelledby="payment-title">
          <div className="card-head">
            <h2 id="payment-title">{t('checkout.payment')}</h2>
            <span className="muted" style={{ fontSize: '0.88rem' }}>
              {t('checkout.demoCard')}
            </span>
          </div>
          <div className="form-grid">
            <CardField id="card-name" label={t('checkout.cardName')} error={errors.card.name && i18n.error(errors.card.name)} className="full">
              <input
                id="card-name"
                autoComplete="cc-name"
                value={card.name}
                onChange={(event) => setCard({ ...card, name: event.target.value })}
              />
            </CardField>
            <CardField id="card-number" label={t('checkout.cardNumber')} error={errors.card.number && i18n.error(errors.card.number)} className="full">
              <input
                id="card-number"
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="1234 1234 1234 1234"
                value={card.number}
                onChange={(event) => setCard({ ...card, number: formatCardNumber(event.target.value) })}
              />
            </CardField>
            <CardField id="card-expiry" label={t('checkout.cardExpiry')} error={errors.card.expiry && i18n.error(errors.card.expiry)}>
              <input
                id="card-expiry"
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder={t('checkout.cardExpiryPlaceholder')}
                value={card.expiry}
                onChange={(event) => setCard({ ...card, expiry: formatExpiry(event.target.value) })}
              />
            </CardField>
            <CardField id="card-cvc" label={t('checkout.cardCvc')} error={errors.card.cvc && i18n.error(errors.card.cvc)}>
              <input
                id="card-cvc"
                inputMode="numeric"
                autoComplete="cc-csc"
                maxLength={4}
                value={card.cvc}
                onChange={(event) => setCard({ ...card, cvc: event.target.value.replace(/\D/g, '') })}
              />
            </CardField>
          </div>
          <button type="submit" className="btn btn-lg pay-btn" disabled={status === 'paying'} style={{ marginTop: '1.25rem' }}>
            <LockIcon className="btn-icon" />
            {status === 'paying' ? t('checkout.processing') : t('checkout.pay', { price: i18n.price(totalCents) })}
          </button>
          <p className="secure-note">
            <LockIcon className="btn-icon" /> {t('checkout.secure')}
          </p>
        </section>
      </form>

      <aside className="card summary-card" aria-labelledby="summary-title">
        <p className="eyebrow">{t('checkout.summary')}</p>
        <h2 id="summary-title" className="summary-route">
          {i18n.city(flight.from)} → {i18n.city(flight.to)}
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          {i18n.date(flight.date)} · {flight.departs}–{flight.arrives}
          {flight.arrivesNextDay ? ' +1' : ''} · {i18n.duration(flight.durationMinutes)}
        </p>
        <p className="muted">
          {flight.flightNumber} · {t('checkout.fare', { fare: fareName })} · {stops}
        </p>
        <ul className="summary-lines">
          {items.map((item, index) => (
            <li key={index}>
              <span>
                {`${travelers[index].firstName} ${travelers[index].lastName}`.trim() || t('checkout.traveler', { n: index + 1 })} · {fareName}
              </span>
              <span>{i18n.price(toCents(item.amount))}</span>
            </li>
          ))}
          <li className="muted" style={{ fontSize: '0.88rem' }}>
            <span>{t('checkout.includesTaxes')}</span>
            <span>{i18n.price(taxesCents)}</span>
          </li>
        </ul>
        <p className="summary-total">
          <span>{t('checkout.total')}</span>
          <span>{i18n.price(totalCents)}</span>
        </p>
        {!showsUsd && (
          <p className="summary-charged">
            <span>{t('checkout.chargedUsd')}</span>
            <span>{formatCents(totalCents)}</span>
          </p>
        )}
        {note && <p className="currency-note">{note}</p>}
        <ul className="muted" style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.9rem' }}>
          {fare.perks.map((perk, index) => (
            <li key={perk}>{i18n.perk(fare.key, index, perk)}</li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function CardField({
  id,
  label,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  className?: string;
  children: React.ReactElement<React.InputHTMLAttributes<HTMLInputElement>>;
}) {
  return (
    <div className={['field', className, error ? 'is-invalid' : ''].filter(Boolean).join(' ')}>
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, {
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? `${id}-error` : undefined,
      })}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
