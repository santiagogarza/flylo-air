import { LAKELINE_PERSONA } from '@/scenarios/lakeline/persona';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as ingest } from '@/app/api/cases/route';
import { POST as act } from '@/app/api/cases/[ticketId]/route';
import { getCase, listCases, resetCases } from '@/server/cases';
import { clearDemoMemoryForTests } from '@/server/demo-store';
import { handleReset } from '@/server/reset';
import { handleCreateTicket, resetTickets } from '@/server/tickets';
import { context, post } from './helpers';

const keys = ['DEMO_RESET_KEY', 'CASES_INGEST_KEY'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(async () => {
  for (const key of keys) saved[key] = process.env[key];
  process.env.DEMO_RESET_KEY = 'reset-me';
  delete process.env.CASES_INGEST_KEY;
  clearDemoMemoryForTests();
  await resetCases();
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
      fullName: LAKELINE_PERSONA.fullName,
      loanNumber: 'LAF-20417',
      email: LAKELINE_PERSONA.email,
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
    expect((await getCase('LAF-REQ-2001'))?.decision).toBe('APPROVE_EXTENSION');

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

    const loan = await ingest(post('/api/cases', { ticketId: 'LAF-REQ-2003', scenario: 'lakeline-hardship', request: { fullName: LAKELINE_PERSONA.fullName } }, { authorization: 'Bearer reset-me' }));
    expect(loan.status).toBe(400);
    expect((await loan.json()).error).toBe('request.loanNumber is required.');

    const rules = await ingest(post('/api/cases', { ticketId: 'FLY-SUP-2001', scenario: 'flylo-support', request: { fullName: LAKELINE_PERSONA.fullName } }, { authorization: 'Bearer reset-me' }));
    expect(rules.status).toBe(400);
    expect((await rules.json()).error).toContain('rules is required');
  });
});

describe('case actions', () => {
  it('sends once, ignores a second send, and never calls fetch', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const first = await act(post('/api/cases/LAF-REQ-9001', { action: 'send', by: 'Avery' }), { params: Promise.resolve({ ticketId: 'LAF-REQ-9001' }) });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ ok: true, status: 'sent', idempotent: false, emailed: false });
    const second = await act(post('/api/cases/LAF-REQ-9001', { action: 'send', by: 'Avery' }), { params: Promise.resolve({ ticketId: 'LAF-REQ-9001' }) });
    expect(await second.json()).toMatchObject({ status: 'sent', idempotent: true, emailed: false });
    expect((await getCase('LAF-REQ-9001'))?.log.filter((entry) => entry.action === 'sent')).toHaveLength(1);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('stores an edited draft and then sends it', async () => {
    const response = await act(
      post('/api/cases/LAF-REQ-9001', { action: 'edit_send', by: 'Avery', draft: 'Updated draft for Santi. This is a summary of your request. Final terms are confirmed in writing. Interest continues to accrue during the deferred period, and your loan term will extend by one month. Lakeline Auto Finance Customer Care 1-800-555-0142' }),
      { params: Promise.resolve({ ticketId: 'LAF-REQ-9001' }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'edited_sent', emailed: false });
    const stored = await getCase('LAF-REQ-9001');
    expect(stored?.draft.startsWith('Updated draft')).toBe(true);
    expect(stored?.compliance.verdict).toBe('Edited');
  });

  it('asks for a reviewer name', async () => {
    const response = await act(post('/api/cases/LAF-REQ-9001', { action: 'send', by: '  ' }), { params: Promise.resolve({ ticketId: 'LAF-REQ-9001' }) });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('by is required');
  });
});

