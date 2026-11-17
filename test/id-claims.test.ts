import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAKELINE_PERSONA } from '@/scenarios/lakeline/persona';
import { clearDemoMemoryForTests } from '@/server/demo-store';
import { getCase, ingestCase } from '@/server/cases';
import { handleReset } from '@/server/reset';
import {
  CLAIM_ATTEMPTS,
  handleCreateTicket,
  resetTickets,
  scenarioTicketNumber,
  ticketCount,
} from '@/server/tickets';
import { fakeBlob } from './blob-fake';
import { context, post } from './helpers';

vi.mock('@vercel/blob', async () => (await import('./blob-fake')).blobModule);

const env = {
  SUPPORT_WEBHOOK_URL: 'https://hooks.example.test/support',
  SUPPORT_WEBHOOK_HEADER: 'Authorization',
  SUPPORT_WEBHOOK_KEY: 'Bearer support-key',
  LAKELINE_WEBHOOK_URL: 'https://hooks.example.test/lakeline',
  LAKELINE_WEBHOOK_KEY: 'Bearer lake-key',
  DEMO_RESET_KEY: 'reset-me',
};

const fields = {
  fullName: LAKELINE_PERSONA.fullName,
  loanNumber: LAKELINE_PERSONA.loanNumber,
  email: LAKELINE_PERSONA.email,
  reason: 'I had a medical bill this month and need to push my payment back a few weeks.',
  requestedChange: 'Payment extension',
  callbackWindow: 'Afternoons',
};

async function submit() {
  const response = await handleCreateTicket(post('/api/tickets', { scenario: 'lakeline-hardship', channel: 'web', fields }), context(env));
  return { status: response.status, body: (await response.json()) as { ok: boolean; id: string | null; status: string } };
}

async function submitMany(count: number) {
  return Promise.all(Array.from({ length: count }, () => submit()));
}

function reset() {
  return handleReset(post('/api/reset', {}, { 'x-demo-reset-key': 'reset-me' }), context(env));
}

const saved = { blob: process.env.BLOB_READ_WRITE_TOKEN };

afterEach(() => {
  if (saved.blob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = saved.blob;
});

describe.each([
  ['memory', () => delete process.env.BLOB_READ_WRITE_TOKEN],
  ['blob', () => (process.env.BLOB_READ_WRITE_TOKEN = 'test-token')],
])('scenario ticket ids on the %s store', (_name, configure) => {
  beforeEach(() => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    fakeBlob.reset();
    clearDemoMemoryForTests();
    configure();
  });

  it('keeps ids unique across a reset and does not rewind the counter', async () => {
    const first = await submit();
    expect(first.body.id).toBe('LAF-REQ-1001');
    const afterReset = await reset();
    expect(afterReset.status).toBe(200);
    const second = await submit();
    expect(second.body.id).toBe('LAF-REQ-1002');
    await resetTickets();
    expect((await submit()).body.id).toBe('LAF-REQ-1003');
  });

  it('hands out 20 unique ids to 20 parallel submits', async () => {
    const results = await submitMany(20);
    expect(results.every((item) => item.status === 201)).toBe(true);
    const ids = results.map((item) => item.body.id);
    expect(new Set(ids).size).toBe(20);
    expect([...ids].sort()).toEqual(Array.from({ length: 20 }, (_, i) => `LAF-REQ-${1001 + i}`));
  });

  it('stays unique when a reset lands between parallel submits', async () => {
    const before = await submitMany(10);
    await reset();
    const after = await submitMany(10);
    const ids = [...before, ...after].map((item) => item.body.id);
    expect(new Set(ids).size).toBe(20);
  });

  it('skips an id that already belongs to a case', async () => {
    const ingested = await ingestCase({
      ticketId: 'LAF-REQ-1001',
      scenario: 'lakeline-hardship',
      request: { ...fields },
    });
    expect(ingested.status).toBe(201);
    expect((await submit()).body.id).toBe('LAF-REQ-1002');
    expect(await getCase('LAF-REQ-1001')).toBeDefined();
  });
});

