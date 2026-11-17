import Link from 'next/link';
import { listScenarios, scenarioPath } from '@/scenarios';

export function ScenarioCatalog({ missing }: { missing?: string }) {
  const scenarios = listScenarios();
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <p className="eyebrow">{missing ? 'Not found' : 'Intake'}</p>
          <h1>{missing ? 'That scenario was not found' : 'Choose a scenario'}</h1>
          <p>{missing ? `Nothing is registered as "${missing}".` : 'Each scenario is one config file and one form.'}</p>
        </div>
      </section>
      <div className="wrap section">
        <section className="card" aria-labelledby="scenario-list-title">
          <h2 id="scenario-list-title">Available scenarios</h2>
          <ul className="scenario-list">
            {scenarios.map((scenario) => (
              <li key={scenario.id}>
                <Link href={scenarioPath(scenario)}>{scenario.brandName}</Link>
                <span>{scenario.title}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
