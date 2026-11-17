import { claimsDispute } from './dispute-intent';

export type LoanRecord = {
  loanNumber: string;
  borrower?: string;
  email?: string;
  vehicle?: string;
  monthlyPayment?: number;
  balance?: number;
  dueDay?: number;
  daysPastDue: number;
  onTimePaymentsLast12?: number;
  totalOnTimePayments: number;
  extensionsLast12Months: number;
  flags?: string[];
  status: string;
};

export type HardshipRequest = {
  fullName?: string;
  loanNumber?: string;
  email?: string;
  reason?: string;
  requestedChange?: string;
  callbackWindow?: string;
  requestedDueDay?: number;
};

export type CheckResult = 'pass' | 'fail';

export type RuleCriterion = {
  label: string;
  result: CheckResult;
  detail: string;
};

export type PolicyRule = {
  id: string;
  title: string;
  result: CheckResult;
  detail: string;
  criteria: RuleCriterion[];
};

export type DisclosureCheck = {
  id: string;
  label: string;
  text: string;
  present: boolean;
};

export type HardshipDecision = 'APPROVE_EXTENSION' | 'APPROVE_DUE_DATE_CHANGE' | 'OFFER_PAYMENT_PLAN' | 'ESCALATE';

export type PriorityBand = 'compliance' | 'escalation' | 'plan' | 'approval';

export type HardshipEvaluation = {
  decision: HardshipDecision;
  band: PriorityBand;
  rules: PolicyRule[];
  reasoning: string;
  handoff: { team: string; reason: string } | null;
  disclosures: DisclosureCheck[];
};

export const POLICY_SECTIONS = [
  { id: 's1', number: '1', title: 'Compliance stops' },
  { id: 's2', number: '2', title: 'Extension eligibility' },
  { id: 's3', number: '3', title: 'Due-date change' },
  { id: 's4', number: '4', title: 'Payment plan' },
  { id: 's5', number: '5', title: 'Escalate' },
  { id: 's6', number: '6', title: 'Required disclosures' },
] as const;

const SUMMARY = 'This is a summary of your request. Final terms are confirmed in writing.';
const INTEREST = 'Interest continues to accrue during the deferred period, and your loan term will extend by one month.';
const PLAN_WARNING = 'Missing a plan payment may end the plan and resume normal collection activity.';
const SIGNOFF = 'Lakeline Auto Finance Customer Care';
const PHONE = '1-800-555-0142';

export function evaluateHardship(loan: LoanRecord | null, request: HardshipRequest): HardshipEvaluation {
  const text = `${request.reason ?? ''} ${request.requestedChange ?? ''}`;
  const compliance = complianceRule(loan, text);
  if (compliance.result === 'fail') {
    const reason = compliance.criteria.find((item) => item.result === 'fail')?.detail ?? compliance.detail;
    return finish('ESCALATE', 'compliance', [compliance], `Section 1 stops the review. ${reason}`, {
      team: 'Compliance',
      reason,
    });
  }

  const change = request.requestedChange ?? '';
  const rules: PolicyRule[] = [compliance];

  if (change === 'Due-date change') {
    const due = dueDateRule(loan, request);
    rules.push(due);
    if (due.result === 'pass' && loan) {
      return finish('APPROVE_DUE_DATE_CHANGE', 'approval', rules, 'Section 3 allows one due-date change. The new day is on the request and the account qualifies.', null);
    }
    return finish('ESCALATE', 'escalation', [...rules, escalateRule(loan, 'The due-date change does not qualify.')], 'Section 3 did not pass, and this request is not an extension, so section 5 escalates it.', {
      team: 'Hardship specialist',
      reason: due.detail,
    });
  }

  if (change === 'Payment extension' || change === 'Payment plan') {
    const extension = extensionRule(loan);
    rules.push(extension);
    if (change === 'Payment extension' && extension.result === 'pass' && loan) {
      return finish('APPROVE_EXTENSION', 'approval', rules, 'Section 2 passed. One payment can be deferred to the end of the term. Interest continues to accrue.', null);
    }
    const under60 = (loan?.daysPastDue ?? 999) < 60;
    const failedForPlan = extension.criteria.some(
      (item) => item.result === 'fail' && (item.label.startsWith('At least 6') || item.label.startsWith('Fewer than 2')),
    );
    if (under60 && (change === 'Payment plan' || failedForPlan)) {
      const plan = planRule(loan, extension, change === 'Payment plan');
      rules.push(plan);
      if (plan.result === 'pass') {
        return finish(
          'OFFER_PAYMENT_PLAN',
          'plan',
          rules,
          'Section 4 offers a 3-payment plan with no new fees. The account is under 60 days past due and an extension is not the fit.',
          null,
        );
      }
    }
    const why = (loan?.daysPastDue ?? 0) >= 60 ? 'The account is 60 or more days past due.' : 'The request is not eligible for an extension or a payment plan.';
    rules.push(escalateRule(loan, why));
    return finish('ESCALATE', 'escalation', rules, `Section 5 escalates the request. ${why}`, {
      team: 'Hardship specialist',
      reason: why,
    });
  }

  rules.push(escalateRule(loan, 'The request is not an extension, due-date change, or payment plan.'));
  return finish('ESCALATE', 'escalation', rules, 'Section 5 escalates anything the hardship programs do not cover.', {
    team: 'Hardship specialist',
    reason: change ? `${change} is not a hardship program decision.` : 'No requested change was recorded.',
  });
}

