import { describe, expect, it } from 'vitest';
import { searchFlights } from '@/lib/flights';
import { DEMO_CARD } from '@/lib/payment';
import { quoteCents } from '@/lib/pricing';
import { handleCheckout, PAYMENT_DECLINED } from '@/server/checkout';
import { context, post } from './helpers';

const [flight] = searchFlights('SFO', 'JFK', '2026-11-12');
const fare = flight.fares[1];

function order(overrides: Record<string, unknown> = {}) {
  return {
    flightId: flight.id,
    fare: fare.key,
    travelers: [{ firstName: 'Maya', lastName: 'Chen' }],
    email: 'maya.chen@example.com',
    card: DEMO_CARD,
    amountCents: quoteCents(fare, 1),
    ...overrides,
  };
}

describe('POST /api/checkout', () => {
  it('books a single traveler at the quoted price', async () => {
    const response = await handleCheckout(post('/api/checkout', order()), context());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.bookingReference).toMatch(/^FLY-\d{5}$/);
    expect(body.amountCents).toBe(quoteCents(fare, 1));
  });

  it('books two travelers at the quoted price', async () => {
    const travelers = [
      { firstName: 'Maya', lastName: 'Chen' },
      { firstName: 'Leo', lastName: 'Chen' },
    ];
    const response = await handleCheckout(post('/api/checkout', order({ travelers, amountCents: quoteCents(fare, 2) })), context());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.amountCents).toBe(quoteCents(fare, 2));
  });

  it('declines when the quoted amount is out of date', async () => {
    const response = await handleCheckout(post('/api/checkout', order({ amountCents: quoteCents(fare, 1) - 100 })), context());
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ ok: false, error: PAYMENT_DECLINED });
  });

  it('rejects an unknown flight or fare', async () => {
    expect((await handleCheckout(post('/api/checkout', order({ flightId: 'SFO-JFK-2026-11-12-9' })), context())).status).toBe(404);
    expect((await handleCheckout(post('/api/checkout', order({ fare: 'first' })), context())).status).toBe(404);
  });

  it('requires traveler names, an email and a valid card', async () => {
    const ctx = context();
    expect((await handleCheckout(post('/api/checkout', order({ travelers: [] })), ctx)).status).toBe(400);
    expect((await handleCheckout(post('/api/checkout', order({ travelers: [{ firstName: 'Maya' }] })), ctx)).status).toBe(400);
    expect((await handleCheckout(post('/api/checkout', order({ email: 'maya' })), ctx)).status).toBe(400);
    expect((await handleCheckout(post('/api/checkout', order({ card: { ...DEMO_CARD, number: '4242' } })), ctx)).status).toBe(400);
  });

  it('rejects bodies that are not JSON', async () => {
    const response = await handleCheckout(post('/api/checkout', 'nope'), context());
    expect(response.status).toBe(400);
  });
});
