import type { Metadata } from 'next';
import Link from 'next/link';
import { ScenarioCatalog } from '@/components/ScenarioCatalog';
import { intakeThemeStyle } from '@/lib/intake-theme';
import { parsePolicy } from '@/lib/policy-doc';
import { param, type SearchParams } from '@/lib/params';
import { getScenario } from '@/scenarios';
import { readScenarioFile } from '@/server/policy-file';

export const metadata: Metadata = { title: 'Hardship policy' };

export default async function PolicyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const id = param(await searchParams, 'scenario')?.trim() ?? '';
  const scenario = id ? getScenario(id) : undefined;
  if (!scenario) return <ScenarioCatalog missing={id || undefined} />;
  const markdown = scenario.policyFile ? readScenarioFile(scenario.policyFile) : null;
  if (!markdown) {
    return (
      <section className="page-head">
        <div className="wrap">
          <h1>No policy for this scenario</h1>
          <p>
            <Link href={`/intake?scenario=${scenario.id}`}>Back to the form</Link>
          </p>
        </div>
      </section>
    );
  }
  const blocks = parsePolicy(markdown);
  const headings = blocks.filter((block) => block.type === 'heading');

  return (
    <div className="intake-theme" style={intakeThemeStyle(scenario)}>
      <section className="page-head">
        <div className="wrap">
          <p className="intake-wordmark">{scenario.brandName}</p>
          <p className="eyebrow">Policy</p>
          <h1>Hardship policy</h1>
          <p>Mock rules for the demo. The review queue links each Why item here.</p>
        </div>
      </section>
      <div className="wrap section">
        <article className="card policy-doc">
          <nav aria-label="Policy sections">
            <ul>
              {headings.map((heading) => (
                <li key={heading.id}>
                  <a href={`#${heading.id}`}>{heading.text}</a>
                </li>
              ))}
            </ul>
          </nav>
          {blocks.map((block, index) => {
            if (block.type === 'heading') return <h2 key={block.id} id={block.id}>{block.text}</h2>;
            if (block.type === 'list') {
              return (
                <ul key={index}>
                  {block.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              );
            }
            return <p key={index}>{block.text}</p>;
          })}
        </article>
      </div>
    </div>
  );
}