export function checkDisclosures(draft: string, decision: HardshipDecision): DisclosureCheck[] {
  const required: { id: string; label: string; text: string }[] = [
    { id: 'summary', label: 'Summary of the request', text: SUMMARY },
    ...(decision === 'APPROVE_EXTENSION' ? [{ id: 'interest', label: 'Interest continues to accrue', text: INTEREST }] : []),
    ...(decision === 'OFFER_PAYMENT_PLAN' ? [{ id: 'plan', label: 'Missing a plan payment', text: PLAN_WARNING }] : []),
    { id: 'signoff', label: 'Sign-off and phone', text: SIGNOFF },
  ];
  return required.map((item) => ({
    ...item,
    present: draft.includes(item.text) && (item.id !== 'signoff' || draft.includes(PHONE)),
  }));
}

export function draftReply(request: HardshipRequest, evaluation: HardshipEvaluation): string {
  const name = request.fullName?.trim() || 'Hello';
  const loan = request.loanNumber || 'the loan';
  const lines = [`${name}, we received your request about loan ${loan}.`, SUMMARY];
  if (evaluation.decision === 'APPROVE_EXTENSION') {
    lines.push('We can defer one payment to the end of the term.', INTEREST);
  } else if (evaluation.decision === 'APPROVE_DUE_DATE_CHANGE') {
    const day = requestedDueDay(request);
    lines.push(day ? `We can move the due date to the ${day}.` : 'We can move the due date.');
  } else if (evaluation.decision === 'OFFER_PAYMENT_PLAN') {
    lines.push('We can split the past-due amount across the next 3 payments. No new fees.', PLAN_WARNING);
  } else if (evaluation.band === 'compliance') {
    lines.push('We are not deciding the request here. A compliance specialist will follow up.');
  } else {
    lines.push('A hardship specialist will follow up. This note does not approve a change.');
  }
  lines.push(`${SIGNOFF} ${PHONE}`);
  return lines.join(' ');
}

export function priorityRank(band: PriorityBand): number {
  if (band === 'compliance') return 0;
  if (band === 'escalation') return 1;
  if (band === 'plan') return 2;
  return 3;
}

function finish(
  decision: HardshipDecision,
  band: PriorityBand,
  rules: PolicyRule[],
  reasoning: string,
  handoff: { team: string; reason: string } | null,
): HardshipEvaluation {
  return {
    decision,
    band,
    rules,
    reasoning,
    handoff,
    disclosures: [],
  };
}

