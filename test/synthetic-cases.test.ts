import { describe, expect, it, vi } from 'vitest';
import loansFile from '@/scenarios/lakeline/loans.json';
import { getScenario } from '@/scenarios';
import { cleanScenarioFields, validateScenario } from '@/scenarios/validate';
import { handleCreateTicket, resetTickets } from '@/server/tickets';
import { DEMO_PATHS, LAKELINE_CASES, REQUIRED_EDGE_TAGS, type SyntheticCase } from './fixtures/lakeline-cases';
import { context, post } from './helpers';

const scenario = getScenario('lakeline-hardship')!;
type Loan = { loanNumber: string; status: string; demoPath: string };
const loans = (loansFile as { loans: Loan[] }).loans;
const baseDemoPath = (path: string) => path.split(' ')[0];

describe('synthetic Lakeline case set', () => {
  it('has at least 40 cases with unique ids', () => {
    expect(LAKELINE_CASES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(LAKELINE_CASES.map((item) => item.id)).size).toBe(LAKELINE_CASES.length);
  });

  it('covers every demo path in loans.json plus the unknown-loan path', () => {
    const fromLoans = loans.map((loan) => baseDemoPath(loan.demoPath));
    expect([...fromLoans, 'unknown_loan'].sort()).toEqual([...DEMO_PATHS].sort());
    const covered = new Set(LAKELINE_CASES.map((item) => item.demoPath).filter(Boolean));
    for (const path of DEMO_PATHS) expect(covered, `demo path ${path}`).toContain(path);
  });

  it('covers every edge-case tag from the mandate', () => {
    const tags = new Set(LAKELINE_CASES.flatMap((item) => item.tags));
    for (const tag of REQUIRED_EDGE_TAGS) expect(tags, `edge tag ${tag}`).toContain(tag);
  });

  it('agrees with loans.json on every normalized loan status', () => {
    for (const item of LAKELINE_CASES.filter((c) => c.expect.loanNumber)) {
      const loan = loans.find((entry) => entry.loanNumber === item.expect.loanNumber);
      const status = loan ? loan.status : 'not_found';
      expect(status, item.id).toBe(item.expect.loanStatus);
    }
  });
});

describe.each(LAKELINE_CASES.map((item) => [item.id, item] as const))('intake validation: %s', (_id, item: SyntheticCase) => {
  it(item.expect.valid ? 'is accepted and normalized' : 'is rejected on the right fields', () => {
    const raw = { ...item.input };
    const errors = validateScenario(scenario, raw);
    if (item.expect.valid) {
      expect(errors).toEqual({});
      const cleaned = cleanScenarioFields(scenario, raw);
      expect(cleaned.loanNumber).toBe(item.expect.loanNumber);
      expect(cleaned.email).toMatch(/^[^\s@A-Z]+@[^\s@A-Z]+\.[^\s@A-Z]+$/);
      expect(cleaned.reason).toBe(item.input.reason.trim());
    } else {
      expect(Object.keys(errors).sort()).toEqual([...(item.expect.invalidFields ?? [])].sort());
    }
  });
});

describe('POST /api/tickets accepts every valid case and rejects every invalid one', () => {
  const env = {
    SUPPORT_WEBHOOK_URL: 'https://hooks.example.test/support',
    SUPPORT_WEBHOOK_HEADER: 'x-e2e-key',
    SUPPORT_WEBHOOK_KEY: 'support-key',
    LAKELINE_WEBHOOK_URL: 'https://hooks.example.test/lakeline',
    LAKELINE_WEBHOOK_KEY: 'lake-key',
  };

  it.each(LAKELINE_CASES.map((item) => [item.id, item] as const))('%s', async (_id, item) => {
    await resetTickets();
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const response = await handleCreateTicket(
      post('/api/tickets', { scenario: 'lakeline-hardship', channel: item.channel, fields: item.input }),
      context(env, fetchImpl as unknown as typeof fetch),
    );
    if (!item.expect.valid) {
      expect(response.status).toBe(400);
      expect(fetchImpl).not.toHaveBeenCalled();
      return;
    }
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, status: 'received' });
    expect(body.id).toMatch(/^LAF-REQ-\d+$/);
    expect(Number(String(body.id).slice('LAF-REQ-'.length))).toBeLessThan(9001);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(env.LAKELINE_WEBHOOK_URL);
    const sent = JSON.parse(String(init.body));
    expect(Object.keys(sent)).toEqual(['scenario', 'id', 'createdAt', 'channel', 'fields', 'category', 'summary', 'description']);
    expect(sent.id).toBe(body.id);
    expect(sent.channel).toBe(item.channel);
    expect(sent.fields.loanNumber).toBe(item.expect.loanNumber);
    expect(sent.category).toBe(item.input.requestedChange);
    expect(sent.summary.length).toBeLessThanOrEqual(400);
  });
});
