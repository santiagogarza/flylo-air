import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import loansFile from '@/scenarios/lakeline/loans.json';
import { POST as ingest } from '@/app/api/cases/route';
import { POST as act } from '@/app/api/cases/[ticketId]/route';
import { draftReply, evaluateHardship, type LoanRecord } from '@/lib/hardship-policy';
import { getCase, listCases, resetCases } from '@/server/cases';
import { cleanScenarioFields } from '@/scenarios/validate';
import { getScenario } from '@/scenarios';
import { caseById, VALID_CASES } from './fixtures/lakeline-cases';
import { post } from './helpers';

const loans = (loansFile as { loans: LoanRecord[] }).loans;
const loanFor = (number?: string) => loans.find((loan) => loan.loanNumber === number) ?? null;
const scenario = getScenario('lakeline-hardship')!;
const KEY = 'qa-ingest-key';

const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const key of ['DEMO_RESET_KEY', 'CASES_INGEST_KEY']) saved[key] = process.env[key];
  process.env.DEMO_RESET_KEY = 'qa-reset-key';
  process.env.CASES_INGEST_KEY = KEY;
  resetCases();
});
afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function ingestRequest(body: unknown, headers: Record<string, string> = { authorization: `Bearer ${KEY}` }) {
  return post('/api/cases', body, headers);
}

function actRequest(ticketId: string, body: unknown) {
  return [post(`/api/cases/${ticketId}`, body), { params: Promise.resolve({ ticketId }) }] as const;
}

// Cases the policy engine is known to decide differently from the written policy; each was reported to the feature owner.
const KNOWN_POLICY_GAPS = new Set([
  // "dejen de llamarme" (stop calling me) is not recognized as a cease-contact request.
  'spanish-cease-contact',
  // "That record is wrong" disputes a payment record without the word "dispute", so it escalates outside compliance.
  'words-dispute-on-hannah',
]);

describe('policy engine agrees with the synthetic case expectations', () => {
  const certain = VALID_CASES.filter((item) => item.expect.decisionCertain && item.expect.decision !== 'ROUTE_PORTAL_BUG');

  it.each(certain.filter((item) => !KNOWN_POLICY_GAPS.has(item.id)).map((item) => [item.id, item] as const))('%s', (_id, item) => {
    const fields = cleanScenarioFields(scenario, { ...item.input });
    const evaluation = evaluateHardship(loanFor(fields.loanNumber), fields);
    expect(evaluation.decision).toBe(item.expect.decision);
    if (item.expect.complianceStop) expect(evaluation.band).toBe('compliance');
    else expect(evaluation.band).not.toBe('compliance');
  });

  it.fails.each([...KNOWN_POLICY_GAPS].map((id) => [id] as const))('known gap: %s', (id) => {
    const item = caseById(id);
    const fields = cleanScenarioFields(scenario, { ...item.input });
    const evaluation = evaluateHardship(loanFor(fields.loanNumber), fields);
    expect(evaluation.band).toBe('compliance');
  });

  it('every uncertain case is at least routed to a human or a plan, never auto-approved', () => {
    // identity-name-mismatch: the policy has no identity check, so a caller on someone else's loan can be approved (reported).
    for (const item of VALID_CASES.filter((c) => !c.expect.decisionCertain && c.id !== 'identity-name-mismatch')) {
      const fields = cleanScenarioFields(scenario, { ...item.input });
      const decision = evaluateHardship(loanFor(fields.loanNumber), fields).decision;
      expect(decision.startsWith('APPROVE'), item.id).toBe(false);
    }
  });

  it.fails('due-date draft uses the new day, not the old one ("from the 1st to the 16th")', () => {
    const fields = cleanScenarioFields(scenario, { ...caseById('demo-approve-due-date').input });
    const evaluation = evaluateHardship(loanFor(fields.loanNumber), fields);
    expect(draftReply(fields, evaluation)).toContain('to the 16');
  });

  it.fails('"deceased" is not read as a cease-contact request', () => {
    const evaluation = evaluateHardship(loanFor('LAF-20417'), {
      reason: 'My husband is deceased and I need to push this payment back a month.',
      requestedChange: 'Payment extension',
    });
    expect(evaluation.decision).toBe('APPROVE_EXTENSION');
  });

  it('every approval and plan draft carries the required disclosures', () => {
    for (const item of VALID_CASES) {
      const fields = cleanScenarioFields(scenario, { ...item.input });
      const evaluation = evaluateHardship(loanFor(fields.loanNumber), fields);
      const draft = draftReply(fields, evaluation);
      expect(draft, item.id).toContain('This is a summary of your request. Final terms are confirmed in writing.');
      expect(draft, item.id).toContain('Lakeline Auto Finance Customer Care 1-800-555-0142');
      if (evaluation.decision === 'APPROVE_EXTENSION') expect(draft).toContain('Interest continues to accrue');
      if (evaluation.decision === 'OFFER_PAYMENT_PLAN') expect(draft).toContain('Missing a plan payment may end the plan');
    }
  });
});

