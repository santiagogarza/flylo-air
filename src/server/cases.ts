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
import {
  ARTIFACT_STATUSES,
  ARTIFACT_TYPES,
  BOTS,
  artifactCount,
  artifactKey,
  type ArtifactStatus,
  type ArtifactType,
  type BotName,
  type CaseActivity,
  type CaseArtifact,
} from '@/lib/case-artifacts';
import { normalizeLoanNumber } from '@/scenarios/normalizers';
import { currentBag } from './demo-store';
import { asString } from './http';

export type CaseStatus = 'needs_review' | 'sent' | 'edited_sent' | 'escalated' | 'rejected' | 'changes_requested';

export type { ArtifactStatus, ArtifactType, BotName, CaseActivity, CaseArtifact } from '@/lib/case-artifacts';
export { artifactCount } from '@/lib/case-artifacts';

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
  artifacts: CaseArtifact[];
  activity: CaseActivity[];
  updatedAt: string;
};

export type ReviewCaseRow = ReviewCase & { artifactCount: number };

type RawLoan = LoanRecord & { borrower: string; email: string; demoPath: string };

const LOANS = (loansFile as { loans: RawLoan[] }).loans;
const SEED_AT = '2026-11-16T15:00:00.000Z';

type CaseFile = { cases: ReviewCase[] };

async function loadCases(): Promise<ReviewCase[]> {
  const stored = await (await currentBag()).read('cases');
  if (stored && typeof stored === 'object' && Array.isArray((stored as CaseFile).cases)) {
    return (stored as CaseFile).cases.map((item) => ({ ...item, artifacts: item.artifacts ?? [], activity: item.activity ?? [] }));
  }
  const seeded = seedCases();
  await saveCases(seeded);
  return seeded;
}

async function saveCases(cases: ReviewCase[]): Promise<void> {
  await (await currentBag()).write('cases', { cases });
}

export async function listCases(scenario: string, status?: string): Promise<ReviewCaseRow[]> {
  const cases = await loadCases();
  return cases
    .filter((item) => item.scenario === scenario && (!status || item.status === status))
    .map((item) => ({ ...clone(item), artifactCount: artifactCount(item) }))
    .sort((a, b) => priorityRank(a.band) - priorityRank(b.band) || a.ticketId.localeCompare(b.ticketId));
}

export async function getCase(ticketId: string): Promise<ReviewCase | undefined> {
  const cases = await loadCases();
  const found = cases.find((item) => item.ticketId === ticketId);
  return found ? clone(found) : undefined;
}

export async function resetCases(options?: { empty?: boolean }): Promise<{ cleared: number; seeded: number }> {
  const stored = await (await currentBag()).read('cases');
  const cleared = stored && typeof stored === 'object' && Array.isArray((stored as CaseFile).cases) ? (stored as CaseFile).cases.length : 0;
  if (options?.empty) {
    await saveCases([]);
    return { cleared, seeded: 0 };
  }
  const seeded = seedCases();
  await saveCases(seeded);
  return { cleared, seeded: seeded.length };
}

export async function ingestCase(raw: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const cases = await loadCases();
  const existing = cases.find((item) => item.ticketId === (asString(raw.ticketId) || asString(raw.id)));
  const parsed = parseIngest(raw, existing);
  if ('error' in parsed) return { status: 400, body: { ok: false, error: parsed.error } };

  if (existing) {
    const added = mergeExtras(existing, parsed.value);
    if (existing.status === 'needs_review') {
      const next = buildStored(mergeValue(existing, parsed.value), existing);
      Object.assign(existing, next);
      existing.log.push({ at: new Date().toISOString(), action: 'updated', by: 'ingest' });
      await saveCases(cases);
      return { status: 200, body: { ok: true, ticketId: existing.ticketId, status: existing.status, emailed: false, artifactsAdded: added.artifacts, activityAdded: added.activity } };
    }
    if (added.artifacts || added.activity) await saveCases(cases);
    return {
      status: 200,
      body: { ok: true, ticketId: existing.ticketId, status: existing.status, idempotent: true, emailed: false, artifactsAdded: added.artifacts, activityAdded: added.activity },
    };
  }

  const next = buildStored(parsed.value, null);
  mergeExtras(next, parsed.value);
  cases.push(next);
  await saveCases(cases);
  return { status: 201, body: { ok: true, ticketId: next.ticketId, status: next.status, emailed: false } };
}