describe('sample cases and ingest', () => {
  it('keeps LAF-REQ-1001 free for a live intake ticket', async () => {
    await resetTickets();
    const seeded = (await listCases('lakeline-hardship')).map((item) => item.ticketId);
    expect(seeded).toHaveLength(11);
    expect(seeded.every((id) => Number(id.slice('LAF-REQ-'.length)) >= 9001)).toBe(true);
    expect(await getCase('LAF-REQ-1001')).toBeUndefined();
    expect((await getCase('LAF-REQ-9001'))?.request.fullName).toBe(LAKELINE_PERSONA.fullName);

    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const ticket = await handleCreateTicket(
      post('/api/tickets', {
        scenario: 'lakeline-hardship',
        channel: 'web',
        fields: {
          fullName: 'New Caller',
          loanNumber: 'LAF-20417',
          email: 'new.caller@example.com',
          reason: 'I need a payment extension this month.',
          requestedChange: 'Payment extension',
          callbackWindow: 'Afternoons',
        },
      }),
      context(
        {
          SUPPORT_WEBHOOK_URL: 'https://hooks.example.test/support',
          SUPPORT_WEBHOOK_HEADER: 'x-flylo-key',
          SUPPORT_WEBHOOK_KEY: 'support-key',
          LAKELINE_WEBHOOK_URL: 'https://hooks.example.test/lakeline',
          LAKELINE_WEBHOOK_KEY: 'lake-key',
        },
        fetchImpl as unknown as typeof fetch,
      ),
    );
    expect(await ticket.json()).toMatchObject({ ok: true, id: 'LAF-REQ-1001' });

    const ingested = await ingest(
      post('/api/cases', ingestBody({ ticketId: 'LAF-REQ-1001', request: { ...ingestBody().request, fullName: 'New Caller' } }), { authorization: 'Bearer reset-me' }),
    );
    expect(ingested.status).toBe(201);
    const created = await ingested.json();
    expect(created).toMatchObject({ ok: true, ticketId: 'LAF-REQ-1001', status: 'needs_review' });
    expect(created.idempotent).not.toBe(true);
    expect((await getCase('LAF-REQ-1001'))?.request.fullName).toBe('New Caller');
    expect((await getCase('LAF-REQ-9001'))?.request.fullName).toBe(LAKELINE_PERSONA.fullName);
  });

  it('normalizes the loan number before looking it up', async () => {
    const response = await ingest(
      post(
        '/api/cases',
        ingestBody({ ticketId: 'LAF-REQ-2010', request: { ...ingestBody().request, loanNumber: 'laf 20417' } }),
        { authorization: 'Bearer reset-me' },
      ),
    );
    expect(response.status).toBe(201);
    const stored = await getCase('LAF-REQ-2010');
    expect(stored?.request.loanNumber).toBe('LAF-20417');
    expect(stored?.history.loan?.loanNumber).toBe('LAF-20417');
    expect(stored?.decision).toBe('APPROVE_EXTENSION');
  });
});

