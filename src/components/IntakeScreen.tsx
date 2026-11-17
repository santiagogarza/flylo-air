'use client';

import Link from 'next/link';
import { IntakeForm } from '@/components/IntakeForm';
import { intakeThemeStyle } from '@/lib/intake-theme';
import { getScenario } from '@/scenarios';

export function IntakeScreen({ id }: { id: string }) {
  const scenario = getScenario(id);
  if (!scenario) return null;
  return (
    <div className="intake-theme" style={intakeThemeStyle(scenario)}>
      <section className="page-head">
        <div className="wrap">
          <p className="intake-wordmark">{scenario.brandName}</p>
          <p className="eyebrow">{scenario.pageEyebrow}</p>
          <h1>{scenario.title}</h1>
          {scenario.tagline && <p>{scenario.tagline}</p>}
          {(scenario.paymentPortal || scenario.policyFile) && (
            <p className="intake-links">
              {scenario.paymentPortal && <Link href={`/intake/pay?scenario=${scenario.id}`}>Make a payment</Link>}
              {scenario.policyFile && (
                <>
                  {' '}
                  <Link href={`/intake/review?scenario=${scenario.id}`}>Review queue</Link>
                  {' '}
                  <Link href={`/intake/policy?scenario=${scenario.id}`}>Policy</Link>
                </>
              )}
            </p>
          )}
        </div>
      </section>
      <div className="wrap section">
        <IntakeForm scenario={scenario} />
      </div>
    </div>
  );
}
