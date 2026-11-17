import loansFile from '@/scenarios/lakeline/loans.json';
import { getScenario } from '@/scenarios';
import {
  checkDisclosures,
  draftReply,
  evaluateHardship,
  priorityRank,
  type HardshipRequest,
  type LoanRecord,
  type PolicyRule,
  type PriorityBand,
} from '@/lib/hardship-policy';
import { normalizeLoanNumber } from '@/scenarios/normalizers';
import { asString } from './http';

export type CaseStatus = 'needs_review' | 'sent' | 'edited_sent' | 'escalated' | 'rejected' | 'changes_requested';

export type CaseLog = { at: string; action: string; by: string };

export type ReviewCase = {
  ticketId: string;
  scenario: string;
  request: HardshipRequest;
  history: { loan: LoanRecord | null; priorTickets: { id: string; summary: string }[] };
  decision: string;
  band: PriorityBand;
  rules: ReturnType<typeof evaluateHardship>['rules'];
  reasoning: string;
  compliance: { verdict: string; edits: string[]; disclosures: ReturnType<typeof checkDisclosures> };
  handoff: { team: string; reason: string } | null;
  draft: string;
  status: CaseStatus;
  log: CaseLog[];
  updatedAt: string;
};

type RawLoan = LoanRecord & { borrower: string; email: string; demoPath: string };

const LOANS = (loansFile as { loans: RawLoan[] }).loans;
const SEED_AT = '2026-11-16T15:00:00.000Z';

const state: { ready: boolean; cases: ReviewCase[] } = { ready: false, cases: [] };

export function listCases(scenario: string, status?: string): ReviewCase[] {
  ensure();
  return state.cases
    .filter((item) => item.scenario === scenario && (!status || item.status === status))
    .map(clone)
    .sort((a, b) => priorityRank(a.band) - priorityRank(b.band) || a.ticketId.localeCompare(b.ticketId));
}

export function getCase(ticketId: string): ReviewCase | undefined {
  ensure();
  const found = state.cases.find((item) => item.ticketId === ticketId);
  return found ? clone(found) : undefined;
}

export function resetCases(): { cleared: number; seeded: number } {
  const cleared = state.ready ? state.cases.length : 0;
  state.cases = seedCases();
  state.ready = true;
  return { cleared, seeded: state.cases.length };
}

export function ingestCase(raw: Record<string, unknown>): { status: number; body: Record<string, unknown> } {
  ensure();
  const parsed = parseIngest(raw);
  if ('error' in parsed) return { status: 400, body: { ok: false, error: parsed.error } };

  const existing = state.cases.find((item) => item.ticketId === parsed.value.ticketId);
  if (existing && existing.status !== 'needs_review') {
    return {
      status: 200,
      body: { ok: true, ticketId: existing.ticketId, status: existing.status, idempotent: true, emailed: false },
    };
  }

  const next = buildStored(parsed.value, existing?.log ?? []);
  if (existing) {
    Object.assign(existing, next, { log: [...existing.log, { at: new Date().toISOString(), action: 'updated', by: 'ingest' }] });
    return { status: 200, body: { ok: true, ticketId: existing.ticketId, status: existing.status, emailed: false } };
  }
  state.cases.push(next);
  return { status: 201, body: { ok: true, ticketId: next.ticketId, status: next.status, emailed: false } };
}

/**
 * MOCK ONLY. Records a reviewer and a time on the in-memory case.
 * Does not email, text, or call a webhook.
 */