function complianceRule(loan: LoanRecord | null, text: string): PolicyRule {
  const flags = loan?.flags ?? [];
  const criteria: RuleCriterion[] = [
    flagOrWords('Not active-duty and no SCRA flag', flags, ['active_duty_military'], text, ['active duty', 'scra', 'military'], 'Active-duty or SCRA protection is flagged or mentioned.'),
    flagOrWords('No bankruptcy', flags, ['bankruptcy_filed'], text, ['bankruptcy', 'bankrupt'], 'Bankruptcy is flagged or mentioned.'),
    {
      label: 'Caller does not dispute the debt, a fee, or a payment',
      ...(claimsDispute(text)
        ? { result: 'fail' as const, detail: 'The caller disputes the debt, a fee, or a payment.' }
        : { result: 'pass' as const, detail: 'Not mentioned.' }),
    },
    wordsClear(
      'Caller does not ask us to stop contact',
      text,
      ['stop calling', 'stop contact', 'cease', 'do not call', "don't call", 'do not contact', "don't contact", 'dejen de llamarme', 'deje de llamarme', 'no me llamen', 'no me llame'],
      'The caller asked us to stop contact.',
    ),
    accountOpen(loan),
  ];
  const failed = criteria.filter((item) => item.result === 'fail');
  return {
    id: 's1',
    title: 'Compliance stops',
    result: failed.length ? 'fail' : 'pass',
    detail: failed.length ? failed.map((item) => item.detail).join(' ') : 'No compliance stop.',
    criteria,
  };
}

function extensionRule(loan: LoanRecord | null): PolicyRule {
  const dpd = loan?.daysPastDue;
  const onTime = loan?.totalOnTimePayments;
  const extensions = loan?.extensionsLast12Months;
  const criteria: RuleCriterion[] = [
    {
      label: 'Under 60 days past due',
      result: dpd !== undefined && dpd < 60 ? 'pass' : 'fail',
      detail: dpd === undefined ? 'No loan record.' : `${dpd} days past due.`,
    },
    {
      label: 'At least 6 on-time payments',
      result: onTime !== undefined && onTime >= 6 ? 'pass' : 'fail',
      detail: onTime === undefined ? 'No on-time count.' : `${onTime} on-time payments.`,
    },
    {
      label: 'Fewer than 2 extensions in 12 months',
      result: extensions !== undefined && extensions < 2 ? 'pass' : 'fail',
      detail: extensions === undefined ? 'No extension count.' : `${extensions} extensions in the last 12 months.`,
    },
  ];
  const failed = criteria.filter((item) => item.result === 'fail');
  return {
    id: 's2',
    title: 'Extension eligibility',
    result: failed.length ? 'fail' : 'pass',
    detail: failed.length ? failed.map((item) => item.detail).join(' ') : 'All three extension tests passed.',
    criteria,
  };
}

function dueDateRule(loan: LoanRecord | null, request: HardshipRequest): PolicyRule {
  const dpd = loan?.daysPastDue;
  const onTime = loan?.totalOnTimePayments;
  const day = requestedDueDay(request);
  const criteria: RuleCriterion[] = [
    {
      label: 'Current or under 30 days past due',
      result: dpd !== undefined && dpd < 30 ? 'pass' : 'fail',
      detail: dpd === undefined ? 'No loan record.' : `${dpd} days past due.`,
    },
    {
      label: 'At least 6 on-time payments',
      result: onTime !== undefined && onTime >= 6 ? 'pass' : 'fail',
      detail: onTime === undefined ? 'No on-time count.' : `${onTime} on-time payments.`,
    },
    {
      label: 'New due day is from the 1st through the 28th',
      result: day !== undefined ? 'pass' : 'fail',
      detail: day !== undefined ? `Requested due day is ${day}.` : 'The request does not include a due day from 1 to 28.',
    },
    {
      label: 'Once in 12 months',
      result: 'pass',
      detail: 'The loan record does not list a due-date change in the last 12 months.',
    },
  ];
  const failed = criteria.filter((item) => item.result === 'fail');
  return {
    id: 's3',
    title: 'Due-date change',
    result: failed.length ? 'fail' : 'pass',
    detail: failed.length ? failed.map((item) => item.detail).join(' ') : 'The due-date change is allowed.',
    criteria,
  };
}

