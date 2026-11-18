import Link from 'next/link';
import { EditorialTone } from '@/components/EditorialTone';
import type { ScenarioConfig } from '@/scenarios/types';

export type IntakeSection = 'request' | 'pay' | 'review' | 'policy';

export function IntakeBrandBar({ scenario, current }: { scenario: ScenarioConfig; current?: IntakeSection }) {
  const [first, ...rest] = scenario.brandName.split(' ');
  const links: { id: IntakeSection; href: string; label: string }[] = [
    { id: 'request', href: `/intake?scenario=${scenario.id}`, label: 'Request' },
  ];
  if (scenario.paymentPortal) links.push({ id: 'pay', href: `/intake/pay?scenario=${scenario.id}`, label: 'Make a payment' });
  if (scenario.policyFile) {
    links.push({ id: 'review', href: `/intake/review?scenario=${scenario.id}`, label: 'Review queue' });
    links.push({ id: 'policy', href: `/intake/policy?scenario=${scenario.id}`, label: 'Policy' });
  }
  return (
    <div className="intake-bar">
      <EditorialTone editorial={scenario.appearance === 'editorial'} />
      <div className="wrap intake-bar-inner">
        <Link href={`/intake?scenario=${scenario.id}`} className="intake-wordmark">
          <span className="intake-mark" aria-hidden="true">
            {first.charAt(0)}
          </span>
          <span className="intake-wordmark-text">
            <span className="intake-wordmark-name">{first}</span>
            {rest.length > 0 && <span className="intake-wordmark-sub">{rest.join(' ')}</span>}
          </span>
        </Link>
        <nav className="intake-nav" aria-label={`${scenario.brandName} pages`}>
          {links.map((link) => (
            <Link key={link.id} href={link.href} aria-current={current === link.id ? 'page' : undefined}>
              {link.label}
            </Link>
          ))}
        </nav>
        <span className="intake-sample">{scenario.badge ?? 'Sample'}</span>
      </div>
    </div>
  );
}