export function applyCaseAction(
  ticketId: string,
  action: string,
  input: { by?: string; draft?: string },
): { status: number; body: Record<string, unknown> } {
  ensure();
  const item = state.cases.find((entry) => entry.ticketId === ticketId);
  if (!item) return { status: 404, body: { ok: false, error: `No case ${ticketId}.` } };
  const by = (input.by ?? '').trim();
  if (!by) return { status: 400, body: { ok: false, error: 'by is required. It is the reviewer name written on the log.' } };

  if ((action === 'send' || action === 'edit_send') && (item.status === 'rejected' || item.status === 'escalated')) {
    const label = item.status === 'rejected' ? 'rejected' : 'escalated';
    return { status: 409, body: { ok: false, error: `This case is ${label} and cannot be sent.`, status: item.status, emailed: false } };
  }

  if (action === 'send') return mark(item, 'sent', by, ['sent', 'edited_sent']);
  if (action === 'edit_send') {
    const draft = (input.draft ?? '').trim();
    if (!draft) return { status: 400, body: { ok: false, error: 'draft is required when editing.' } };
    if (item.status === 'edited_sent' && item.draft === draft) return already(item);
    item.draft = draft;
    item.compliance = complianceFor(item.decision, draft, ['Reviewer edited the draft before sending.']);
    return mark(item, 'edited_sent', by, []);
  }
  if (action === 'escalate') return mark(item, 'escalated', by, ['escalated']);
  if (action === 'reject') return mark(item, 'rejected', by, ['rejected']);
  if (action === 'request_changes') return mark(item, 'changes_requested', by, ['changes_requested']);
  return { status: 400, body: { ok: false, error: 'action must be send, edit_send, escalate, reject, or request_changes.' } };
}

function mark(item: ReviewCase, status: CaseStatus, by: string, alreadyStatuses: CaseStatus[]): { status: number; body: Record<string, unknown> } {
  if (alreadyStatuses.includes(item.status)) return already(item);
  item.status = status;
  item.updatedAt = new Date().toISOString();
  item.log.push({ at: item.updatedAt, action: status, by });
  return { status: 200, body: { ok: true, ticketId: item.ticketId, status: item.status, idempotent: false, emailed: false } };
}

function already(item: ReviewCase): { status: number; body: Record<string, unknown> } {
  return { status: 200, body: { ok: true, ticketId: item.ticketId, status: item.status, idempotent: true, emailed: false } };
}

function ensure() {
  if (state.ready) return;
  state.cases = seedCases();
  state.ready = true;
}

function seedCases(): ReviewCase[] {
  return LOANS.map((loan, index) => {
    const request = sampleRequest(loan);
    const evaluation = evaluateHardship(toRecord(loan), request);
    const draft = draftReply(request, evaluation);
    return {
      ticketId: `LAF-REQ-${9001 + index}`,
      scenario: 'lakeline-hardship',
      request,
      history: { loan: toRecord(loan), priorTickets: [] },
      decision: evaluation.decision,
      band: evaluation.band,
      rules: evaluation.rules,
      reasoning: evaluation.reasoning,
      compliance: complianceFor(evaluation.decision, draft, []),
      handoff: evaluation.handoff,
      draft,
      status: 'needs_review',
      log: [{ at: SEED_AT, action: 'seeded', by: 'loans.json' }],
      updatedAt: SEED_AT,
    };
  });
}

function sampleRequest(loan: RawLoan): HardshipRequest {
  const base = { fullName: loan.borrower, loanNumber: loan.loanNumber, email: loan.email, callbackWindow: 'Afternoons' };
  switch (loan.demoPath) {
    case 'approve_due_date_change':
      return { ...base, requestedChange: 'Due-date change', requestedDueDay: 15, callbackWindow: 'Mornings', reason: 'Please move my due date to the 15th.' };
    case 'payment_plan_extension_limit':
      return { ...base, requestedChange: 'Payment extension', reason: 'I need another extension this month.' };
    case 'payment_plan_too_few_payments':
      return { ...base, requestedChange: 'Payment extension', reason: 'I need an extension.' };
    case 'escalate_over_60_dpd':
      return { ...base, requestedChange: 'Payment extension', reason: 'I need more time on the payment.' };
    case 'compliance_military':
      return { ...base, requestedChange: 'Payment extension', reason: 'I am on active duty and need to push the payment back.' };
    case 'compliance_bankruptcy':
      return { ...base, requestedChange: 'Payment extension', reason: 'I filed bankruptcy and need an extension.' };
    case 'compliance_dispute (caller disputes a late fee)':
      return { ...base, requestedChange: 'Other', reason: 'I dispute the late fee on this loan.' };
    case 'compliance_cease_contact (caller asks to stop calls)':
      return { ...base, requestedChange: 'Other', reason: 'Please stop calling me about this loan.' };
    case 'bug_payment_portal_failed':
      return { ...base, requestedChange: 'Payment portal problem', reason: 'The payment portal failed when I tried to pay.' };
    case 'escalate_closed_account':
      return { ...base, requestedChange: 'Payment extension', reason: 'I need a payment extension.' };
    default:
      return { ...base, requestedChange: 'Payment extension', reason: 'I had a medical bill this month and need to push my payment back a few weeks.' };
  }
}

