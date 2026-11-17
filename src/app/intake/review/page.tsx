import type { Metadata } from 'next';
import Link from 'next/link';
import { IntakeBrandBar } from '@/components/IntakeBrandBar';
import { ScenarioCatalog } from '@/components/ScenarioCatalog';
import { bandLabel, decisionLabel, statusLabel } from '@/lib/case-labels';
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
  const all = await listCases(scenario.id);
  const cases = status ? all.filter((item) => item.status === status) : all;
  const counts = Object.fromEntries(STATUSES.map((item) => [item.id, item.id ? all.filter((entry) => entry.status === item.id).length : all.length]));

  return (
    <div className="intake-theme" style={intakeThemeStyle(scenario)}>
      <IntakeBrandBar scenario={scenario} current="review" />
      <section className="page-head">
        <div className="wrap">
          <p className="eyebrow">Review queue</p>
          <h1>Cases to review</h1>
          <p>Compliance stops and escalations are first, then payment plans, then approvals. Send does not email anyone.</p>
        </div>
      </section>
      <div className="wrap section">
        <nav className="pill-row" aria-label="Filter by status">
          {STATUSES.map((item) => {
            const href = item.id ? `/intake/review?scenario=${scenario.id}&status=${item.id}` : `/intake/review?scenario=${scenario.id}`;
            return (
              <Link key={item.label} className="pill" href={href} aria-current={status === item.id ? 'page' : undefined}>
                {item.label} <span className="pill-count">({counts[item.id]})</span>
              </Link>
            );
          })}
        </nav>
        <section className="card queue-card" aria-label="Cases">
          {cases.length === 0 ? (
            <div className="empty-state">
              <p className="empty-title">No cases in this filter.</p>
              <p className="muted">
                <Link href={`/intake/review?scenario=${scenario.id}`}>Show all cases</Link>
              </p>
            </div>
          ) : (
            <>
              <div className="case-row case-head" aria-hidden="true">
                <span>Case</span>
                <span>Customer</span>
                <span>Loan</span>
                <span>Recommendation</span>
                <span>Status</span>
              </div>
              <ul className="case-list">
                {cases.map((item) => (
                  <li key={item.ticketId}>
                    <Link className="case-row" href={`/intake/review/${item.ticketId}?scenario=${scenario.id}`} data-band={item.band}>
                      <strong className="case-id">{item.ticketId}</strong>
                      <span className="case-name">{item.request.fullName || 'Unknown caller'}</span>
                      <span className="case-loan">{item.request.loanNumber}</span>
                      <span className="case-decision">
                        <span className="badge" data-band={item.band} title={item.decision}>
                          {decisionLabel(item.decision)}
                        </span>
                        <span className="case-band">{bandLabel(item.band)}</span>
                      </span>
                      <span className="status-chip" data-status={item.status}>
                        {statusLabel(item.status)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
