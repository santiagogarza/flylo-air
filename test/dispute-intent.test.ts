import { describe, expect, it } from 'vitest';
import { claimsDispute } from '@/lib/dispute-intent';
import { evaluateHardship, type LoanRecord } from '@/lib/hardship-policy';

const OPEN_LOAN: LoanRecord = {
  loanNumber: 'LAF-20417',
  daysPastDue: 12,
  totalOnTimePayments: 28,
  extensionsLast12Months: 0,
  flags: [],
  status: 'open',
};

const POSITIVE = [
  'I dispute the late fee on this loan.',
  'We are disputing this charge.',
  "I don't owe this",
  'I do not owe that amount.',
  "I don't owe you anything",
  'I owe nothing on this account.',
  "This isn't my loan.",
  'This is not my loan and I want it fixed.',
  'That is not my debt.',
  'I was charged wrong in October.',
  'You charged me twice for the same payment.',
  'There is an incorrect balance on my statement.',
  'The balance is incorrect.',
  'My balance is wrong.',
  'The late fee is wrong, I paid on the 3rd.',
  'I never authorized that withdrawal.',
  'I never authorized this loan.',
  'I did not authorize that payment.',
  'There was an unauthorized charge on my account.',
  'That record is wrong.',
  'Your records are wrong about my November payment.',
  'The payment record is incorrect.',
  'The amount is not right.',
  'This looks like identity theft.',
  'No debo esto',
  'No debo eso, necesito aclararlo.',
  'Este no es mi préstamo.',
  'Esta no es mi deuda.',
  'Cobro incorrecto en mi cuenta.',
  'Me cobraron mal la cuota.',
  'El saldo es incorrecto.',
  'Saldo incorrecto en mi estado de cuenta.',
  'Nunca autoricé ese cargo.',
  'No autoricé este pago.',
  'El registro está equivocado.',
  'Disputo el cargo por mora.',
  'NO DEBO ESTO',
  'I   don’t   owe   this',
];

const NEGATIVE = [
  "I can't pay this month.",
  'I had a medical bill this month and need to push my payment back a few weeks.',
  'My balance is high.',
  'My balance is high and I need more time.',
  'I owe more than I expected.',
  'I owe more than I expected and I need a payment plan.',
  'Something went wrong with the payment portal, it kept failing.',
  'The payment portal failed three times last night.',
  'I need to move my due date to the 16th.',
  'My hours were cut and I am behind on rent and the electric bill.',
  'I was laid off and cannot make this payment.',
  'My husband is deceased and I need an extension.',
  'I want to keep the car because I need it for work.',
  'I am not sure what I need, money is just tight.',
  'I undisputedly need more time.',
  'Wrong turn at the bank, but I made it and paid.',
  'My account is in good standing but money is tight.',
  'No puedo pagar este mes.',
  'Tuve una factura médica y necesito aplazar el pago.',
  'Mi saldo es alto.',
  'Debo más de lo que esperaba.',
  'Mi nuevo empleador paga el 15, quiero cambiar mi fecha de pago.',
  'Quiero un plan de pagos por correo.',
  'Necesito más tiempo, estoy sin trabajo.',
  '',
];

describe('claimsDispute', () => {
  it.each(POSITIVE.map((text) => [text] as const))('detects: %s', (text) => {
    expect(claimsDispute(text)).toBe(true);
  });

  it.each(NEGATIVE.map((text) => [text] as const))('ignores: %s', (text) => {
    expect(claimsDispute(text)).toBe(false);
  });
});

describe('dispute intent in the case evaluator', () => {
  it.each(POSITIVE.map((text) => [text] as const))('escalates to Compliance: %s', (reason) => {
    const evaluation = evaluateHardship(OPEN_LOAN, { reason, requestedChange: 'Payment extension' });
    expect(evaluation.band).toBe('compliance');
    expect(evaluation.decision).toBe('ESCALATE');
    expect(evaluation.handoff?.team).toBe('Compliance');
  });

  it.each(NEGATIVE.filter(Boolean).map((text) => [text] as const))('does not stop plain hardship wording: %s', (reason) => {
    const evaluation = evaluateHardship(OPEN_LOAN, { reason, requestedChange: 'Payment extension' });
    expect(evaluation.band).not.toBe('compliance');
  });

  it('a dispute is also caught when only the requested change text carries it', () => {
    const evaluation = evaluateHardship(OPEN_LOAN, { reason: 'Please help with this.', requestedChange: 'That record is wrong' });
    expect(evaluation.band).toBe('compliance');
  });
});
