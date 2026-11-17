import type { Metadata } from 'next';
import { PayForm } from '@/components/PayForm';
import { ScenarioCatalog } from '@/components/ScenarioCatalog';
import { intakeThemeStyle } from '@/lib/intake-theme';
import { param, type SearchParams } from '@/lib/params';
import { getScenario } from '@/scenarios';

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const scenario = getScenario(param(await searchParams, 'scenario')?.trim() ?? '');
  return { title: scenario?.paymentPortal?.title ?? 'Make a payment' };
}

export default async function PayPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const id = param(await searchParams, 'scenario')?.trim() ?? '';
  const scenario = id ? getScenario(id) : undefined;
  if (!scenario) return <ScenarioCatalog missing={id || undefined} />;
  return (
    <div className="intake-theme" style={intakeThemeStyle(scenario)}>
      <section className="page-head">
        <div className="wrap">
          <p className="intake-wordmark">{scenario.brandName}</p>
          <p className="eyebrow">Sample portal</p>
          <h1>{scenario.paymentPortal?.title ?? 'Make a payment'}</h1>
          <p>{scenario.paymentPortal?.intro}</p>
        </div>
      </section>
      <div className="wrap section">
        <PayForm scenarioId={scenario.id} />
      </div>
    </div>
  );
}