function mergeExtras(item: ReviewCase, value: IngestValue): { artifacts: number; activity: number } {
  let artifacts = 0;
  for (const incoming of value.artifacts) {
    const found = item.artifacts.find((current) => artifactKey(current) === artifactKey(incoming));
    if (!found) {
      item.artifacts.push(incoming);
      artifacts += 1;
    } else if (found.status !== incoming.status || found.by !== incoming.by) {
      found.status = incoming.status;
      found.by = incoming.by;
      artifacts += 1;
    }
  }
  let activity = 0;
  for (const incoming of value.activity) {
    const duplicate = item.activity.some(
      (current) =>
        current.bot === incoming.bot &&
        current.action === incoming.action &&
        (current.detail ?? '') === (incoming.detail ?? '') &&
        (!incoming.explicitAt || current.at === incoming.at),
    );
    if (!duplicate) {
      const { explicitAt: _explicit, ...entry } = incoming;
      item.activity.push(entry);
      activity += 1;
    }
  }
  if (artifacts || activity) item.updatedAt = new Date().toISOString();
  return { artifacts, activity };
}

function mergeValue(existing: ReviewCase, value: IngestValue): IngestValue {
  const request = { ...existing.request };
  for (const [key, field] of Object.entries(value.request)) {
    if (field !== undefined && field !== '') (request as Record<string, unknown>)[key] = field;
  }
  const priorIds = new Set(value.priorTickets.map((item) => item.id));
  return {
    ...value,
    request,
    loan: value.loan ?? existing.history.loan,
    priorTickets: [...existing.history.priorTickets.filter((item) => !priorIds.has(item.id)), ...value.priorTickets],
    draft: value.draft ?? existing.draft,
    decision: value.decision ?? (value.scenario === 'lakeline-hardship' ? undefined : existing.decision),
    rules: value.rules.length ? value.rules : existing.rules,
  };
}

/**
 * MOCK ONLY. Records a reviewer and a time on the demo store.
 * Does not email, text, or call a webhook.
 */
export async function applyCaseAction(
  ticketId: string,
  action: string,
  input: { by?: string; draft?: string },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const cases = await loadCases();
  const item = cases.find((entry) => entry.ticketId === ticketId);
  if (!item) return { status: 404, body: { ok: false, error: `No case ${ticketId}.` } };
  const by = (input.by ?? '').trim();
  if (!by) return { status: 400, body: { ok: false, error: 'by is required. It is the reviewer name written on the log.' } };

  if ((action === 'send' || action === 'edit_send') && (item.status === 'rejected' || item.status === 'escalated')) {
    const label = item.status === 'rejected' ? 'rejected' : 'escalated';
    return { status: 409, body: { ok: false, error: `This case is ${label} and cannot be sent.`, status: item.status, emailed: false } };
  }

  let result: { status: number; body: Record<string, unknown> };
  let dirty = false;
  if (action === 'send') {
    result = mark(item, 'sent', by, ['sent', 'edited_sent']);
    dirty = result.body.idempotent !== true;
  } else if (action === 'edit_send') {
    const draft = (input.draft ?? '').trim();
    if (!draft) return { status: 400, body: { ok: false, error: 'draft is required when editing.' } };
    if (item.status === 'edited_sent' && item.draft === draft) return already(item);
    item.draft = draft;
    item.compliance = complianceFor(item.decision, draft, ['Reviewer edited the draft before sending.']);
    result = mark(item, 'edited_sent', by, []);
    dirty = true;
  } else if (action === 'escalate') {
    result = mark(item, 'escalated', by, ['escalated']);
    dirty = result.body.idempotent !== true;
  } else if (action === 'reject') {
    result = mark(item, 'rejected', by, ['rejected']);
    dirty = result.body.idempotent !== true;
  } else if (action === 'request_changes') {
    result = mark(item, 'changes_requested', by, ['changes_requested']);
    dirty = result.body.idempotent !== true;
  } else {
    return { status: 400, body: { ok: false, error: 'action must be send, edit_send, escalate, reject, or request_changes.' } };
  }
  if (dirty) await saveCases(cases);
  return result;
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
      ...seedExtras(`LAF-REQ-${9001 + index}`, request, evaluation),
      updatedAt: SEED_AT,
    };
  });
}

