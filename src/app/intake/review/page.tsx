import type { Metadata } from 'next';
import Link from 'next/link';
import { ScenarioCatalog } from '@/components/ScenarioCatalog';
import { intakeThemeStyle } from '@/lib/intake-theme';
import { param, type SearchParams } from '@/lib/params';
import { getScenario } from '@/scenarios';
import { listCases, type CaseStatus } from '@/server/cases';

export const metadata: Metadata = { title: 'Review queue' };

const STATUSES: { id: '' | CaseStatus; label: string }[] = [
  { id: '', label: 'All' },
  { id: 'needs_review', label: 'Needs review' },
  { id: 'sent', label: 'Sent' },
  { id: 'edited_sent', label: 'Edited & sent' },
  { id: 'escalated', label: 'Escalated' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'changes_requested', label: 'Changes requested' },
];

export default async function ReviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const id = param(params, 'scenario')?.trim() ?? '';
  const scenario = id ? getScenario(id) : undefined;
  if (!scenario) return <ScenarioCatalog missing={id || undefined} />;
  const status = param(params, 'status') ?? '';
  const cases = listCases(scenario.id, status || undefined);
  const counts = Object.fromEntries(STATUSES.map((item) => [item.id, listCases(scenario.id, item.id || undefined).length]));

  return (
    <div className="intake-theme" style={intakeThemeStyle(scenario)}>
      <section className="page-head">
        <div className="wrap">
          <p className="intake-wordmark">{scenario.brandName}</p>
          <p className="eyebrow">Review queue</p>
          <h1>Cases to review</h1>
          <p>Compliance stops and escalations are first, then payment plans, then approvals. Send does not email anyone.</p>
        </div>
      </section>
      <div className="wrap section">
        <div className="pill-row">
          {STATUSES.map((item) => {
            const href = item.id ? `/intake/review?scenario=${scenario.id}&status=${item.id}` : `/intake/review?scenario=${scenario.id}`;
            return (
              <Link key={item.label} className="pill" href={href} aria-current={status === item.id ? 'page' : undefined}>
                {item.label} ({counts[item.id]})
              </Link>
            );
          })}
        </div>
        <section className="card">
          {cases.length === 0 ? (
            <p>No cases in this filter.</p>
          ) : (
            <ul className="case-list">
              {cases.map((item) => (
                <li key={item.ticketId}>
                  <Link href={`/intake/review/${item.ticketId}?scenario=${scenario.id}`}>
                    <strong>{item.ticketId}</strong>
                    <span>{item.request.fullName || 'Unknown caller'}</span>
                    <span>{item.request.loanNumber}</span>
                    <span>{item.decision}</span>
                    <span className="pill">{labelStatus(item.status)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function labelStatus(status: string): string {
  return STATUSES.find((item) => item.id === status)?.label ?? status;
}