describe('closed cases', () => {
  it('does not let Send reopen a rejected or escalated case', async () => {
    const rejected = await act(post('/api/cases/LAF-REQ-9001', { action: 'reject', by: 'Avery' }), { params: Promise.resolve({ ticketId: 'LAF-REQ-9001' }) });
    expect(rejected.status).toBe(200);
    const sendRejected = await act(post('/api/cases/LAF-REQ-9001', { action: 'send', by: 'Avery' }), { params: Promise.resolve({ ticketId: 'LAF-REQ-9001' }) });
    expect(sendRejected.status).toBe(409);
    expect(await sendRejected.json()).toMatchObject({ ok: false, status: 'rejected', emailed: false });
    expect((await getCase('LAF-REQ-9001'))?.status).toBe('rejected');

    const escalated = await act(post('/api/cases/LAF-REQ-9002', { action: 'escalate', by: 'Avery' }), { params: Promise.resolve({ ticketId: 'LAF-REQ-9002' }) });
    expect(escalated.status).toBe(200);
    const sendEscalated = await act(
      post('/api/cases/LAF-REQ-9002', { action: 'edit_send', by: 'Avery', draft: 'A new draft that must not be stored.' }),
      { params: Promise.resolve({ ticketId: 'LAF-REQ-9002' }) },
    );
    expect(sendEscalated.status).toBe(409);
    expect((await getCase('LAF-REQ-9002'))?.status).toBe('escalated');
    expect((await getCase('LAF-REQ-9002'))?.draft.startsWith('A new draft')).toBe(false);
  });

  it('still sends a case that needs review or has requested changes', async () => {
    const open = await act(post('/api/cases/LAF-REQ-9001', { action: 'send', by: 'Avery' }), { params: Promise.resolve({ ticketId: 'LAF-REQ-9001' }) });
    expect(await open.json()).toMatchObject({ status: 'sent', emailed: false });

    await act(post('/api/cases/LAF-REQ-9002', { action: 'request_changes', by: 'Avery' }), { params: Promise.resolve({ ticketId: 'LAF-REQ-9002' }) });
    const edited = await act(
      post('/api/cases/LAF-REQ-9002', { action: 'edit_send', by: 'Avery', draft: 'Updated after changes. This is a summary of your request. Final terms are confirmed in writing. We can move the due date to the 15. Lakeline Auto Finance Customer Care 1-800-555-0142' }),
      { params: Promise.resolve({ ticketId: 'LAF-REQ-9002' }) },
    );
    expect(edited.status).toBe(200);
    expect(await edited.json()).toMatchObject({ status: 'edited_sent', emailed: false });
  });
});

describe('reset', () => {
  it('clears reviewer actions and reloads the sample cases', async () => {
    await act(post('/api/cases/LAF-REQ-9001', { action: 'reject', by: 'Avery' }), { params: Promise.resolve({ ticketId: 'LAF-REQ-9001' }) });
    expect((await getCase('LAF-REQ-9001'))?.status).toBe('rejected');
    const response = await handleReset(post('/api/reset', {}, { 'x-demo-reset-key': 'reset-me' }), context({ DEMO_RESET_KEY: 'reset-me' }));
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, casesCleared: 11 });
    expect((await getCase('LAF-REQ-9001'))?.status).toBe('needs_review');
  });
});

