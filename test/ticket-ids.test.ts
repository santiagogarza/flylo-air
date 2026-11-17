import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCreateTicket, resetTickets } from '@/server/tickets';
import { context, post } from './helpers';

const ENV = {
  LAKELINE_WEBHOOK_URL: 'https://hooks.example.test/lakeline',
  LAKELINE_WEBHOOK_KEY: 'lake-key',
  LAKELINE_WEBHOOK_HEADER: 'x-flylo-key',
  SUPPORT_WEBHOOK_URL: 'https://hooks.example.test/support',
  SUPPORT_WEBHOOK_HEADER: 'x-flylo-key',
  SUPPORT_WEBHOOK_KEY: 'support-key',
};

const LAKE_ID = /^LAF-REQ-\d+$/;

function lakelineTicket(n: number) {
  return post('/api/tickets', {
    scenario: 'lakeline-hardship',
    channel: 'web',
    fields: {
      fullName: `Caller ${n}`,
      loanNumber: 'LAF-20417',
      email: `caller${n}@example.com`,
      reason: `Request number ${n}, I need to push my payment back.`,
      requestedChange: 'Payment extension',
      callbackWindow: 'Afternoons',
    },
  });
}

async function submit(n: number): Promise<string> {
  const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
  const response = await handleCreateTicket(lakelineTicket(n), context(ENV, fetchImpl as unknown as typeof fetch));
  const body = (await response.json()) as { id: string; ok: boolean };
  expect(body.ok).toBe(true);
  return body.id;
}

beforeEach(async () => {
  await resetTickets();
});

describe('scenario ticket ids', () => {
  it('match the LAF-REQ- sequence', async () => {
    const id = await submit(1);
    expect(id).toMatch(LAKE_ID);
  });

  // Expected failure: concurrent submits read the same counter. Flip to `it` when atomic allocation lands on #15.
  it.fails('are unique under parallel submits', async () => {
    const ids = await Promise.all(Array.from({ length: 40 }, (_, index) => submit(index)));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(LAKE_ID);
  });

  // Expected failure until the counter stops resetting on #15. Flip to `it` when it lands.
  it.fails('stay unique across a reset', async () => {
    const before = await submit(1);
    await resetTickets();
    const after = await submit(2);
    expect(after).not.toBe(before);
  });

  it.fails('a reset does not move the counter backwards', async () => {
    const before = Number((await submit(1)).replace('LAF-REQ-', ''));
    await resetTickets();
    const after = Number((await submit(2)).replace('LAF-REQ-', ''));
    expect(after).toBeGreaterThan(before);
  });

  it('keep the legacy /support ids (FLY-SUP-) on their own sequence', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const support = {
      fullName: 'Maya Chen',
      bookingReference: 'FLY-48213',
      email: 'maya.chen@example.com',
      category: 'Checkout / payment',
      description: 'Checkout keeps failing at payment for me.',
      channel: 'web',
    };
    const response = await handleCreateTicket(post('/api/tickets', support), context(ENV, fetchImpl as unknown as typeof fetch));
    expect(await response.json()).toMatchObject({ ok: true, id: 'FLY-SUP-1001', status: 'received' });
  });
});