type IngestValue = {
  ticketId: string;
  scenario: string;
  request: HardshipRequest;
  priorTickets: { id: string; summary: string }[];
  loan: LoanRecord | null;
  draft?: string;
  decision?: string;
  rules: ReturnType<typeof evaluateHardship>['rules'];
};

function parseIngest(raw: Record<string, unknown>): { error: string } | { value: IngestValue } {
  const ticketId = asString(raw.ticketId) || asString(raw.id);
  if (!ticketId) return { error: 'ticketId is required.' };
  if (!/^[A-Za-z0-9-]{4,40}$/.test(ticketId)) return { error: 'ticketId must be 4 to 40 letters, numbers, or hyphens.' };
  const scenario = asString(raw.scenario).trim();
  if (!scenario) return { error: 'scenario is required.' };
  if (!getScenario(scenario)) return { error: `Unknown scenario "${scenario}".` };
  const requestRaw = raw.request ?? raw.fields;
  if (!requestRaw || typeof requestRaw !== 'object' || Array.isArray(requestRaw)) return { error: 'request must be an object of fields.' };
  const request = requestFrom(requestRaw as Record<string, unknown>);
  if (scenario === 'lakeline-hardship' && !request.loanNumber) return { error: 'request.loanNumber is required.' };
  const rules = rulesFrom(raw.rules);
  if ('error' in rules) return rules;
  const decision = asString(raw.decision).trim();
  if (scenario !== 'lakeline-hardship' && (rules.value.length === 0 || !decision)) {
    return { error: 'rules is required when this scenario has no policy evaluator. decision is required too.' };
  }
  const prior = priorTicketsFrom(raw.history);
  if ('error' in prior) return prior;
  const loan = loanFrom(raw.history, request.loanNumber);
  if ('error' in loan) return loan;
  const draft = raw.draft === undefined ? undefined : asString(raw.draft);
  if (raw.draft !== undefined && !draft) return { error: 'draft must be a non-empty string when it is sent.' };
  return { value: { ticketId, scenario, request, priorTickets: prior.value, loan: loan.value, draft, decision: decision || undefined, rules: rules.value } };
}

function rulesFrom(raw: unknown): { error: string } | { value: PolicyRule[] } {
  if (raw === undefined) return { value: [] };
  if (!Array.isArray(raw)) return { error: 'rules must be an array.' };
  const value: PolicyRule[] = [];
  for (const [index, rule] of raw.entries()) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return { error: `rules[${index}] must be an object.` };
    const item = rule as Record<string, unknown>;
    if (!asString(item.id) || !asString(item.title) || (item.result !== 'pass' && item.result !== 'fail')) {
      return { error: `rules[${index}] needs id, title, and result (pass or fail).` };
    }
    value.push({
      id: asString(item.id),
      title: asString(item.title),
      result: item.result === 'pass' ? 'pass' : 'fail',
      detail: asString(item.detail),
      criteria: [],
    });
  }
  return { value };
}

function buildStored(value: IngestValue, log: CaseLog[]): ReviewCase {
  const evaluation = value.scenario === 'lakeline-hardship' ? evaluateHardship(value.loan, value.request) : null;
  const draft = value.draft || (evaluation ? draftReply(value.request, evaluation) : '');
  const decision = evaluation?.decision ?? value.decision ?? 'RECEIVED';
  return {
    ticketId: value.ticketId,
    scenario: value.scenario,
    request: value.request,
    history: { loan: value.loan, priorTickets: value.priorTickets },
    decision,
    band: evaluation?.band ?? 'escalation',
    rules: evaluation?.rules ?? value.rules,
    reasoning: evaluation?.reasoning ?? 'No hardship policy is configured for this scenario.',
    compliance: complianceFor(decision, draft, []),
    handoff: evaluation?.handoff ?? null,
    draft,
    status: 'needs_review',
    log: [...log, { at: new Date().toISOString(), action: 'ingested', by: 'api' }],
    updatedAt: new Date().toISOString(),
  };
}