function planRule(loan: LoanRecord | null, extension: PolicyRule, explicit: boolean): PolicyRule {
  const dpd = loan?.daysPastDue;
  const extensionFailed = extension.result === 'fail';
  const criteria: RuleCriterion[] = [
    {
      label: 'Under 60 days past due',
      result: dpd !== undefined && dpd < 60 ? 'pass' : 'fail',
      detail: dpd === undefined ? 'No loan record.' : `${dpd} days past due.`,
    },
    {
      label: 'Extension rule failed or the caller asked for a plan',
      result: extensionFailed || explicit ? 'pass' : 'fail',
      detail: explicit ? 'The caller asked for a payment plan.' : extensionFailed ? extension.detail : 'The extension tests passed, so a plan is not the fallback.',
    },
  ];
  const failed = criteria.filter((item) => item.result === 'fail');
  return {
    id: 's4',
    title: 'Payment plan',
    result: failed.length ? 'fail' : 'pass',
    detail: failed.length ? 'A payment plan is not available.' : 'Split the past-due amount across the next 3 payments. No new fees.',
    criteria,
  };
}

function escalateRule(loan: LoanRecord | null, why: string): PolicyRule {
  const dpd = loan?.daysPastDue;
  return {
    id: 's5',
    title: 'Escalate',
    result: 'fail',
    detail: why,
    criteria: [
      {
        label: 'Stays out of the 60-day escalate path',
        result: dpd !== undefined && dpd >= 60 ? 'fail' : 'pass',
        detail: dpd === undefined ? 'No loan record.' : `${dpd} days past due.`,
      },
      {
        label: 'Covered by an extension, due-date change, or payment plan',
        result: 'fail',
        detail: why,
      },
    ],
  };
}

function flagOrWords(label: string, flags: string[], flagNames: string[], text: string, phrases: string[], failDetail: string): RuleCriterion {
  const flagged = flagNames.some((flag) => flags.includes(flag));
  const said = mentions(text, phrases);
  return { label, result: flagged || said ? 'fail' : 'pass', detail: flagged || said ? failDetail : 'Not flagged and not mentioned.' };
}

function wordsClear(label: string, text: string, phrases: string[], failDetail: string): RuleCriterion {
  const said = label.startsWith('Caller does not ask us to stop') ? mentionsPhrase(text, phrases) : mentions(text, phrases);
  return { label, result: said ? 'fail' : 'pass', detail: said ? failDetail : 'Not mentioned.' };
}

function accountOpen(loan: LoanRecord | null): RuleCriterion {
  if (!loan) return { label: 'Account is open and the loan is on file', result: 'fail', detail: 'The loan number was not found.' };
  if (loan.status !== 'open') return { label: 'Account is open and the loan is on file', result: 'fail', detail: `The account status is ${loan.status}.` };
  return { label: 'Account is open and the loan is on file', result: 'pass', detail: 'The account is open.' };
}

function requestedDueDay(request: HardshipRequest): number | undefined {
  if (typeof request.requestedDueDay === 'number' && request.requestedDueDay >= 1 && request.requestedDueDay <= 28) return request.requestedDueDay;
  const reason = request.reason ?? '';
  const destinations = [...reason.matchAll(/\bto\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\b/gi)];
  const destination = destinations.at(-1);
  if (destination) return dayInRange(Number(destination[1]));
  const match = /(?:due (?:date|day)[^.0-9]{0,40})(\d{1,2})(?:st|nd|rd|th)?/i.exec(reason);
  if (!match) return undefined;
  return dayInRange(Number(match[1]));
}

function dayInRange(day: number): number | undefined {
  return day >= 1 && day <= 28 ? day : undefined;
}

function mentions(text: string, phrases: string[]): boolean {
  const hay = text.toLowerCase();
  return phrases.some((phrase) => hay.includes(phrase));
}

function mentionsPhrase(text: string, phrases: string[]): boolean {
  const hay = text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return phrases.some((phrase) => {
    const needle = phrase.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^a-z0-9])${needle}(?=$|[^a-z0-9])`).test(hay);
  });
}