describe('POST /api/cases ingest (QA)', () => {
  it('rejects a wrong bearer key with 401 and a clear message', async () => {
    const response = await ingest(ingestRequest({ ticketId: 'LAF-REQ-5001' }, { authorization: 'Bearer nope' }));
    expect(response.status).toBe(401);
    expect((await response.json()).error).toMatch(/Unauthorized/);
  });

  it('rejects a missing key header with 401', async () => {
    const response = await ingest(ingestRequest({ ticketId: 'LAF-REQ-5001' }, {}));
    expect(response.status).toBe(401);
  });

  it('rejects non-JSON with 400', async () => {
    const response = await ingest(ingestRequest('not json'));
    expect(response.status).toBe(400);
  });

  const badSchemas: [string, unknown, RegExp][] = [
    ['missing ticketId', { scenario: 'lakeline-hardship', request: { loanNumber: 'LAF-20417' } }, /ticketId is required/],
    ['bad ticketId characters', { ticketId: 'LAF REQ<1>', scenario: 'lakeline-hardship', request: { loanNumber: 'LAF-20417' } }, /ticketId must be/],
    ['unknown scenario', { ticketId: 'LAF-REQ-5001', scenario: 'nope', request: { loanNumber: 'LAF-20417' } }, /Unknown scenario/],
    ['request not an object', { ticketId: 'LAF-REQ-5001', scenario: 'lakeline-hardship', request: 'hi' }, /request must be an object/],
    ['missing loan number', { ticketId: 'LAF-REQ-5001', scenario: 'lakeline-hardship', request: { fullName: 'Maya' } }, /loanNumber is required/],
    ['rules not an array', { ticketId: 'LAF-REQ-5001', scenario: 'lakeline-hardship', request: { loanNumber: 'LAF-20417' }, rules: {} }, /rules must be an array/],
    ['empty draft', { ticketId: 'LAF-REQ-5001', scenario: 'lakeline-hardship', request: { loanNumber: 'LAF-20417' }, draft: '' }, /draft must be/],
    ['bad embedded loan', { ticketId: 'LAF-REQ-5001', scenario: 'lakeline-hardship', request: { loanNumber: 'LAF-20417' }, history: { loan: { daysPastDue: 'x' } } }, /history.loan needs/],
  ];
  it.each(badSchemas)('rejects %s with 400 and a field message', async (_name, body, message) => {
    const response = await ingest(ingestRequest(body));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(message);
  });

  it('ingests every valid synthetic case and files it under the decision the policy picks', async () => {
    for (const [index, item] of VALID_CASES.entries()) {
      const ticketId = `QA-${5000 + index}`;
      const response = await ingest(ingestRequest({ ticketId, scenario: 'lakeline-hardship', fields: cleanScenarioFields(scenario, { ...item.input }) }));
      expect(response.status, item.id).toBe(201);
      const stored = getCase(ticketId)!;
      expect(stored.status).toBe('needs_review');
      expect(stored.request.loanNumber).toBe(item.expect.loanNumber);
      expect(stored.rules.length).toBeGreaterThan(0);
      expect(stored.reasoning.length).toBeGreaterThan(0);
      expect(stored.draft).toContain('Lakeline Auto Finance Customer Care');
    }
    expect(listCases('lakeline-hardship').length).toBe(11 + VALID_CASES.length);
  });

  it.fails('normalizes a raw loan number on ingest ("laf 20417")', async () => {
    const response = await ingest(
      ingestRequest({ ticketId: 'QA-6001', scenario: 'lakeline-hardship', request: { ...caseById('demo-approve-extension').input, loanNumber: 'laf 20417' } }),
    );
    expect(response.status).toBe(201);
    const stored = getCase('QA-6001')!;
    expect(stored.history.loan?.loanNumber, 'loan record should be found after normalization').toBe('LAF-20417');
  });

  it.fails('a live intake ticket id does not collide with a seeded sample case', async () => {
    const seededIds = listCases('lakeline-hardship').map((item) => item.ticketId);
    expect(seededIds, 'seeded ids overlap the LAF-REQ-1001.. ids /api/tickets hands out').not.toContain('LAF-REQ-1001');
  });
});

