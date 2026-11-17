import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LAKELINE_PERSONA } from '@/scenarios/lakeline/persona';
import { ingestCase } from '@/server/cases';
import { clearDemoMemoryForTests } from '@/server/demo-store';
import { CLAIM_ATTEMPTS, handleCreateTicket, resetTickets, scenarioTicketNumber, ticketCount } from '@/server/tickets';
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
      loanNumber: LAKELINE_PERSONA.loanNumber,
      email: `caller${n}@example.com`,
      reason: `Request number ${n}, I need to push my payment back.`,
      requestedChange: 'Payment extension',
      callbackWindow: 'Afternoons',
    },
  });
}

async function submit(n: number, fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))): Promise<{ id: string | null; ok: boolean; status: string; http: number }> {
  const response = await handleCreateTicket(lakelineTicket(n), context(ENV, fetchImpl as unknown as typeof fetch));
  const body = (await response.json()) as { id: string | null; ok: boolean; status: string };
  return { ...body, http: response.status };
}

beforeEach(async () => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  clearDemoMemoryForTests();
  await resetTickets();
});

describe('scenario ticket ids', () => {
  it('match the LAF-REQ- sequence', async () => {
    const created = await submit(1);
    expect(created.ok).toBe(true);
    expect(created.id).toMatch(LAKE_ID);
  });

  it('are unique under parallel submits', async () => {
    const created = await Promise.all(Array.from({ length: 40 }, (_, index) => submit(index)));
    const ids = created.map((item) => item.id);
    expect(created.every((item) => item.ok)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(LAKE_ID);
  });

  it('stay unique across a reset', async () => {
    const before = await submit(1);
    await resetTickets();
    const after = await submit(2);
    expect(before.ok && after.ok).toBe(true);
    expect(after.id).not.toBe(before.id);
  });

  it('a reset does not move the counter backwards', async () => {
    const before = Number((await submit(1)).id!.replace('LAF-REQ-', ''));
    await resetTickets();
    const after = Number((await submit(2)).id!.replace('LAF-REQ-', ''));
    expect(after).toBeGreaterThan(before);
  });

  it('returns 503 unavailable when every id claim conflicts', async () => {
    for (let sequence = 1; sequence <= CLAIM_ATTEMPTS; sequence += 1) {
      const ticketId = `LAF-REQ-${scenarioTicketNumber(sequence)}`;
      const stored = await ingestCase({
        ticketId,
        scenario: 'lakeline-hardship',
        request: {
          fullName: LAKELINE_PERSONA.fullName,
          loanNumber: LAKELINE_PERSONA.loanNumber,
          email: LAKELINE_PERSONA.email,
          reason: 'Holding this id so the next live claim cannot use it.',
          requestedChange: 'Payment extension',
          callbackWindow: 'Afternoons',
        },
      });
      expect(stored.status, ticketId).toBe(201);
    }
    const before = await ticketCount();
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const blocked = await submit(99, fetchImpl);
    expect(blocked.http).toBe(503);
    expect(blocked).toMatchObject({ ok: false, id: null, status: 'unavailable' });
    expect(await ticketCount()).toBe(before);
    expect(fetchImpl).not.toHaveBeenCalled();
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