const MOCK_HOST = 'https://mock.lakeline.example';

function seedExtras(ticketId: string, request: HardshipRequest, evaluation: ReturnType<typeof evaluateHardship>): { artifacts: CaseArtifact[]; activity: CaseActivity[] } {
  const at = (minutes: number) => new Date(Date.parse(SEED_AT) + minutes * 60_000).toISOString();
  const artifact = (type: ArtifactType, label: string, path: string, status: ArtifactStatus, by: BotName, minutes: number): CaseArtifact => ({
    type,
    label,
    url: `${MOCK_HOST}/${path}/${ticketId}`,
    createdAt: at(minutes),
    status,
    by,
  });
  const artifacts: CaseArtifact[] = [];
  const activity: CaseActivity[] = [
    { at: at(0), bot: 'Intake', action: 'Request received', detail: request.requestedChange },
    { at: at(1), bot: 'Servicing', action: 'Checked the loan record', detail: request.loanNumber },
    { at: at(2), bot: 'Compliance', action: 'Ran the policy checks', detail: evaluation.decision },
  ];
  const decision = evaluation.decision;
  const portal = request.requestedChange === 'Payment portal problem';

  if (decision === 'APPROVE_EXTENSION') {
    artifacts.push(artifact('doc', 'Extension agreement drafted in Google Docs', 'docs', 'drafted', 'Servicing', 3));
    activity.push({ at: at(3), bot: 'Servicing', action: 'Drafted the extension agreement', detail: 'Google Docs' });
  } else if (decision === 'APPROVE_DUE_DATE_CHANGE') {
    artifacts.push(artifact('doc', 'Due-date change letter drafted in Google Docs', 'docs', 'drafted', 'Servicing', 3));
    activity.push({ at: at(3), bot: 'Servicing', action: 'Drafted the due-date change letter', detail: 'Google Docs' });
  } else if (decision === 'OFFER_PAYMENT_PLAN') {
    artifacts.push(artifact('doc', 'Payment plan agreement drafted in Google Docs', 'docs', 'drafted', 'Servicing', 3));
    activity.push({ at: at(3), bot: 'Servicing', action: 'Drafted the payment plan agreement', detail: 'Google Docs' });
  }

  if (decision !== 'ESCALATE') {
    artifacts.push(artifact('sheet', 'Logged to Servicing Ledger', 'sheets', 'logged', 'Servicing', 4));
    activity.push({ at: at(4), bot: 'Servicing', action: 'Logged the request to the Servicing Ledger' });
    artifacts.push(artifact('record', 'Loan record updated', 'records', 'updated', 'Servicing', 5));
    activity.push({ at: at(5), bot: 'Servicing', action: 'Updated the loan record', detail: request.loanNumber });
  }

  artifacts.push(artifact('email_draft', 'Reply drafted in Gmail, not sent', 'mail', 'drafted', 'Compliance', 6));
  activity.push({ at: at(6), bot: 'Compliance', action: 'Checked the reply for required disclosures', detail: 'Reply is a draft and has not been sent' });

  if (decision !== 'ESCALATE') {
    artifacts.push(artifact('calendar', `Callback held on calendar (${request.callbackWindow || 'any time'})`, 'calendar', 'held', 'Intake', 7));
    activity.push({ at: at(7), bot: 'Intake', action: 'Held a callback slot', detail: request.callbackWindow });
  }

  if (portal) {
    artifacts.push(artifact('pr', 'Payment portal fix opened as a pull request', 'pull', 'created', 'Escalation', 8));
    activity.push({ at: at(8), bot: 'Escalation', action: 'Opened a pull request for the portal bug' });
  } else if (evaluation.handoff) {
    artifacts.push(artifact('record', `Handed off to ${evaluation.handoff.team}`, 'handoffs', 'created', 'Escalation', 8));
    activity.push({ at: at(8), bot: 'Escalation', action: `Flagged for ${evaluation.handoff.team}`, detail: evaluation.handoff.reason });
  }

  return {
    artifacts,
    activity: activity.map((entry) => (entry.detail ? entry : { at: entry.at, bot: entry.bot, action: entry.action })),
  };
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
  artifacts: CaseArtifact[];
  activity: (CaseActivity & { explicitAt?: boolean })[];
};

