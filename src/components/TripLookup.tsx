'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { SearchIcon } from '@/components/icons';
import { matchesSampleBooking } from '@/lib/rebooking';

type Props = {
  href: string;
  sampleReference: string;
  sampleLastName: string;
};

type Status = 'idle' | 'not-found' | 'found';

export function TripLookup({ href, sampleReference, sampleLastName }: Props) {
  const router = useRouter();
  const [reference, setReference] = useState('');
  const [lastName, setLastName] = useState('');
  const [errors, setErrors] = useState<{ reference?: string; lastName?: string }>({});
  const [status, setStatus] = useState<Status>('idle');
  const alertRef = useRef<HTMLDivElement>(null);

  const fillSample = () => {
    setReference(sampleReference);
    setLastName(sampleLastName);
    setErrors({});
    setStatus('idle');
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = {
      reference: /^FLY-?\d{5}$/i.test(reference.trim()) ? undefined : 'Enter a booking reference like FLY-48213.',
      lastName: lastName.trim() ? undefined : 'Enter the last name on the booking.',
    };
    setErrors(next);
    if (next.reference || next.lastName) {
      setStatus('idle');
      return;
    }
    if (!matchesSampleBooking(reference, lastName)) {
      setStatus('not-found');
      window.setTimeout(() => alertRef.current?.focus(), 0);
      return;
    }
    setStatus('found');
    router.push(href);
  };

  return (
    <form className="form-stack" onSubmit={onSubmit} noValidate aria-label="Look up a trip">
      <div className="form-grid">
        <div className={`field${errors.reference ? ' is-invalid' : ''}`}>
          <label htmlFor="lookup-reference">Booking reference</label>
          <input
            id="lookup-reference"
            name="reference"
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="FLY-48213"
            value={reference}
            onChange={(event) => setReference(event.target.value.toUpperCase())}
            aria-invalid={Boolean(errors.reference)}
            aria-describedby={errors.reference ? 'lookup-reference-error' : undefined}
          />
          {errors.reference && (
            <p id="lookup-reference-error" className="field-error">
              {errors.reference}
            </p>
          )}
        </div>
        <div className={`field${errors.lastName ? ' is-invalid' : ''}`}>
          <label htmlFor="lookup-last-name">Last name</label>
          <input
            id="lookup-last-name"
            name="lastName"
            autoComplete="family-name"
            placeholder="Chen"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            aria-invalid={Boolean(errors.lastName)}
            aria-describedby={errors.lastName ? 'lookup-last-name-error' : undefined}
          />
          {errors.lastName && (
            <p id="lookup-last-name-error" className="field-error">
              {errors.lastName}
            </p>
          )}
        </div>
      </div>

      {status === 'not-found' && (
        <div ref={alertRef} tabIndex={-1} className="alert alert-error" role="alert">
          <p>
            <strong>We couldn&apos;t find that booking.</strong> Check the reference and last name. This sample site has one booking:{' '}
            {sampleReference}, last name {sampleLastName}.
          </p>
        </div>
      )}

      <div className="trip-lookup-actions">
        <button className="btn btn-lg" type="submit" disabled={status === 'found'}>
          <SearchIcon className="btn-icon" />
          {status === 'found' ? 'Opening your trip…' : 'Find my trip'}
        </button>
        <button className="btn btn-ghost" type="button" onClick={fillSample}>
          Use sample booking {sampleReference}
        </button>
      </div>
      <p className="muted trip-lookup-sample" role="status">
        {status === 'found' ? 'Found it. Opening your trip.' : ''}
      </p>
    </form>
  );
}