describe('claiming on Blob', () => {
  beforeEach(() => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    fakeBlob.reset();
    clearDemoMemoryForTests();
    process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
  });

  it('creates one claim blob per id with allowOverwrite false', async () => {
    for (let i = 0; i < 3; i += 1) await submit();
    const claims = fakeBlob.puts.filter((item) => item.path.startsWith('flylo-demo/claims/'));
    expect(claims.map((item) => item.path).sort()).toEqual([
      'flylo-demo/claims/LAF-REQ-1001',
      'flylo-demo/claims/LAF-REQ-1002',
      'flylo-demo/claims/LAF-REQ-1003',
    ]);
    expect(claims.every((item) => item.allowOverwrite === false)).toBe(true);
  });

  it('retries to the next number when the claim already exists', async () => {
    fakeBlob.files.set('flylo-demo/claims/LAF-REQ-1001', '1');
    fakeBlob.files.set('flylo-demo/claims/LAF-REQ-1002', '2');
    const result = await submit();
    expect(result.body.id).toBe('LAF-REQ-1003');
    const attempts = fakeBlob.puts.filter((item) => item.path.startsWith('flylo-demo/claims/')).map((item) => item.path);
    expect(attempts).toEqual([
      'flylo-demo/claims/LAF-REQ-1001',
      'flylo-demo/claims/LAF-REQ-1002',
      'flylo-demo/claims/LAF-REQ-1003',
    ]);
  });

  it('returns a clear error and writes no ticket when every attempt conflicts', async () => {
    for (let n = 1001; n < 1001 + CLAIM_ATTEMPTS; n += 1) fakeBlob.files.set(`flylo-demo/claims/LAF-REQ-${n}`, String(n));
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const ctx = context(env, fetchImpl as unknown as typeof fetch);
    const response = await handleCreateTicket(post('/api/tickets', { scenario: 'lakeline-hardship', channel: 'web', fields }), ctx);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, id: null, status: 'unavailable' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await ticketCount()).toBe(0);
    expect(ctx.logs.some((entry) => String(entry[2]).includes(`after ${CLAIM_ATTEMPTS} attempts`))).toBe(true);
  });

  it('does not treat other store errors as a conflict', async () => {
    fakeBlob.failPutsFor = (path) => (path.startsWith('flylo-demo/claims/') ? new Error('Access denied') : undefined);
    await expect(submit()).rejects.toThrow('Access denied');
    expect(await ticketCount()).toBe(0);
  });

  it('keeps the counter when the tickets list is cleared', async () => {
    await submit();
    await resetTickets();
    expect(fakeBlob.files.has('flylo-demo/claims/LAF-REQ-1001')).toBe(true);
    expect((await submit()).body.id).toBe('LAF-REQ-1002');
  });
});

describe('reserved sample range', () => {
  it('jumps over LAF-REQ-9001 through LAF-REQ-9999', () => {
    expect(scenarioTicketNumber(1)).toBe(1001);
    expect(scenarioTicketNumber(8000)).toBe(9000);
    expect(scenarioTicketNumber(8001)).toBe(10000);
    expect(scenarioTicketNumber(8002)).toBe(10001);
  });
});

describe('/support ids', () => {
  beforeEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    clearDemoMemoryForTests();
  });

  it('still restarts at FLY-SUP-1001 after a reset', async () => {
    const ticket = {
      fullName: 'Maya Chen',
      bookingReference: 'FLY-48213',
      email: 'maya.chen@example.com',
      category: 'Checkout / payment',
      description: 'Checkout keeps failing at payment.',
      channel: 'web',
    };
    const send = async () => (await (await handleCreateTicket(post('/api/tickets', ticket), context(env))).json()) as { id: string };
    expect((await send()).id).toBe('FLY-SUP-1001');
    expect((await send()).id).toBe('FLY-SUP-1002');
    await resetTickets();
    expect((await send()).id).toBe('FLY-SUP-1001');
  });
});
