import { LAKELINE_PERSONA } from '@/scenarios/lakeline/persona';
import { describe, expect, it } from 'vitest';
import { ISSUE_CATEGORIES, TICKET_FIELDS } from '@/lib/support';
import { createSubmitGuard } from '@/lib/submit-guard';
import { CALL_DROPPED_MESSAGE, GREETING, KEYTERMS, MIC_DENIED_MESSAGE, sessionConfig } from '@/lib/voice-call';
import { getScenario, listScenarios } from '@/scenarios';
import { LAKELINE_DEMO_LINE, LAKELINE_GREETING } from '@/scenarios/lakeline-hardship';
import { normalizeLoanNumber } from '@/scenarios/normalizers';
import { interpretFieldInput, validateScenario } from '@/scenarios/validate';
import { resolveWebhook } from '@/scenarios/webhook';

const supportEnv = {
  SUPPORT_WEBHOOK_URL: 'https://support.example/hook',
  SUPPORT_WEBHOOK_HEADER: 'x-flylo-key',
  SUPPORT_WEBHOOK_KEY: 'support-key',
};

describe('scenario config', () => {
  it('loads the registered scenarios and rejects an unknown id', () => {
    expect(listScenarios().map((scenario) => scenario.id).sort()).toEqual(['flylo-support', 'lakeline-hardship']);
    expect(getScenario('lakeline-hardship')?.ticketPrefix).toBe('LAF-REQ-');
    expect(getScenario('flylo-support')?.legacyPayload).toBe(true);
    expect(getScenario('nope')).toBeUndefined();
    expect(getScenario(' flylo-support ')?.id).toBe('flylo-support');
  });

  it('keeps the FlyLo greeting, demo line, and voice instructions', () => {
    const flylo = getScenario('flylo-support');
    const config = sessionConfig(TICKET_FIELDS, ISSUE_CATEGORIES);
    expect(flylo?.voice.greeting).toBe(GREETING);
    expect(flylo?.voice.greeting).toBe('FlyLo-Air support. How can I help?');
    expect(flylo?.voice.instructions).toBe(config.instructions);
    expect(flylo?.voice.keyterms).toEqual(KEYTERMS);
    expect(flylo?.voice.demoLine).toContain('FLY-48213');
    expect(flylo?.webhook).toBeUndefined();
  });

  it('stores the Lakeline greeting and one-breath demo line', () => {
    const lakeline = getScenario('lakeline-hardship');
    expect(lakeline?.voice.greeting).toBe(LAKELINE_GREETING);
    expect(LAKELINE_GREETING).toBe('Lakeline Auto Finance customer care. How can I help?');
    expect(lakeline?.voice.demoLine).toBe(LAKELINE_DEMO_LINE);
    expect(lakeline?.voice.instructions).toContain('press Submit');
    expect(lakeline?.voice.instructions).toContain('one breath');
    expect(lakeline?.voice.instructions).toMatch(/do not promise an outcome/i);
    expect(lakeline?.webhook).toEqual({
      urlEnv: 'LAKELINE_WEBHOOK_URL',
      keyEnv: 'LAKELINE_WEBHOOK_KEY',
      headerEnv: 'SUPPORT_WEBHOOK_HEADER',
    });
  });
});

describe('loan number normalization', () => {
  const loan = () => getScenario('lakeline-hardship')!.fields.find((field) => field.key === 'loanNumber')!;

  it('normalizes spoken and typed forms to LAF-20417', () => {
    expect(normalizeLoanNumber('laf 20417')).toBe('LAF-20417');
    expect(normalizeLoanNumber('LAF20417')).toBe('LAF-20417');
    expect(normalizeLoanNumber('laf-20417')).toBe('LAF-20417');
    expect(normalizeLoanNumber('L.A.F. 20417')).toBe('LAF-20417');
    expect(normalizeLoanNumber('LAF–20417')).toBe('LAF-20417');
    expect(loan().placeholder).toBe('LAF-20417');
    expect(loan().pattern).toBe('^LAF-\\d{5}$');
    expect(loan().normalize).toBe('loan');
  });

  it('keeps a garbled value and shows the format hint', () => {
    const field = loan();
    const result = interpretFieldInput(field, 'not a loan', []);
    expect(result.value).toBe('not a loan');
    expect(result.error).toBe('Enter a loan number like LAF-20417.');
  });

  it('accepts a messy loan number once it is normalized', () => {
    const field = loan();
    expect(interpretFieldInput(field, 'laf 20417', []).error).toBeUndefined();
    expect(interpretFieldInput(field, 'LAF20417', []).value).toBe('LAF-20417');
  });
});