function parseIngest(raw: Record<string, unknown>, existing?: ReviewCase): { error: string } | { value: IngestValue } {
  const ticketId = asString(raw.ticketId) || asString(raw.id);
  if (!ticketId) return { error: 'ticketId is required.' };
  if (!/^[A-Za-z0-9-]{4,40}$/.test(ticketId)) return { error: 'ticketId must be 4 to 40 letters, numbers, or hyphens.' };
  const scenario = asString(raw.scenario).trim() || existing?.scenario || '';
  if (!scenario) return { error: 'scenario is required.' };
  if (!getScenario(scenario)) return { error: `Unknown scenario "${scenario}".` };
  const requestRaw = raw.request ?? raw.fields ?? (existing ? {} : undefined);
  if (!requestRaw || typeof requestRaw !== 'object' || Array.isArray(requestRaw)) return { error: 'request must be an object of fields.' };
  const request = requestFrom(requestRaw as Record<string, unknown>);
  if (scenario === 'lakeline-hardship' && !request.loanNumber && !existing) return { error: 'request.loanNumber is required.' };
  const artifacts = artifactsFrom(raw.artifacts);
  if ('error' in artifacts) return artifacts;
  const activity = activityFrom(raw.activity);
  if ('error' in activity) return activity;
  const rules = rulesFrom(raw.rules);
  if ('error' in rules) return rules;
  const decision = asString(raw.decision).trim();
  if (scenario !== 'lakeline-hardship' && !existing && (rules.value.length === 0 || !decision)) {
    return { error: 'rules is required when this scenario has no policy evaluator. decision is required too.' };
  }
  const prior = priorTicketsFrom(raw.history);
  if ('error' in prior) return prior;
  const loan = loanFrom(raw.history, request.loanNumber || existing?.request.loanNumber);
  if ('error' in loan) return loan;
  const draft = raw.draft === undefined ? undefined : asString(raw.draft);
  if (raw.draft !== undefined && !draft) return { error: 'draft must be a non-empty string when it is sent.' };
  return { value: { ticketId, scenario, request, priorTickets: prior.value, loan: loan.value, draft, decision: decision || undefined, rules: rules.value, artifacts: artifacts.value, activity: activity.value } };
}

