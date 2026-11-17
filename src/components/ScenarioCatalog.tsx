import Link from 'next/link';
import { listScenarios, scenarioPath } from '@/scenarios';

export function ScenarioCatalog({ missing }: { missing?: string }) {
  const scenarios = listScenarios();
  return (
    <div className="intake-theme">
      <section className="page-head">
        <div className="wrap">
          <p className="eyebrow">{missing ? 'Not found' : 'Intake'}</p>
          <h1>{missing ? 'That scenario was not found' : 'Choose a scenario'}</h1>
          <p>{missing ? `Nothing is registered as "${missing}".` : 'Each scenario is one config file and one form.'}</p>
        </div>
      </section>
      <div className="wrap section">
        {missing && (
          <div className="alert alert-info intake-notice" role="status">
            <p>Check the link, or pick one of the scenarios below.</p>
          </div>
        )}
        <section aria-labelledby="scenario-list-title">
          <h2 id="scenario-list-title" className="intake-section-title">
            Available scenarios
          </h2>
          <ul className="scenario-list">
            {scenarios.map((scenario) => (
              <li key={scenario.id} className="scenario-card" style={{ '--scenario-brand': scenario.brandColor } as React.CSSProperties}>
                <span className="scenario-dot" aria-hidden="true" />
                <span className="scenario-title">{scenario.title}</span>
                <Link href={scenarioPath(scenario)} className="scenario-link">
                  {scenario.brandName}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
