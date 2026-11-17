import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as ingest } from '@/app/api/cases/route';
import { POST as act } from '@/app/api/cases/[ticketId]/route';
import { getCase, resetCases } from '@/server/cases';
import { handleReset } from '@/server/reset';
import { context, post } from './helpers';

const keys = ['DEMO_RESET_KEY', 'CASES_INGEST_KEY'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of keys) saved[key] = process.env[key];
  process.env.DEMO_RESET_KEY = 'reset-me';
  delete process.env.CASES_INGEST_KEY;
  resetCases();
});

afterEach(() => {
  for (const key of keys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function ingestBody(extra: Record<string, unknown> = {}) {
  return {
    ticketId: 'LAF-REQ-2001',
    scenario: 'lakeline-hardship',
    request: {
      fullName: 'Maya Chen',
      loanNumber: 'LAF-20417',
      email: 'maya.chen@example.com',
      reason: 'I had a medical bill this month and need to push my payment back a few weeks.',
      requestedChange: 'Payment extension',
      callbackWindow: 'Afternoons',
    },
    ...extra,
  };
}

describe('POST /api/cases', () => {
  it('rejects a missing key with a clear 503', async () => {
    delete process.env.DEMO_RESET_KEY;
    const response = await ingest(post('/api/cases', ingestBody(), { authorization: 'Bearer reset-me' }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: 'Case ingest is not configured. Set CASES_INGEST_KEY or DEMO_RESET_KEY.' });
  });

  it('rejects a bad key with a clear 401 and does not echo the key', async () => {
    const response = await ingest(post('/api/cases', ingestBody(), { authorization: 'Bearer wrong' }));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toContain('Unauthorized');
    expect(JSON.stringify(body)).not.toContain('reset-me');
  });

  it('accepts the reset key header and the bearer override', async () => {
    const header = await ingest(post('/api/cases', ingestBody(), { 'x-demo-reset-key': 'reset-me' }));
    expect(header.status).toBe(201);
    const created = await header.json();
    expect(created).toMatchObject({ ok: true, ticketId: 'LAF-REQ-2001', status: 'needs_review', emailed: false });
    expect(getCase('LAF-REQ-2001')?.decision).toBe('APPROVE_EXTENSION');

    process.env.CASES_INGEST_KEY = 'ingest-only';
    const denied = await ingest(post('/api/cases', ingestBody({ ticketId: 'LAF-REQ-2002' }), { authorization: 'Bearer reset-me' }));
    expect(denied.status).toBe(401);
    const allowed = await ingest(post('/api/cases', ingestBody({ ticketId: 'LAF-REQ-2002' }), { authorization: 'Bearer ingest-only' }));
    expect(allowed.status).toBe(201);
  });

  it('returns 400 with a field message for a bad schema', async () => {
    const missing = await ingest(post('/api/cases', { scenario: 'lakeline-hardship' }, { authorization: 'Bearer reset-me' }));
    expect(missing.status).toBe(400);
    expect((await missing.json()).error).toBe('ticketId is required.');

    const loan = await ingest(post('/api/cases', { ticketId: 'LAF-REQ-2003', scenario: 'lakeline-hardship', request: { fullName: 'Maya Chen' } }, { authorization: 'Bearer reset-me' }));
    expect(loan.status).toBe(400);
    expect((await loan.json()).error).toBe('request.loanNumber is required.');

    const rules = await ingest(post('/api/cases', { ticketId: 'FLY-SUP-2001', scenario: 'flylo-support', request: { fullName: 'Maya Chen' } }, { authorization: 'Bearer reset-me' }));
    expect(rules.status).toBe(400);
    expect((await rules.json()).error).toContain('rules is required');
  });
});

describe('case actions', () => {
  it('sends once, ignores a second send, and never calls fetch', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const first = await act(post('/api/cases/LAF-REQ-1001', { action: 'send', by: 'Avery' }), { params: Promise.resolve({ ticketId: 'LAF-REQ-1001' }) });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ ok: true, status: 'sent', idempotent: false, emailed: false });
    const second = await act(post('/api/cases/LAF-REQ-1001', { action: 'send', by: 'Avery' }), { params: Promise.resolve({ ticketId: 'LAF-REQ-1001' }) });
    expect(await second.json()).toMatchObject({ status: 'sent', idempotent: true, emailed: false });
    expect(getCase('LAF-REQ-1001')?.log.filter((entry) => entry.action === 'sent')).toHaveLength(1);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('stores an edited draft and then sends it', async () => {
    const response = await act(
      post('/api/cases/LAF-REQ-1001', { action: 'edit_send', by: 'Avery', draft: 'Updated draft for Maya. This is a summary of your request. Final terms are confirmed in writing. Interest continues to accrue during the deferred period, and your loan term will extend by one month. Lakeline Auto Finance Customer Care 1-800-555-0142' }),
      { params: Promise.resolve({ ticketId: 'LAF-REQ-1001' }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'edited_sent', emailed: false });
    const stored = getCase('LAF-REQ-1001');
    expect(stored?.draft.startsWith('Updated draft')).toBe(true);
    expect(stored?.compliance.verdict).toBe('Edited');
  });

  it('asks for a reviewer name', async () => {
    const response = await act(post('/api/cases/LAF-REQ-1001', { action: 'send', by: '  ' }), { params: Promise.resolve({ ticketId: 'LAF-REQ-1001' }) });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('by is required');
  });
});

describe('reset', () => {
  it('clears reviewer actions and reloads the sample cases', async () => {
    await act(post('/api/cases/LAF-REQ-1001', { action: 'reject', by: 'Avery' }), { params: Promise.resolve({ ticketId: 'LAF-REQ-1001' }) });
    expect(getCase('LAF-REQ-1001')?.status).toBe('rejected');
    const response = await handleReset(post('/api/reset', {}, { 'x-demo-reset-key': 'reset-me' }), context({ DEMO_RESET_KEY: 'reset-me' }));
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, casesCleared: 11 });
    expect(getCase('LAF-REQ-1001')?.status).toBe('needs_review');
  });
});
