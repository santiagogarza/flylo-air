import { randomInt } from 'node:crypto';
import { findFare, findFlight, MAX_PASSENGERS } from '@/lib/flights';
import { validateCard, type CardDetails } from '@/lib/payment';
import { buildLineItems, sumLineItems, type Traveler } from '@/lib/pricing';
import { asString, json, readJson, type ServerContext } from './http';

export const PAYMENT_DECLINED = 'Payment could not be processed.';

export async function handleCheckout(request: Request, ctx: ServerContext): Promise<Response> {
  const parsed = await readJson(request);
  if ('error' in parsed) return json(400, { ok: false, error: parsed.error });
  const body = parsed.value;

  const flight = findFlight(asString(body.flightId));
  const fare = flight ? findFare(flight, asString(body.fare)) : undefined;
  if (!flight || !fare) return json(404, { ok: false, error: 'That flight is no longer available.' });

  const travelers = readTravelers(body.travelers);
  if (!travelers) return json(400, { ok: false, error: 'Add a first and last name for every traveler.' });

  const email = asString(body.email).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { ok: false, error: 'Enter a contact email.' });

  const cardInput = (body.card ?? {}) as Record<string, unknown>;
  const card: CardDetails = {
    name: asString(cardInput.name),
    number: asString(cardInput.number),
    expiry: asString(cardInput.expiry),
    cvc: asString(cardInput.cvc),
  };
  if (Object.keys(validateCard(card)).length > 0) return json(400, { ok: false, error: 'Check your card details.' });

  const items = buildLineItems(fare, travelers);
  const chargeCents = sumLineItems(items);
  const quotedCents = body.amountCents;
  if (typeof quotedCents !== 'number' || chargeCents !== quotedCents) {
    ctx.log('checkout declined: amount check failed', { flight: flight.id, fare: fare.key, quotedCents, chargeCents });
    return json(402, { ok: false, error: PAYMENT_DECLINED });
  }

  const bookingReference = `FLY-${randomInt(10000, 100000)}`;
  ctx.log('checkout approved', bookingReference, flight.id, fare.key);
  return json(200, { ok: true, bookingReference, amountCents: chargeCents });
}

function readTravelers(value: unknown): Traveler[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_PASSENGERS) return null;
  const travelers: Traveler[] = [];
  for (const item of value) {
    const record = (item ?? {}) as Record<string, unknown>;
    const firstName = asString(record.firstName).trim();
    const lastName = asString(record.lastName).trim();
    if (!firstName || !lastName || firstName.length > 60 || lastName.length > 60) return null;
    travelers.push({ firstName, lastName });
  }
  return travelers;
}