function artifactsFrom(raw: unknown): { error: string } | { value: CaseArtifact[] } {
  if (raw === undefined) return { value: [] };
  if (!Array.isArray(raw)) return { error: 'artifacts must be an array.' };
  const value: CaseArtifact[] = [];
  for (const [index, entry] of raw.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return { error: `artifacts[${index}] must be an object.` };
    const item = entry as Record<string, unknown>;
    const type = asString(item.type);
    if (!(ARTIFACT_TYPES as readonly string[]).includes(type)) return { error: `artifacts[${index}].type must be one of ${ARTIFACT_TYPES.join(', ')}.` };
    const label = asString(item.label).trim();
    if (!label) return { error: `artifacts[${index}].label is required.` };
    const url = asString(item.url).trim();
    if (!/^https?:\/\/\S+$/i.test(url)) return { error: `artifacts[${index}].url must be an http or https URL.` };
    const status = asString(item.status) || 'created';
    if (!(ARTIFACT_STATUSES as readonly string[]).includes(status)) return { error: `artifacts[${index}].status must be one of ${ARTIFACT_STATUSES.join(', ')}.` };
    const by = asString(item.by) || 'Intake';
    if (!(BOTS as readonly string[]).includes(by)) return { error: `artifacts[${index}].by must be one of ${BOTS.join(', ')}.` };
    const at = timeFrom(item.createdAt);
    if (item.createdAt !== undefined && !at) return { error: `artifacts[${index}].createdAt must be an ISO date.` };
    value.push({ type: type as ArtifactType, label, url, createdAt: at ?? new Date().toISOString(), status: status as ArtifactStatus, by: by as BotName });
  }
  return { value };
}

function activityFrom(raw: unknown): { error: string } | { value: (CaseActivity & { explicitAt?: boolean })[] } {
  if (raw === undefined) return { value: [] };
  if (!Array.isArray(raw)) return { error: 'activity must be an array.' };
  const value: (CaseActivity & { explicitAt?: boolean })[] = [];
  for (const [index, entry] of raw.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return { error: `activity[${index}] must be an object.` };
    const item = entry as Record<string, unknown>;
    const bot = asString(item.bot);
    if (!(BOTS as readonly string[]).includes(bot)) return { error: `activity[${index}].bot must be one of ${BOTS.join(', ')}.` };
    const action = asString(item.action).trim();
    if (!action) return { error: `activity[${index}].action is required.` };
    const at = timeFrom(item.at);
    if (item.at !== undefined && !at) return { error: `activity[${index}].at must be an ISO date.` };
    const detail = asString(item.detail).trim();
    value.push({ at: at ?? new Date().toISOString(), bot: bot as BotName, action, ...(detail ? { detail } : {}), explicitAt: Boolean(at) });
  }
  return { value };
}

function timeFrom(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
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

function buildStored(value: IngestValue, previous: ReviewCase | null): ReviewCase {
  const evaluation = value.scenario === 'lakeline-hardship' ? evaluateHardship(value.loan, value.request) : null;
  const draft = value.draft || (evaluation ? draftReply(value.request, evaluation) : '');
  const decision = evaluation?.decision ?? value.decision ?? 'RECEIVED';
  const now = new Date().toISOString();
  const activity = previous ? previous.activity : [...intakeActivity(value, evaluation, now)];
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
    log: [...(previous?.log ?? []), { at: now, action: 'ingested', by: 'api' }],
    artifacts: previous ? previous.artifacts : [],
    activity,
    updatedAt: now,
  };
}

function intakeActivity(value: IngestValue, evaluation: ReturnType<typeof evaluateHardship> | null, at: string): CaseActivity[] {
  const entries: CaseActivity[] = [{ at, bot: 'Intake', action: 'Request received', detail: value.request.requestedChange || undefined }];
  if (evaluation) {
    entries.push({ at, bot: 'Servicing', action: 'Checked the loan record', detail: value.loan ? value.loan.loanNumber : 'Loan not found' });
    entries.push({ at, bot: 'Compliance', action: 'Ran the policy checks', detail: evaluation.decision });
    if (evaluation.handoff) entries.push({ at, bot: 'Escalation', action: `Flagged for ${evaluation.handoff.team}`, detail: evaluation.handoff.reason });
  }
  return entries.map((entry) => (entry.detail ? entry : { at: entry.at, bot: entry.bot, action: entry.action }));
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
