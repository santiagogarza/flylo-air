import type { Metadata } from 'next';
import { IntakeBrandBar } from '@/components/IntakeBrandBar';
import { PayForm } from '@/components/PayForm';
import { ScenarioCatalog } from '@/components/ScenarioCatalog';
import { intakeThemeStyle } from '@/lib/intake-theme';
import { absoluteTitle, scenarioTitle } from '@/lib/page-title';
import { param, type SearchParams } from '@/lib/params';
import { getScenario } from '@/scenarios';

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const id = param(await searchParams, 'scenario')?.trim() ?? '';
  const scenario = id ? getScenario(id) : undefined;
  if (!scenario) return absoluteTitle(id ? 'Scenario not found' : 'Make a payment');
  return scenarioTitle(scenario.paymentPortal?.title ?? 'Make a payment', scenario);
}

export default async function PayPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const id = param(await searchParams, 'scenario')?.trim() ?? '';
  const scenario = id ? getScenario(id) : undefined;
  if (!scenario) return <ScenarioCatalog missing={id || undefined} />;
  return (
    <div className="intake-theme" style={intakeThemeStyle(scenario)}>
      <IntakeBrandBar scenario={scenario} current="pay" />
      <section className="page-head">
        <div className="wrap">
          <p className="eyebrow">Sample portal</p>
          <h1>{scenario.paymentPortal?.title ?? 'Make a payment'}</h1>
          <p>{scenario.paymentPortal?.intro}</p>
        </div>
      </section>
      <div className="wrap section intake-narrow">
        <PayForm scenarioId={scenario.id} />
      </div>
    </div>
  );
}
