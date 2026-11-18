'use client';

import { IntakeBrandBar } from '@/components/IntakeBrandBar';
import { IntakeForm } from '@/components/IntakeForm';
import { intakeThemeClass, intakeThemeStyle } from '@/lib/intake-theme';
import { getScenario } from '@/scenarios';

export function IntakeScreen({ id }: { id: string }) {
  const scenario = getScenario(id);
  if (!scenario) return null;
  return (
    <div className={intakeThemeClass(scenario)} style={intakeThemeStyle(scenario)}>
      <IntakeBrandBar scenario={scenario} current="request" />
      <section className="page-head">
        <div className="wrap">
          <p className="eyebrow">{scenario.pageEyebrow}</p>
          <h1>{scenario.title}</h1>
          {scenario.tagline && <p>{scenario.tagline}</p>}
        </div>
      </section>
      <div className="wrap section">
        <IntakeForm scenario={scenario} />
      </div>
    </div>
  );
}
