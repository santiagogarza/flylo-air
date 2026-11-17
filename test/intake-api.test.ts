import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCreateTicket, resetTickets } from '@/server/tickets';
import { context, post } from './helpers';

const WEBHOOK_URL = 'https://hooks.example.test/support';
const LAKE_URL = 'https://hooks.example.test/lakeline';
const env = {
  SUPPORT_WEBHOOK_URL: WEBHOOK_URL,
  SUPPORT_WEBHOOK_HEADER: 'x-flylo-key',
  SUPPORT_WEBHOOK_KEY: 'support-key',
  LAKELINE_WEBHOOK_URL: LAKE_URL,
  LAKELINE_WEBHOOK_KEY: 'lake-key',
};

const supportTicket = {
  fullName: 'Maya Chen',
  bookingReference: 'fly 48213',
  email: ' Maya.Chen@Example.com ',
  category: 'Checkout / payment',
  description: 'Checkout keeps failing at payment for me and my son.',
  channel: 'voice',
};

const lakelineFields = {
  fullName: 'José Núñez',
  loanNumber: 'laf 20417',
  email: ' Jose.Nunez@Example.com ',
  reason: 'Tuve una factura médica y necesito mover el pago unas semanas.',
  requestedChange: 'Payment extension',
  callbackWindow: 'Tardes',
};

function webhook(status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response('{}', { status }));
}

beforeEach(() => {
  resetTickets();
});

describe('POST /api/tickets scenario payloads', () => {
  it('keeps the /support payload shape and keys', async () => {
    const fetchImpl = webhook();
    const response = await handleCreateTicket(post('/api/tickets', supportTicket), context(env, fetchImpl as unknown as typeof fetch));
    expect(response.status).toBe(201);
    const [, init] = fetchImpl.mock.calls[0];
    const sent = JSON.parse(String(init?.body));
    expect(Object.keys(sent)).toEqual([
      'id',
      'createdAt',
      'channel',
      'fullName',
      'bookingReference',
      'email',
      'category',
      'description',
      'summary',
    ]);
    expect(sent).toMatchObject({
      id: 'FLY-SUP-1001',
      channel: 'voice',
      fullName: 'Maya Chen',
      bookingReference: 'FLY-48213',
      email: 'maya.chen@example.com',
      category: 'Checkout / payment',
    });
    expect(sent.scenario).toBeUndefined();
    expect(sent.fields).toBeUndefined();
    expect(fetchImpl.mock.calls[0][0]).toBe(WEBHOOK_URL);
    expect(new Headers(init?.headers).get('x-flylo-key')).toBe('support-key');
  });

  it('posts a Lakeline ticket to the Lakeline webhook', async () => {
    const fetchImpl = webhook();
    const response = await handleCreateTicket(
      post('/api/tickets', { scenario: 'lakeline-hardship', channel: 'voice', fields: lakelineFields }),
      context(env, fetchImpl as unknown as typeof fetch),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ ok: true, id: 'LAF-REQ-1001', status: 'received' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(LAKE_URL);
    expect(new Headers(init?.headers).get('x-flylo-key')).toBe('lake-key');
    const sent = JSON.parse(String(init?.body));
    expect(Object.keys(sent)).toEqual(['scenario', 'id', 'createdAt', 'channel', 'fields', 'category', 'summary', 'description']);
    expect(sent.scenario).toBe('lakeline-hardship');
    expect(sent.fields).toMatchObject({
      fullName: 'José Núñez',
      loanNumber: 'LAF-20417',
      email: 'jose.nunez@example.com',
      requestedChange: 'Payment extension',
      callbackWindow: 'Tardes',
    });
    expect(sent.fields.reason).toContain('médica');
    expect(sent.category).toBe('Payment extension');
    expect(sent.description).toContain('LAF-20417');
    expect(sent.description).toContain('médica');
    expect(sent.summary).toContain('José Núñez');
  });

  it('falls back to the support webhook when Lakeline vars are unset', async () => {
    const fetchImpl = webhook();
    const { LAKELINE_WEBHOOK_URL: _url, LAKELINE_WEBHOOK_KEY: _key, ...fallback } = env;
    const response = await handleCreateTicket(
      post('/api/tickets', { scenario: 'lakeline-hardship', channel: 'web', fields: { ...lakelineFields, fullName: 'Maya Chen', email: 'maya.chen@example.com', reason: 'I need to push my payment back a few weeks.', callbackWindow: 'Afternoons' } }),
      context(fallback, fetchImpl as unknown as typeof fetch),
    );
    expect(response.status).toBe(201);
    expect(fetchImpl.mock.calls[0][0]).toBe(WEBHOOK_URL);
    expect(new Headers(fetchImpl.mock.calls[0][1]?.headers).get('x-flylo-key')).toBe('support-key');
  });

  it('does not let a Lakeline ticket consume the next support id', async () => {
    const fetchImpl = webhook();
    const ctx = context(env, fetchImpl as unknown as typeof fetch);
    await handleCreateTicket(post('/api/tickets', { scenario: 'lakeline-hardship', fields: lakelineFields }), ctx);
    const response = await handleCreateTicket(post('/api/tickets', supportTicket), ctx);
    expect((await response.json()).id).toBe('FLY-SUP-1001');
  });

  it('rejects a garbled loan without forwarding', async () => {
    const fetchImpl = webhook();
    const response = await handleCreateTicket(
      post('/api/tickets', { scenario: 'lakeline-hardship', fields: { ...lakelineFields, loanNumber: 'nope' } }),
      context(env, fetchImpl as unknown as typeof fetch),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, id: null, status: 'invalid' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects an unknown scenario and a too-long reason', async () => {
    const fetchImpl = webhook();
    const ctx = context(env, fetchImpl as unknown as typeof fetch);
    expect((await handleCreateTicket(post('/api/tickets', { scenario: 'missing', fields: lakelineFields }), ctx)).status).toBe(400);
    expect(
      (
        await handleCreateTicket(
          post('/api/tickets', { scenario: 'lakeline-hardship', fields: { ...lakelineFields, reason: 'a'.repeat(2001) } }),
          ctx,
        )
      ).status,
    ).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns a retryable error and still reports the id when the webhook is not 2xx', async () => {
    const fetchImpl = webhook(503);
    const response = await handleCreateTicket(
      post('/api/tickets', { scenario: 'lakeline-hardship', fields: lakelineFields }),
      context(env, fetchImpl as unknown as typeof fetch),
    );
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body).toEqual({ ok: false, id: 'LAF-REQ-1001', status: 'not_delivered' });
    expect(JSON.stringify(body)).not.toContain('hooks.example.test');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