describe('artifacts and activity', () => {
  const auth = { authorization: 'Bearer reset-me' };
  const doc = { type: 'doc', label: 'Extension agreement drafted in Google Docs', url: 'https://mock.example.test/docs/1', status: 'drafted', by: 'Servicing' };

  it('seeds mock artifacts and an activity log on the sample cases', async () => {
    const rows = await listCases('lakeline-hardship');
    expect(rows.every((row) => row.artifactCount === row.artifacts.length && row.artifactCount > 0)).toBe(true);
    const santi = await getCase('LAF-REQ-9001');
    expect(santi?.artifacts.map((item) => item.label)).toEqual(
      expect.arrayContaining([
        'Extension agreement drafted in Google Docs',
        'Logged to Servicing Ledger',
        'Reply drafted in Gmail, not sent',
        'Loan record updated',
      ]),
    );
    expect(santi?.artifacts.some((item) => item.type === 'calendar' && item.label.startsWith('Callback held on calendar'))).toBe(true);
    for (const item of santi?.artifacts ?? []) {
      expect(item.url).toMatch(/^https:\/\/mock\.lakeline\.example\//);
      expect(Number.isNaN(Date.parse(item.createdAt))).toBe(false);
    }
    expect(new Set(santi?.activity.map((item) => item.bot))).toEqual(new Set(['Intake', 'Servicing', 'Compliance']));
    const escalated = (await listCases('lakeline-hardship')).find((row) => row.decision === 'ESCALATE');
    expect(escalated?.activity.some((item) => item.bot === 'Escalation')).toBe(true);
  });

  it('merges a second post for the same ticket instead of replacing it', async () => {
    const first = await ingest(post('/api/cases', ingestBody({ ticketId: 'LAF-REQ-2100', artifacts: [doc], activity: [{ bot: 'Servicing', action: 'Drafted the agreement' }] }), auth));
    expect(first.status).toBe(201);
    const created = await getCase('LAF-REQ-2100');
    expect(created?.artifacts).toHaveLength(1);
    const baseActivity = created?.activity.length ?? 0;

    const second = await ingest(
      post(
        '/api/cases',
        {
          ticketId: 'LAF-REQ-2100',
          request: { reason: 'Updated reason from the caller.' },
          artifacts: [
            doc,
            { type: 'email_draft', label: 'Reply drafted in Gmail, not sent', url: 'https://mock.example.test/mail/1', by: 'Compliance', status: 'drafted' },
          ],
          activity: [
            { bot: 'Servicing', action: 'Drafted the agreement' },
            { bot: 'Compliance', action: 'Checked disclosures' },
          ],
        },
        auth,
      ),
    );
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ ok: true, artifactsAdded: 1, activityAdded: 1 });
    const merged = await getCase('LAF-REQ-2100');
    expect(merged?.artifacts.map((item) => item.type)).toEqual(['doc', 'email_draft']);
    expect(merged?.activity).toHaveLength(baseActivity + 1);
    expect(merged?.request.reason).toBe('Updated reason from the caller.');
    expect(merged?.request.fullName).toBe(LAKELINE_PERSONA.fullName);
    expect(merged?.request.loanNumber).toBe('LAF-20417');

    const repeat = await ingest(post('/api/cases', { ticketId: 'LAF-REQ-2100', artifacts: [doc] }, auth));
    expect(await repeat.json()).toMatchObject({ artifactsAdded: 0, activityAdded: 0 });
    expect((await getCase('LAF-REQ-2100'))?.artifacts).toHaveLength(2);
  });

  it('updates an artifact status on a repeat post and keeps handled cases handled', async () => {
    await ingest(post('/api/cases', ingestBody({ ticketId: 'LAF-REQ-2101', artifacts: [doc] }), auth));
    await act(post('/api/cases/LAF-REQ-2101', { action: 'send', by: 'Avery' }), { params: Promise.resolve({ ticketId: 'LAF-REQ-2101' }) });
    const response = await ingest(
      post('/api/cases', { ticketId: 'LAF-REQ-2101', request: { reason: 'ignored after send' }, artifacts: [{ ...doc, status: 'sent' }] }, auth),
    );
    expect(await response.json()).toMatchObject({ ok: true, status: 'sent', idempotent: true, artifactsAdded: 1 });
    const stored = await getCase('LAF-REQ-2101');
    expect(stored?.artifacts[0].status).toBe('sent');
    expect(stored?.status).toBe('sent');
    expect(stored?.request.reason).not.toBe('ignored after send');
  });

  it('names the bad artifact field', async () => {
    const cases: [unknown, string][] = [
      [[{ ...doc, type: 'video' }], 'artifacts[0].type must be one of'],
      [[{ ...doc, label: ' ' }], 'artifacts[0].label is required.'],
      [[{ ...doc, url: 'javascript:alert(1)' }], 'artifacts[0].url must be an http or https URL.'],
      [[{ ...doc, by: 'Maya' }], 'artifacts[0].by must be one of'],
      [[{ ...doc, status: 'maybe' }], 'artifacts[0].status must be one of'],
      ['nope', 'artifacts must be an array.'],
    ];
    for (const [artifacts, message] of cases) {
      const response = await ingest(post('/api/cases', ingestBody({ ticketId: 'LAF-REQ-2102', artifacts }), auth));
      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain(message);
    }
    const badActivity = await ingest(post('/api/cases', ingestBody({ ticketId: 'LAF-REQ-2102', activity: [{ bot: 'Nobody', action: 'x' }] }), auth));
    expect((await badActivity.json()).error).toContain('activity[0].bot must be one of');
    expect(await getCase('LAF-REQ-2102')).toBeUndefined();
  });
});
