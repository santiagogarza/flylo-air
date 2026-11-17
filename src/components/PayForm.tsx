'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getScenario } from '@/scenarios';
import { interpretFieldInput } from '@/scenarios/validate';

const AMOUNT_MAX = 100_000;

export function PayForm({ scenarioId }: { scenarioId: string }) {
  const scenario = getScenario(scenarioId);
  const loanField = scenario?.fields.find((field) => field.key === 'loanNumber');
  const [loan, setLoan] = useState('');
  const [amount, setAmount] = useState('');
  const [errors, setErrors] = useState<{ loan?: string; amount?: string }>({});
  const [receipt, setReceipt] = useState<{ loan: string; amount: string } | null>(null);

  if (!scenario?.paymentPortal || !loanField) {
    return (
      <section className="card">
        <h2>No payment portal</h2>
        <p>This scenario does not include a sample payment page.</p>
      </section>
    );
  }

  if (receipt) {
    return (
      <section className="card success" aria-labelledby="pay-received">
        <p className="eyebrow">Sample payment</p>
        <h2 id="pay-received">Payment recorded</h2>
        <p className="ref">{receipt.amount}</p>
        <p>Loan {receipt.loan}</p>
        <p>No charge was made. This portal only confirms the amount.</p>
        <div className="inline-actions">
          <button type="button" className="btn" onClick={() => setReceipt(null)}>
            Make another payment
          </button>
          <Link className="btn btn-ghost" href={`/intake?scenario=${scenario.id}`}>
            Back to your request
          </Link>
        </div>
      </section>
    );
  }

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const interpreted = interpretFieldInput(loanField, loan, scenario.categories);
    const amountError = amountErrorFor(amount);
    const next = {
      loan: interpreted.error || !interpreted.value ? interpreted.error || loanField.messages?.required : undefined,
      amount: amountError,
    };
    setLoan(interpreted.value || loan);
    setErrors(next);
    if (next.loan || next.amount || !interpreted.value) return;
    setReceipt({ loan: interpreted.value, amount: formatAmount(amount) });
  };

  return (
    <section className="card" aria-labelledby="pay-title">
      <h2 id="pay-title">{scenario.paymentPortal.title}</h2>
      <p className="support-intro">{scenario.paymentPortal.intro}</p>
      <form onSubmit={onSubmit} noValidate>
        <div className="form-grid">
          <div className={`field${errors.loan ? ' is-invalid' : ''}`}>
            <label htmlFor="pay-loan">{loanField.label}</label>
            <input
              id="pay-loan"
              name="loanNumber"
              value={loan}
              placeholder={loanField.placeholder}
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="characters"
              onChange={(event) => {
                const raw = event.target.value;
                const normalized = interpretFieldInput(loanField, raw, scenario.categories);
                setLoan(normalized.error ? raw : normalized.value || raw);
                if (errors.loan) setErrors((current) => ({ ...current, loan: undefined }));
              }}
              onBlur={() => {
                const normalized = interpretFieldInput(loanField, loan, scenario.categories);
                if (normalized.value) setLoan(normalized.value);
                if (normalized.error) setErrors((current) => ({ ...current, loan: normalized.error }));
              }}
              aria-invalid={errors.loan ? true : undefined}
              aria-describedby={errors.loan ? 'pay-loan-error' : 'pay-loan-hint'}
            />
            <p className="hint" id="pay-loan-hint">
              {loanField.hint}
            </p>
            {errors.loan && (
              <p className="field-error" id="pay-loan-error">
                {errors.loan}
              </p>
            )}
          </div>
          <div className={`field${errors.amount ? ' is-invalid' : ''}`}>
            <label htmlFor="pay-amount">Amount</label>
            <input
              id="pay-amount"
              name="amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="412.18"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                if (errors.amount) setErrors((current) => ({ ...current, amount: undefined }));
              }}
              aria-invalid={errors.amount ? true : undefined}
              aria-describedby={errors.amount ? 'pay-amount-error' : undefined}
            />
            {errors.amount && (
              <p className="field-error" id="pay-amount-error">
                {errors.amount}
              </p>
            )}
          </div>
        </div>
        <div className="action-bar">
          <button className="btn btn-lg" type="submit">
            Pay
          </button>
          <p className="action-note">No card is charged.</p>
        </div>
      </form>
    </section>
  );
}

function amountErrorFor(raw: string): string | undefined {
  const cleaned = raw.trim().replace(/[$,]/g, '');
  if (!cleaned) return 'Enter an amount like 412.18.';
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return 'Enter a dollar amount with up to two decimals.';
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return 'Enter an amount greater than zero.';
  if (value > AMOUNT_MAX) return 'Enter an amount of $100,000 or less.';
  return undefined;
}

function formatAmount(raw: string): string {
  const value = Number(raw.trim().replace(/[$,]/g, ''));
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
