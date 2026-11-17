import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as act } from '@/app/api/cases/[ticketId]/route';
import { POST as ingest } from '@/app/api/cases/route';
import { LAKELINE_PERSONA } from '@/scenarios/lakeline/persona';
import { getCase, listCases } from '@/server/cases';
import { clearDemoMemoryForTests, resetStoreCacheForTests, storeKind } from '@/server/demo-store';
import { handleReset } from '@/server/reset';
import { handleCreateTicket, ticketCount } from '@/server/tickets';
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

/** A different route bundle on a cold instance shares nothing but the Blob store. */
function newInstance() {
  resetStoreCacheForTests();
  clearDemoMemoryForTests();
}

beforeEach(() => {
  fakeBlob.reset();
  clearDemoMemoryForTests();
  process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
  process.env.DEMO_RESET_KEY = 'reset-me';
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
});

describe('state shared across routes through Blob', () => {
  it('uses Blob when the token is set', () => {
    expect(storeKind(process.env)).toBe('blob');
  });

  it('keeps tickets, cases, and the id counter across separate instances', async () => {
    const fields = {
      fullName: LAKELINE_PERSONA.fullName,
      loanNumber: LAKELINE_PERSONA.loanNumber,
      email: LAKELINE_PERSONA.email,
      reason: 'I need to push my payment back a few weeks.',
      requestedChange: 'Payment extension',
      callbackWindow: 'Afternoons',
    };
    const created = await handleCreateTicket(post('/api/tickets', { scenario: 'lakeline-hardship', fields }), context(env));
    const { id } = (await created.json()) as { id: string };
    expect(id).toBe('LAF-REQ-1001');

    newInstance();
    const ingested = await ingest(post('/api/cases', { ticketId: id, scenario: 'lakeline-hardship', request: fields }, { authorization: 'Bearer reset-me' }));
    expect(ingested.status).toBe(201);
    expect(await ticketCount()).toBe(1);

    newInstance();
    expect((await getCase(id))?.request.email).toBe(LAKELINE_PERSONA.email);
    expect((await listCases('lakeline-hardship')).map((item) => item.ticketId)).toContain(id);

    newInstance();
    const sent = await act(post(`/api/cases/${id}`, { action: 'send', by: 'Avery' }), { params: Promise.resolve({ ticketId: id }) });
    expect(await sent.json()).toMatchObject({ ok: true, status: 'sent' });

    newInstance();
    expect((await getCase(id))?.status).toBe('sent');
    const next = await handleCreateTicket(post('/api/tickets', { scenario: 'lakeline-hardship', fields }), context(env));
    expect(((await next.json()) as { id: string }).id).toBe('LAF-REQ-1002');
  });

  it('writes private JSON blobs that can be overwritten, and reset on a fresh instance clears them', async () => {
    await listCases('lakeline-hardship');
    expect([...fakeBlob.files.keys()]).toContain('flylo-demo/cases.json');
    expect(fakeBlob.puts.filter((item) => item.path === 'flylo-demo/cases.json').every((item) => item.allowOverwrite === true)).toBe(true);

    newInstance();
    const response = await handleReset(post('/api/reset?cases=empty', {}, { 'x-demo-reset-key': 'reset-me' }), context(env));
    expect(await response.json()).toMatchObject({ ok: true, casesSeeded: 0 });

    newInstance();
    expect(await listCases('lakeline-hardship')).toEqual([]);
  });

  it('sends the webhook key exactly as stored, with no second Bearer prefix', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response('{}', { status: 200 }));
    const fields = {
      fullName: LAKELINE_PERSONA.fullName,
      loanNumber: LAKELINE_PERSONA.loanNumber,
      email: LAKELINE_PERSONA.email,
      reason: 'I need to push my payment back a few weeks.',
      requestedChange: 'Payment extension',
      callbackWindow: 'Afternoons',
    };
    await handleCreateTicket(post('/api/tickets', { scenario: 'lakeline-hardship', fields }), context(env, fetchImpl as unknown as typeof fetch));
    const headers = new Headers(fetchImpl.mock.calls[0][1]?.headers);
    expect(headers.get('authorization')).toBe('Bearer lake-key');
  });
});
