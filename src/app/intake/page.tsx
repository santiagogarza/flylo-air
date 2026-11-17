import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { IntakeScreen } from '@/components/IntakeScreen';
import { ScenarioCatalog } from '@/components/ScenarioCatalog';
import { param, type SearchParams } from '@/lib/params';
import { getScenario } from '@/scenarios';

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const id = param(await searchParams, 'scenario')?.trim() ?? '';
  const scenario = id ? getScenario(id) : undefined;
  return { title: scenario?.title ?? (id ? 'Scenario not found' : 'Intake') };
}

export default async function IntakePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const id = param(await searchParams, 'scenario')?.trim() ?? '';
  if (!id) return <ScenarioCatalog />;
  const scenario = getScenario(id);
  if (!scenario) return <ScenarioCatalog missing={id} />;
  if (scenario.legacyPayload) redirect('/support/');
  return <IntakeScreen id={scenario.id} />;
}