describe('case actions (QA)', () => {
  const first = () => listCases('lakeline-hardship')[0].ticketId;

  it('send twice is idempotent and never emails', async () => {
    const id = first();
    const one = await (await act(...actRequest(id, { action: 'send', by: 'QA' }))).json();
    const two = await (await act(...actRequest(id, { action: 'send', by: 'QA' }))).json();
    expect(one).toMatchObject({ ok: true, status: 'sent', idempotent: false, emailed: false });
    expect(two).toMatchObject({ ok: true, status: 'sent', idempotent: true, emailed: false });
    expect(getCase(id)!.log.filter((entry) => entry.action === 'sent')).toHaveLength(1);
  });

  it('edit then send stores the edited draft and marks it edited', async () => {
    const id = first();
    const draft = 'Edited reply. This is a summary of your request. Final terms are confirmed in writing. Lakeline Auto Finance Customer Care 1-800-555-0142';
    const response = await act(...actRequest(id, { action: 'edit_send', by: 'QA', draft }));
    expect(response.status).toBe(200);
    const stored = getCase(id)!;
    expect(stored.status).toBe('edited_sent');
    expect(stored.draft).toBe(draft);
    expect(stored.compliance.verdict).toBe('Edited');
  });

  it('rejects an unknown action, missing reviewer, unknown case, and cross-site origin', async () => {
    const id = first();
    expect((await act(...actRequest(id, { action: 'delete', by: 'QA' }))).status).toBe(400);
    expect((await act(...actRequest(id, { action: 'send' }))).status).toBe(400);
    expect((await act(...actRequest('LAF-REQ-0000', { action: 'send', by: 'QA' }))).status).toBe(404);
    const crossSite = post(`/api/cases/${id}`, { action: 'send', by: 'QA' }, { origin: 'https://evil.example', host: 'flylo.example' });
    expect((await act(crossSite, { params: Promise.resolve({ ticketId: id }) })).status).toBe(403);
  });

  it.fails('a rejected case cannot then be sent', async () => {
    const id = first();
    await act(...actRequest(id, { action: 'reject', by: 'QA' }));
    await act(...actRequest(id, { action: 'send', by: 'QA' }));
    expect(getCase(id)!.status, 'send after reject should not flip the case to sent').toBe('rejected');
  });

  it.fails('an escalated case cannot then be sent', async () => {
    const id = first();
    await act(...actRequest(id, { action: 'escalate', by: 'QA' }));
    await act(...actRequest(id, { action: 'send', by: 'QA' }));
    expect(getCase(id)!.status, 'send after escalate should not flip the case to sent').toBe('escalated');
  });

  it('reset restores every seeded case and drops ingested ones', async () => {
    await ingest(ingestRequest({ ticketId: 'QA-7001', scenario: 'lakeline-hardship', request: { loanNumber: 'LAF-20417' } }));
    await act(...actRequest(first(), { action: 'escalate', by: 'QA' }));
    resetCases();
    const cases = listCases('lakeline-hardship');
    expect(cases).toHaveLength(11);
    expect(cases.every((item) => item.status === 'needs_review')).toBe(true);
    expect(getCase('QA-7001')).toBeUndefined();
  });
});