describe('field edge cases', () => {
  const scenario = () => getScenario('lakeline-hardship')!;

  it('keeps unicode and Spanish text', () => {
    const errors = validateScenario(scenario(), {
      fullName: 'José Núñez',
      loanNumber: 'LAF-20417',
      email: 'jose.nunez@example.com',
      reason: 'Tuve una factura médica y necesito mover el pago unas semanas.',
      requestedChange: 'Payment extension',
      callbackWindow: 'Tardes',
    });
    expect(errors).toEqual({});
  });

  it('rejects very long text with a visible limit', () => {
    const errors = validateScenario(scenario(), {
      fullName: LAKELINE_PERSONA.fullName,
      loanNumber: 'LAF-20417',
      email: LAKELINE_PERSONA.email,
      reason: 'a'.repeat(2001),
      requestedChange: 'Payment extension',
      callbackWindow: 'Afternoons',
    });
    expect(errors.reason).toMatch(/2,000/);
  });

  it('flags a missing loan instead of dropping it silently', () => {
    const errors = validateScenario(scenario(), {
      fullName: LAKELINE_PERSONA.fullName,
      loanNumber: '',
      email: LAKELINE_PERSONA.email,
      reason: 'I need to push my payment back a few weeks.',
      requestedChange: 'Payment extension',
      callbackWindow: 'Afternoons',
    });
    expect(errors.loanNumber).toContain('LAF-20417');
  });
});

describe('webhook env fallback', () => {
  it('uses the support webhook when a scenario omits one', () => {
    expect(resolveWebhook(undefined, supportEnv)).toEqual({
      url: supportEnv.SUPPORT_WEBHOOK_URL,
      headerName: supportEnv.SUPPORT_WEBHOOK_HEADER,
      key: supportEnv.SUPPORT_WEBHOOK_KEY,
    });
    expect(resolveWebhook(getScenario('flylo-support')?.webhook, supportEnv).url).toBe(supportEnv.SUPPORT_WEBHOOK_URL);
  });

  it('uses Lakeline vars when they are set and falls back when they are not', () => {
    const hook = getScenario('lakeline-hardship')!.webhook;
    expect(
      resolveWebhook(hook, {
        ...supportEnv,
        LAKELINE_WEBHOOK_URL: 'https://lakeline.example/hook',
        LAKELINE_WEBHOOK_KEY: 'lake-key',
      }),
    ).toEqual({
      url: 'https://lakeline.example/hook',
      headerName: 'x-flylo-key',
      key: 'lake-key',
    });
    expect(resolveWebhook(hook, supportEnv)).toEqual({
      url: supportEnv.SUPPORT_WEBHOOK_URL,
      headerName: supportEnv.SUPPORT_WEBHOOK_HEADER,
      key: supportEnv.SUPPORT_WEBHOOK_KEY,
    });
  });

  it('falls back only the unset key', () => {
    const hook = getScenario('lakeline-hardship')!.webhook;
    expect(resolveWebhook(hook, { ...supportEnv, LAKELINE_WEBHOOK_URL: 'https://lakeline.example/hook' }).key).toBe('support-key');
  });
});

describe('submit guard', () => {
  it('ignores a second submit until the first one finishes', () => {
    const guard = createSubmitGuard();
    expect(guard.tryBegin()).toBe(true);
    expect(guard.tryBegin()).toBe(false);
    guard.end();
    expect(guard.tryBegin()).toBe(true);
  });
});

describe('voice failure copy', () => {
  it('tells the caller the form still works when the mic is denied or the call drops', () => {
    expect(MIC_DENIED_MESSAGE).toMatch(/microphone is blocked/);
    expect(MIC_DENIED_MESSAGE).toMatch(/use the form/i);
    expect(CALL_DROPPED_MESSAGE).toMatch(/interrupted/);
    expect(CALL_DROPPED_MESSAGE).toMatch(/use the form/i);
  });
});

describe('Lakeline persona', () => {
  it('matches the loan on file and appears in the demo line', async () => {
    const loansFile = (await import('@/scenarios/lakeline/loans.json')).default as { loans: { loanNumber: string; borrower: string; email: string }[] };
    const loan = loansFile.loans.find((item) => item.loanNumber === LAKELINE_PERSONA.loanNumber);
    expect(loan?.borrower).toBe(LAKELINE_PERSONA.fullName);
    expect(loan?.email).toBe(LAKELINE_PERSONA.email);
    const { LAKELINE_DEMO_LINE } = await import('@/scenarios/lakeline-hardship');
    expect(LAKELINE_DEMO_LINE).toContain(LAKELINE_PERSONA.email);
  });
});