function complianceFor(decision: string, draft: string, edits: string[]) {
  const disclosures = checkDisclosures(draft, decision === 'APPROVE_EXTENSION' || decision === 'APPROVE_DUE_DATE_CHANGE' || decision === 'OFFER_PAYMENT_PLAN' || decision === 'ESCALATE' ? decision : 'ESCALATE');
  const missing = disclosures.some((item) => !item.present);
  return { verdict: edits.length ? 'Edited' : missing ? 'Missing disclosure' : 'Clear', edits, disclosures };
}

function requestFrom(raw: Record<string, unknown>): HardshipRequest {
  const due = raw.requestedDueDay;
  return {
    fullName: asString(raw.fullName),
    loanNumber: normalizeLoanNumber(asString(raw.loanNumber)),
    email: asString(raw.email),
    reason: asString(raw.reason),
    requestedChange: asString(raw.requestedChange),
    callbackWindow: asString(raw.callbackWindow),
    requestedDueDay: typeof due === 'number' ? due : undefined,
  };
}

function priorTicketsFrom(history: unknown): { error: string } | { value: { id: string; summary: string }[] } {
  if (history === undefined) return { value: [] };
  if (!history || typeof history !== 'object' || Array.isArray(history)) return { error: 'history must be an object.' };
  const prior = (history as { priorTickets?: unknown }).priorTickets;
  if (prior === undefined) return { value: [] };
  if (!Array.isArray(prior)) return { error: 'history.priorTickets must be an array.' };
  const value = prior.map((item) => {
    const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    return { id: asString(record.id), summary: asString(record.summary) };
  });
  return { value };
}

function loanFrom(history: unknown, loanNumber: string | undefined): { error: string } | { value: LoanRecord | null } {
  const embedded = history && typeof history === 'object' && !Array.isArray(history) ? (history as { loan?: unknown }).loan : undefined;
  if (embedded) {
    if (typeof embedded !== 'object' || Array.isArray(embedded)) return { error: 'history.loan must be an object.' };
    const loan = embedded as Record<string, unknown>;
    if (typeof loan.daysPastDue !== 'number' || typeof loan.totalOnTimePayments !== 'number' || typeof loan.extensionsLast12Months !== 'number') {
      return { error: 'history.loan needs daysPastDue, totalOnTimePayments, and extensionsLast12Months.' };
    }
    return {
      value: {
        loanNumber: asString(loan.loanNumber) || loanNumber || '',
        borrower: asString(loan.borrower),
        email: asString(loan.email),
        vehicle: asString(loan.vehicle),
        balance: typeof loan.balance === 'number' ? loan.balance : undefined,
        monthlyPayment: typeof loan.monthlyPayment === 'number' ? loan.monthlyPayment : undefined,
        dueDay: typeof loan.dueDay === 'number' ? loan.dueDay : undefined,
        daysPastDue: loan.daysPastDue,
        onTimePaymentsLast12: typeof loan.onTimePaymentsLast12 === 'number' ? loan.onTimePaymentsLast12 : undefined,
        totalOnTimePayments: loan.totalOnTimePayments,
        extensionsLast12Months: loan.extensionsLast12Months,
        flags: Array.isArray(loan.flags) ? loan.flags.filter((flag): flag is string => typeof flag === 'string') : [],
        status: asString(loan.status) || 'open',
      },
    };
  }
  const known = LOANS.find((loan) => loan.loanNumber === loanNumber);
  return { value: known ? toRecord(known) : null };
}

function toRecord(loan: RawLoan): LoanRecord {
  return {
    loanNumber: loan.loanNumber,
    borrower: loan.borrower,
    email: loan.email,
    vehicle: loan.vehicle,
    monthlyPayment: loan.monthlyPayment,
    balance: loan.balance,
    dueDay: loan.dueDay,
    daysPastDue: loan.daysPastDue,
    onTimePaymentsLast12: loan.onTimePaymentsLast12,
    totalOnTimePayments: loan.totalOnTimePayments,
    extensionsLast12Months: loan.extensionsLast12Months,
    flags: loan.flags,
    status: loan.status,
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
