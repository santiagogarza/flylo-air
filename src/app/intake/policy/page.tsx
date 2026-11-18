import type { Metadata } from 'next';
import Link from 'next/link';
import { IntakeBrandBar } from '@/components/IntakeBrandBar';
import { ScenarioCatalog } from '@/components/ScenarioCatalog';
import { intakeThemeClass, intakeThemeStyle } from '@/lib/intake-theme';
import { absoluteTitle, scenarioTitle } from '@/lib/page-title';
import { parsePolicy } from '@/lib/policy-doc';
import { param, type SearchParams } from '@/lib/params';
import { getScenario } from '@/scenarios';
import { readScenarioFile } from '@/server/policy-file';

export async function generateMetadata({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const id = param(await searchParams, 'scenario')?.trim() ?? '';
  const scenario = id ? getScenario(id) : undefined;
  if (!scenario) return absoluteTitle(id ? 'Scenario not found' : 'Hardship policy');
  return scenarioTitle('Hardship policy', scenario);
}

export default async function PolicyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const id = param(await searchParams, 'scenario')?.trim() ?? '';
  const scenario = id ? getScenario(id) : undefined;
  if (!scenario) return <ScenarioCatalog missing={id || undefined} />;
  const markdown = scenario.policyFile ? readScenarioFile(scenario.policyFile) : null;
  if (!markdown) {
    return (
      <div className={intakeThemeClass(scenario)} style={intakeThemeStyle(scenario)}>
        <IntakeBrandBar scenario={scenario} current="policy" />
        <section className="page-head">
          <div className="wrap">
            <p className="eyebrow">Policy</p>
            <h1>No policy for this scenario</h1>
            <p>
              <Link href={`/intake?scenario=${scenario.id}`}>Back to the form</Link>
            </p>
          </div>
        </section>
      </div>
    );
  }
  const blocks = parsePolicy(markdown);
  const headings = blocks.filter((block) => block.type === 'heading');

  return (
    <div className={intakeThemeClass(scenario)} style={intakeThemeStyle(scenario)}>
      <IntakeBrandBar scenario={scenario} current="policy" />
      <section className="page-head">
        <div className="wrap">
          <p className="eyebrow">Policy</p>
          <h1>Hardship policy</h1>
          <p>Mock rules for the demo. The review queue links each Why item here.</p>
        </div>
      </section>
      <div className="wrap section policy-layout">
        <nav className="card policy-toc" aria-label="Policy sections">
          <p className="policy-toc-title">Sections</p>
          <ul>
            {headings.map((heading) => (
              <li key={heading.id}>
                <a href={`#${heading.id}`}>{heading.text}</a>
              </li>
            ))}
          </ul>
        </nav>
        <article className="card policy-doc">
          {blocks.map((block, index) => {
            if (block.type === 'heading') {
              return (
                <h2 key={block.id} id={block.id} tabIndex={-1}>
                  {block.text}
                </h2>
              );
            }
            if (block.type === 'list') {
              return (
                <ul key={index}>
                  {block.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              );
            }
            if (block.text.startsWith('# ')) {
              return (
                <p key={index} className="policy-title">
                  {block.text.slice(2)}
                </p>
              );
            }
            return <p key={index}>{block.text}</p>;
          })}
        </article>
      </div>
    </div>
  );
}
