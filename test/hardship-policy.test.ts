import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkDisclosures, draftReply, evaluateHardship, type HardshipDecision, type LoanRecord } from '@/lib/hardship-policy';
import { headingId, parsePolicy } from '@/lib/policy-doc';
import loansFile from '@/scenarios/lakeline/loans.json';

type RawLoan = LoanRecord & { borrower: string; email: string; demoPath: string };

const loans = (loansFile as { loans: RawLoan[] }).loans;

const expected: Record<string, HardshipDecision> = {
  approve_extension: 'APPROVE_EXTENSION',
  approve_due_date_change: 'APPROVE_DUE_DATE_CHANGE',
  payment_plan_extension_limit: 'OFFER_PAYMENT_PLAN',
  payment_plan_too_few_payments: 'OFFER_PAYMENT_PLAN',
  escalate_over_60_dpd: 'ESCALATE',
  compliance_military: 'ESCALATE',
  compliance_bankruptcy: 'ESCALATE',
  'compliance_dispute (caller disputes a late fee)': 'ESCALATE',
  'compliance_cease_contact (caller asks to stop calls)': 'ESCALATE',
  bug_payment_portal_failed: 'ESCALATE',
  escalate_closed_account: 'ESCALATE',
};

function requestFor(loan: RawLoan) {
  const base = { fullName: loan.borrower, loanNumber: loan.loanNumber, email: loan.email };
  if (loan.demoPath === 'approve_due_date_change') {
    return { ...base, requestedChange: 'Due-date change', requestedDueDay: 15, reason: 'Please move my due date to the 15th.' };
  }
  if (loan.demoPath.startsWith('compliance_dispute')) return { ...base, requestedChange: 'Other', reason: 'I dispute the late fee on this loan.' };
  if (loan.demoPath.startsWith('compliance_cease_contact')) return { ...base, requestedChange: 'Other', reason: 'Please stop calling me.' };
  if (loan.demoPath === 'bug_payment_portal_failed') return { ...base, requestedChange: 'Payment portal problem', reason: 'The payment portal failed when I tried to pay.' };
  return { ...base, requestedChange: 'Payment extension', reason: 'I need an extension.' };
}

describe('hardship policy', () => {
  it('matches every demo path in loans.json', () => {
    for (const loan of loans) {
      const evaluation = evaluateHardship(loan, requestFor(loan));
      expect(evaluation.decision, loan.demoPath).toBe(expected[loan.demoPath]);
      if (loan.demoPath.startsWith('compliance') || loan.demoPath === 'escalate_closed_account') {
        expect(evaluation.band, loan.demoPath).toBe('compliance');
        expect(evaluation.rules.map((rule) => rule.id)).toEqual(['s1']);
      }
      if (loan.demoPath === 'escalate_over_60_dpd' || loan.demoPath === 'bug_payment_portal_failed') {
        expect(evaluation.band).toBe('escalation');
        expect(evaluation.rules.some((rule) => rule.id === 's1' && rule.result === 'pass')).toBe(true);
      }
      if (loan.demoPath.startsWith('payment_plan')) expect(evaluation.band).toBe('plan');
      if (loan.demoPath === 'approve_extension' || loan.demoPath === 'approve_due_date_change') expect(evaluation.band).toBe('approval');
    }
  });

  it('escalates a loan number that is not on file', () => {
    const evaluation = evaluateHardship(null, { loanNumber: 'LAF-99999', requestedChange: 'Payment extension', reason: 'I need an extension.' });
    expect(evaluation.decision).toBe('ESCALATE');
    expect(evaluation.band).toBe('compliance');
    expect(evaluation.rules[0].criteria.find((item) => item.label.startsWith('Account'))?.detail).toContain('not found');
  });

  it('puts the required disclosure sentences in the draft', () => {
    const loan = loans.find((item) => item.demoPath === 'approve_extension');
    if (!loan) throw new Error('missing Santi');
    const evaluation = evaluateHardship(loan, requestFor(loan));
    const draft = draftReply(requestFor(loan), evaluation);
    expect(checkDisclosures(draft, evaluation.decision).every((item) => item.present)).toBe(true);
    expect(checkDisclosures('Thanks.', 'APPROVE_EXTENSION').some((item) => !item.present)).toBe(true);
  });

  it('uses the destination due day, not the day being left behind', () => {
    const loan = loans.find((item) => item.demoPath === 'approve_due_date_change');
    if (!loan) throw new Error('missing Daniel');
    for (const [reason, day] of [
      ['Please move my due date from the 1st to the 16th.', 16],
      ['Please move my due date to the 20th.', 20],
    ] as const) {
      const request = { fullName: loan.borrower, loanNumber: loan.loanNumber, requestedChange: 'Due-date change', reason };
      const evaluation = evaluateHardship(loan, request);
      expect(evaluation.decision, reason).toBe('APPROVE_DUE_DATE_CHANGE');
      expect(evaluation.rules.find((rule) => rule.id === 's3')?.criteria.find((item) => item.label.startsWith('New due day'))?.detail).toContain(String(day));
      const draft = draftReply(request, evaluation);
      expect(draft, reason).toContain(`to the ${day}`);
      expect(draft, reason).not.toMatch(/to the 1(?!\d)/);
    }
  });

  it('does not treat bereavement as a cease-contact stop', () => {
    const loan = loans.find((item) => item.demoPath === 'approve_extension');
    if (!loan) throw new Error('missing Santi');
    const evaluation = evaluateHardship(loan, {
      fullName: loan.borrower,
      loanNumber: loan.loanNumber,
      requestedChange: 'Payment extension',
      reason: 'My spouse is deceased and I need to push the payment back.',
    });
    expect(evaluation.decision).toBe('APPROVE_EXTENSION');
    expect(evaluation.band).toBe('approval');
  });

  it('treats Spanish stop-contact as a compliance escalation', () => {
    const loan = loans.find((item) => item.demoPath === 'payment_plan_extension_limit');
    if (!loan) throw new Error('missing Priya');
    const evaluation = evaluateHardship(loan, {
      fullName: loan.borrower,
      loanNumber: loan.loanNumber,
      requestedChange: 'Payment extension',
      reason: 'Necesito mover el pago. Por favor dejen de llamarme.',
    });
    expect(evaluation.decision).toBe('ESCALATE');
    expect(evaluation.band).toBe('compliance');
    expect(evaluation.rules.map((rule) => rule.id)).toEqual(['s1']);
  });

  it('numbers policy sections so Why links can target them', () => {
    const markdown = readFileSync(new URL('../src/scenarios/lakeline/hardship-policy.md', import.meta.url), 'utf8');
    const headings = parsePolicy(markdown).filter((block) => block.type === 'heading');
    expect(headings.map((heading) => heading.id)).toEqual(['s1', 's2', 's3', 's4', 's5', 's6']);
    expect(headingId('§2. Extension eligibility')).toBe('s2');
  });
});
