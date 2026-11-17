import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as ingest } from '@/app/api/cases/route';
import { POST as act } from '@/app/api/cases/[ticketId]/route';
import { LAKELINE_PERSONA } from '@/scenarios/lakeline/persona';
import { getCase, listCases, resetCases } from '@/server/cases';
import { clearDemoMemoryForTests } from '@/server/demo-store';
import { post } from './helpers';

const KEY = 'qa-ingest-key';
const saved: Record<string, string | undefined> = {};

const doc = {
  type: 'doc',
  label: 'Extension agreement drafted in Google Docs',
  url: 'https://mock.example.test/docs/1',
  status: 'drafted',
  by: 'Servicing',
};

beforeEach(async () => {
  for (const key of ['DEMO_RESET_KEY', 'CASES_INGEST_KEY', 'BLOB_READ_WRITE_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN']) {
    saved[key] = process.env[key];
  }
  process.env.DEMO_RESET_KEY = 'qa-reset-key';
  process.env.CASES_INGEST_KEY = KEY;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  clearDemoMemoryForTests();
  await resetCases();
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function requestBody(extra: Record<string, unknown> = {}) {
  return {
    ticketId: 'LAF-REQ-3100',
    scenario: 'lakeline-hardship',
    request: {
      fullName: LAKELINE_PERSONA.fullName,
      loanNumber: LAKELINE_PERSONA.loanNumber,
      email: LAKELINE_PERSONA.email,
      reason: 'I had a medical bill this month and need to push my payment back a few weeks.',
      requestedChange: 'Payment extension',
      callbackWindow: 'Afternoons',
    },
    ...extra,
  };
}

function postCase(body: unknown) {
  return ingest(post('/api/cases', body, { authorization: `Bearer ${KEY}` }));
}

describe('case artifacts', () => {
  it('shows an artifact count on every queue row', async () => {
    const rows = await listCases('lakeline-hardship');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.artifactCount).toBe(row.artifacts.length);
      expect(row.artifactCount).toBeGreaterThan(0);
    }
  });

  it('appends and dedupes artifacts and activity on a repeat ingest', async () => {
    const first = await postCase(requestBody({ artifacts: [doc], activity: [{ bot: 'Servicing', action: 'Drafted the agreement' }] }));
    expect(first.status).toBe(201);
    const created = await getCase('LAF-REQ-3100');
    const baseActivity = created?.activity.length ?? 0;

    const second = await postCase({
      ticketId: 'LAF-REQ-3100',
      artifacts: [
        doc,
        { type: 'email_draft', label: 'Reply drafted in Gmail, not sent', url: 'https://mock.example.test/mail/1', by: 'Compliance', status: 'drafted' },
      ],
      activity: [
        { bot: 'Servicing', action: 'Drafted the agreement' },
        { bot: 'Compliance', action: 'Checked disclosures', detail: 'Summary sentence present' },
      ],
    });
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ ok: true, artifactsAdded: 1, activityAdded: 1 });

    const merged = await getCase('LAF-REQ-3100');
    expect(merged?.artifacts.map((item) => item.type)).toEqual(['doc', 'email_draft']);
    expect(merged?.activity).toHaveLength(baseActivity + 1);
    expect((await listCases('lakeline-hardship')).find((row) => row.ticketId === 'LAF-REQ-3100')?.artifactCount).toBe(2);

    const repeat = await postCase({ ticketId: 'LAF-REQ-3100', artifacts: [doc], activity: [{ bot: 'Servicing', action: 'Drafted the agreement' }] });
    expect(await repeat.json()).toMatchObject({ artifactsAdded: 0, activityAdded: 0 });
    expect((await getCase('LAF-REQ-3100'))?.artifacts).toHaveLength(2);
  });

  it('keeps a handled case in its status while still merging artifacts', async () => {
    await postCase(requestBody({ artifacts: [doc] }));
    const sent = await act(post('/api/cases/LAF-REQ-3100', { action: 'send', by: 'Avery' }), { params: Promise.resolve({ ticketId: 'LAF-REQ-3100' }) });
    expect(sent.status).toBe(200);

    const again = await postCase({
      ticketId: 'LAF-REQ-3100',
      request: { reason: 'This reason must not replace the sent case.' },
      artifacts: [{ ...doc, status: 'sent' }],
      activity: [{ bot: 'Servicing', action: 'Marked the agreement sent' }],
    });
    expect(await again.json()).toMatchObject({ ok: true, status: 'sent', idempotent: true, artifactsAdded: 1, activityAdded: 1 });
    const stored = await getCase('LAF-REQ-3100');
    expect(stored?.status).toBe('sent');
    expect(stored?.artifacts[0]?.status).toBe('sent');
    expect(stored?.request.reason).not.toBe('This reason must not replace the sent case.');
    expect(stored?.activity.some((item) => item.action === 'Marked the agreement sent')).toBe(true);
  });

  it('returns 400 naming the bad artifact field and stores nothing', async () => {
    const cases: [unknown, string][] = [
      [[{ ...doc, type: 'video' }], 'artifacts[0].type must be one of'],
      [[{ ...doc, label: ' ' }], 'artifacts[0].label is required.'],
      [[{ ...doc, url: 'javascript:alert(1)' }], 'artifacts[0].url must be an http or https URL.'],
      [[{ ...doc, by: 'Maya' }], 'artifacts[0].by must be one of'],
      [[{ ...doc, status: 'maybe' }], 'artifacts[0].status must be one of'],
      ['nope', 'artifacts must be an array.'],
    ];
    for (const [artifacts, message] of cases) {
      const response = await postCase(requestBody({ ticketId: 'LAF-REQ-3102', artifacts }));
      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain(message);
    }
    expect(await getCase('LAF-REQ-3102')).toBeUndefined();
  });
});
