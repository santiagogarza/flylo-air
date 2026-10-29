'use client';

import Link from 'next/link';
import { cloneElement, useEffect, useRef, useState } from 'react';
import { CheckIcon, LockIcon } from '@/components/icons';
import { findAirport } from '@/lib/airports';
import { formatDuration, formatTripDate, type Fare, type Flight } from '@/lib/flights';
import { DEMO_CARD, formatCardNumber, formatExpiry, validateCard, type CardDetails, type CardErrors } from '@/lib/payment';
import { buildLineItems, formatCents, quoteCents, toCents, type Traveler } from '@/lib/pricing';

type Props = {
  flight: Flight;
  fare: Fare;
  passengers: number;
};

type Status = 'idle' | 'paying' | 'declined' | 'failed' | 'booked';

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
  const [errors, setErrors] = useState<{ travelers: boolean[]; email?: string; card: CardErrors }>({ travelers: [], card: {} });
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [bookingReference, setBookingReference] = useState('');
  const alertRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const payingRef = useRef(false);

  useEffect(() => {
    if (status === 'booked') successRef.current?.focus();
  }, [status]);

  const totalCents = quoteCents(fare, travelers.length);
  const taxesCents = toCents(fare.taxes) * travelers.length;
  const items = buildLineItems(fare, travelers);
  const origin = findAirport(flight.from);
  const destination = findAirport(flight.to);

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
    if (payingRef.current) return;
    const travelerErrors = travelers.map((traveler) => !traveler.firstName.trim() || !traveler.lastName.trim());
    const emailError = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? undefined : 'Enter an email for your confirmation.';
    const cardErrors = validateCard(card);
    setErrors({ travelers: travelerErrors, email: emailError, card: cardErrors });
    if (travelerErrors.some(Boolean) || emailError || Object.keys(cardErrors).length > 0) {
      setStatus('failed');
      setMessage('Check the highlighted fields, then pay again.');
      focusAlert();
      return;
    }

    payingRef.current = true;
    setStatus('paying');
    setMessage('');
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
      setMessage(payload.error || 'Payment could not be processed.');
    } catch {
      setStatus('declined');
      setMessage('Payment could not be processed.');
    } finally {
      payingRef.current = false;
    }
    focusAlert();
  };

  if (status === 'booked') {
    return (
      <section className="card success" aria-labelledby="booked-title">
        <div className="success-icon">
          <CheckIcon className="btn-icon" />
        </div>
        <h2 id="booked-title" ref={successRef} tabIndex={-1} style={{ fontSize: '2rem' }}>
          You&apos;re booked
        </h2>
        <p className="muted">Your booking reference</p>
        <p className="ref">{bookingReference}</p>
        <p>
          {flight.flightNumber} · {origin?.city} to {destination?.city} · {formatTripDate(flight.date)} at {flight.departs}
        </p>
        <p className="muted">
          {travelers.length} {travelers.length === 1 ? 'traveler' : 'travelers'} · {formatCents(totalCents)} paid. We sent the details to {email}.
        </p>
        <div className="inline-actions">
          <Link className="btn" href="/">
            Book another trip
          </Link>
          <Link className="btn btn-ghost" href="/support/">
            Contact support
          </Link>
        </div>
      </section>
    );
  }

  const showAlert = status === 'declined' || status === 'failed';
  const fieldErrors = [
    ...errors.travelers.flatMap((invalid, index) =>
      invalid ? [{ id: `t${index}-${travelers[index]?.firstName.trim() ? 'last' : 'first'}`, text: `Traveler ${index + 1}: enter a first and last name.` }] : [],
    ),
    ...(errors.email ? [{ id: 'contact-email', text: errors.email }] : []),
    ...(['name', 'number', 'expiry', 'cvc'] as const).flatMap((key) => {
      const text = errors.card[key];
      return text ? [{ id: `card-${key}`, text }] : [];
    }),
  ];

  return (
    <div className="checkout-layout">
      <form className="form-stack" onSubmit={onSubmit} noValidate aria-label="Checkout">
        <div ref={alertRef} tabIndex={-1} className="alert-focus">
          {showAlert && (
            <div className="alert alert-error" role="alert">
              <p>
                <strong>{message}</strong>
              </p>
              {status === 'failed' && fieldErrors.length > 0 && (
                <ul>
                  {fieldErrors.map((error) => (
                    <li key={error.id}>
                      <a href={`#${error.id}`}>{error.text}</a>
                    </li>
                  ))}
                </ul>
              )}
              {status === 'declined' && (
                <p>
                  Your card was not charged. Try again, or <Link href="/support/">call FlyLo-Air Support</Link> and we&apos;ll
                  help you finish your booking.
                </p>
              )}
            </div>
          )}
        </div>

        <section className="card" aria-labelledby="travelers-title">
          <div className="card-head">
            <h2 id="travelers-title">Who&apos;s flying</h2>
            <button type="button" className="btn-link" onClick={fillSample}>
              Fill sample details
            </button>
          </div>
          <p className="form-note">All fields are required.</p>
          {travelers.map((traveler, index) => {
            const invalid = errors.travelers[index];
            const errorId = invalid ? `t${index}-error` : undefined;
            return (
              <fieldset key={index} className="traveler">
                <legend className="traveler-title">
                  Traveler {index + 1}
                  {index === 0 ? ' · Primary contact' : ''}
                </legend>
                <div className="form-grid">
                  <div className={`field${invalid && !traveler.firstName.trim() ? ' is-invalid' : ''}`}>
                    <label htmlFor={`t${index}-first`}>First name</label>
                    <input
                      id={`t${index}-first`}
                      autoComplete={index === 0 ? 'given-name' : 'off'}
                      value={traveler.firstName}
                      onChange={(event) => updateTraveler(index, 'firstName', event.target.value)}
                      aria-invalid={invalid && !traveler.firstName.trim() ? true : undefined}
                      aria-describedby={errorId}
                      required
                    />
                  </div>
                  <div className={`field${invalid && !traveler.lastName.trim() ? ' is-invalid' : ''}`}>
                    <label htmlFor={`t${index}-last`}>Last name</label>
                    <input
                      id={`t${index}-last`}
                      autoComplete={index === 0 ? 'family-name' : 'off'}
                      value={traveler.lastName}
                      onChange={(event) => updateTraveler(index, 'lastName', event.target.value)}
                      aria-invalid={invalid && !traveler.lastName.trim() ? true : undefined}
                      aria-describedby={errorId}
                      required
                    />
                  </div>
                </div>
                {invalid && (
                  <p className="field-error" id={errorId}>
                    Enter a first and last name as shown on the ID.
                  </p>
                )}
              </fieldset>
            );
          })}
          <div className="form-grid" style={{ marginTop: '1rem' }}>
            <div className={`field full${errors.email ? ' is-invalid' : ''}`}>
              <label htmlFor="contact-email">Email for confirmation</label>
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
                  {errors.email}
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="card" aria-labelledby="payment-title">
          <div className="card-head">
            <h2 id="payment-title">Payment</h2>
            <span id="card-demo-note" className="muted" style={{ fontSize: '0.88rem' }}>
              Demo only. Use card 4242 4242 4242 4242.
            </span>
          </div>
          <div className="form-grid">
            <CardField id="card-name" label="Name on card" error={errors.card.name} className="full">
              <input
                id="card-name"
                autoComplete="cc-name"
                value={card.name}
                onChange={(event) => setCard({ ...card, name: event.target.value })}
                required
              />
            </CardField>
            <CardField id="card-number" label="Card number" error={errors.card.number} hintId="card-demo-note" className="full">
              <input
                id="card-number"
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="1234 1234 1234 1234"
                value={card.number}
                onChange={(event) => setCard({ ...card, number: formatCardNumber(event.target.value) })}
                required
              />
            </CardField>
            <CardField id="card-expiry" label="Expiry (MM/YY)" error={errors.card.expiry}>
              <input
                id="card-expiry"
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="MM/YY"
                value={card.expiry}
                onChange={(event) => setCard({ ...card, expiry: formatExpiry(event.target.value) })}
                required
              />
            </CardField>
            <CardField id="card-cvc" label="Security code" error={errors.card.cvc}>
              <input
                id="card-cvc"
                inputMode="numeric"
                autoComplete="cc-csc"
                maxLength={4}
                value={card.cvc}
                onChange={(event) => setCard({ ...card, cvc: event.target.value.replace(/\D/g, '') })}
                required
              />
            </CardField>
          </div>
          <button
            type="submit"
            className="btn btn-lg pay-btn"
            aria-disabled={status === 'paying' ? true : undefined}
            style={{ marginTop: '1.25rem' }}
          >
            <LockIcon className="btn-icon" />
            {status === 'paying' ? 'Processing…' : `Pay ${formatCents(totalCents)}`}
          </button>
          <p className="visually-hidden" role="status">
            {status === 'paying' ? 'Processing your payment…' : ''}
          </p>
          <p className="secure-note">
            <LockIcon className="btn-icon" /> No real payment is taken. This is a sample checkout.
          </p>
        </section>
      </form>

      <aside className="card summary-card" aria-labelledby="summary-title">
        <p className="eyebrow">Trip summary</p>
        <h2 id="summary-title" className="summary-route">
          {origin?.city} <span aria-hidden="true">→</span>
          <span className="visually-hidden">to</span> {destination?.city}
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          {formatTripDate(flight.date)} · {flight.departs}–{flight.arrives}
          {flight.arrivesNextDay ? ' +1' : ''} · {formatDuration(flight.durationMinutes)}
        </p>
        <p className="muted">
          {flight.flightNumber} · {fare.name} fare · {flight.stops === 0 ? 'Nonstop' : '1 stop'}
        </p>
        <ul className="summary-lines">
          {items.map((item, index) => (
            <li key={index}>
              <span>{item.label}</span>
              <span>{formatCents(toCents(item.amount))}</span>
            </li>
          ))}
          <li className="muted" style={{ fontSize: '0.88rem' }}>
            <span>Includes taxes and fees</span>
            <span>{formatCents(taxesCents)}</span>
          </li>
        </ul>
        <p className="summary-total">
          <span>Total</span>
          <span>{formatCents(totalCents)}</span>
        </p>
        <ul className="muted" style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.9rem' }}>
          {fare.perks.map((perk) => (
            <li key={perk}>{perk}</li>
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
  hintId,
  className,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hintId?: string;
  className?: string;
  children: React.ReactElement<React.InputHTMLAttributes<HTMLInputElement>>;
}) {
  const describedBy = [error ? `${id}-error` : '', hintId ?? ''].filter(Boolean).join(' ');
  return (
    <div className={['field', className, error ? 'is-invalid' : ''].filter(Boolean).join(' ')}>
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, {
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy || undefined,
      })}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
