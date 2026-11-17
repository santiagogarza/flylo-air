import type { Metadata } from 'next';
import Link from 'next/link';
import { IntakeBrandBar } from '@/components/IntakeBrandBar';
import { intakeThemeStyle } from '@/lib/intake-theme';
import { scenarioTitle } from '@/lib/page-title';
import { getScenario } from '@/scenarios';
import { lakelineHardship } from '@/scenarios/lakeline-hardship';

export const metadata: Metadata = scenarioTitle('Case not found', lakelineHardship);

export default function CaseNotFound() {
  const fallback = getScenario('lakeline-hardship');
  const scenarioId = fallback?.id ?? 'lakeline-hardship';

  return (
    <div className="intake-theme" style={fallback ? intakeThemeStyle(fallback) : undefined}>
      {fallback && <IntakeBrandBar scenario={fallback} current="review" />}
      <section className="page-head">
        <div className="wrap">
          <p className="eyebrow">Review queue</p>
          <h1>Case not found</h1>
          <p>No case matches this link. It may have been cleared by a demo reset.</p>
        </div>
      </section>
      <div className="wrap section">
        <p>
          <Link className="btn" href={`/intake/review?scenario=${scenarioId}`}>
            Back to the queue
          </Link>
        </p>
      </div>
    </div>
  );
}
