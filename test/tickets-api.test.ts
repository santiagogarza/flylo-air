import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleReset } from '@/server/reset';
import { handleCreateTicket, resetTickets, ticketCount, WEBHOOK_TIMEOUT_MS } from '@/server/tickets';
import { context, post } from './helpers';

const WEBHOOK_URL = 'https://hooks.example.test/support/abc123';
const env = {
  SUPPORT_WEBHOOK_URL: WEBHOOK_URL,
  SUPPORT_WEBHOOK_HEADER: 'x-flylo-key',
  SUPPORT_WEBHOOK_KEY: 'secret-key-value',
  DEMO_RESET_KEY: 'reset-me',
};

const ticket = {
  fullName: 'Maya Chen',
  bookingReference: 'fly 48213',
  email: ' Maya.Chen@Example.com ',
  category: 'Checkout / payment',
  description: "I'm trying to book a flight for me and my son and checkout keeps failing at payment.",
  channel: 'voice',
};

function webhook(status = 200, body = '{"accepted":true,"url":"https://internal.example.test"}') {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(body, { status }));
}

beforeEach(() => {
  resetTickets();
});

describe('POST /api/tickets', () => {
  it('forwards a valid ticket to the webhook exactly once', async () => {
    const fetchImpl = webhook();
    const response = await handleCreateTicket(post('/api/tickets', ticket), context(env, fetchImpl as unknown as typeof fetch));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, id: 'FLY-SUP-1001', status: 'received' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(WEBHOOK_URL);
    expect(init?.method).toBe('POST');
    expect(init?.redirect).toBe('manual');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const headers = new Headers(init?.headers);
    expect(headers.get('x-flylo-key')).toBe('secret-key-value');
    expect(headers.get('content-type')).toBe('application/json');

    const sent = JSON.parse(String(init?.body));
    expect(sent).toMatchObject({
      id: 'FLY-SUP-1001',
      channel: 'voice',
      fullName: 'Maya Chen',
      bookingReference: 'FLY-48213',
      email: 'maya.chen@example.com',
      category: 'Checkout / payment',
      description: ticket.description,
    });
    expect(sent.summary).toContain('Checkout / payment');
    expect(sent.summary).toContain('FLY-48213');
    expect(typeof sent.createdAt).toBe('string');
  });

  it('uses a 10 second timeout', () => {
    expect(WEBHOOK_TIMEOUT_MS).toBe(10_000);
  });

  it('numbers tickets in order', async () => {
    const ctx = context(env, webhook() as unknown as typeof fetch);
    const ids = [];
    for (let i = 0; i < 3; i += 1) {
      ids.push((await (await handleCreateTicket(post('/api/tickets', ticket), ctx)).json()).id);
    }
    expect(ids).toEqual(['FLY-SUP-1001', 'FLY-SUP-1002', 'FLY-SUP-1003']);
  });

  it('does not retry or leak details when the webhook fails', async () => {
    const fetchImpl = webhook(500, 'upstream exploded at https://internal.example.test');
    const response = await handleCreateTicket(post('/api/tickets', ticket), context(env, fetchImpl as unknown as typeof fetch));
    const text = await response.text();
    expect(response.status).toBe(502);
    expect(JSON.parse(text)).toEqual({ ok: false, id: 'FLY-SUP-1001', status: 'not_delivered' });
    expect(text).not.toContain('example.test');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('treats a redirect as not delivered', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://elsewhere.example.test' } }));
    const response = await handleCreateTicket(post('/api/tickets', ticket), context(env, fetchImpl as unknown as typeof fetch));
    expect(response.status).toBe(502);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reports a network error or timeout without retrying', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });
    const ctx = context(env, fetchImpl as unknown as typeof fetch);
    const response = await handleCreateTicket(post('/api/tickets', ticket), ctx);
    expect(await response.json()).toEqual({ ok: false, id: 'FLY-SUP-1001', status: 'not_delivered' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(ctx.logs)).not.toContain('secret-key-value');
  });

  it('does not call out when the webhook is not configured', async () => {
    const fetchImpl = webhook();
    const response = await handleCreateTicket(post('/api/tickets', ticket), context({}, fetchImpl as unknown as typeof fetch));
    expect(response.status).toBe(502);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects invalid tickets without forwarding', async () => {
    const fetchImpl = webhook();
    const ctx = context(env, fetchImpl as unknown as typeof fetch);
    for (const bad of [
      { ...ticket, email: 'maya' },
      { ...ticket, bookingReference: 'ABC' },
      { ...ticket, category: 'Lost pet' },
      { ...ticket, description: 'help' },
      { ...ticket, fullName: '' },
    ]) {
      const response = await handleCreateTicket(post('/api/tickets', bad), ctx);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ ok: false, id: null, status: 'invalid' });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(ticketCount()).toBe(0);
  });

  it('rejects other sites', async () => {
    const fetchImpl = webhook();
    const request = post('/api/tickets', ticket, { origin: 'https://evil.example.test' });
    const response = await handleCreateTicket(request, context(env, fetchImpl as unknown as typeof fetch));
    expect(response.status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('POST /api/reset', () => {
  it('clears tickets and restarts numbering', async () => {
    const ctx = context(env, webhook() as unknown as typeof fetch);
    await handleCreateTicket(post('/api/tickets', ticket), ctx);
    await handleCreateTicket(post('/api/tickets', ticket), ctx);
    expect(ticketCount()).toBe(2);

    const response = handleReset(post('/api/reset', {}, { 'x-demo-reset-key': 'reset-me' }), ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, cleared: 2 });
    expect(ticketCount()).toBe(0);
    expect((await (await handleCreateTicket(post('/api/tickets', ticket), ctx)).json()).id).toBe('FLY-SUP-1001');
  });

  it('needs the reset key', () => {
    expect(handleReset(post('/api/reset', {}, { 'x-demo-reset-key': 'wrong' }), context(env)).status).toBe(401);
    expect(handleReset(post('/api/reset', {}), context(env)).status).toBe(401);
    expect(handleReset(post('/api/reset', {}, { 'x-demo-reset-key': 'reset-me' }), context({})).status).toBe(503);
  });
});
