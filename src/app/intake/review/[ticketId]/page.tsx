import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CaseActions } from '@/components/CaseActions';
import { CaseOutputs, CaseTimeline } from '@/components/CaseWork';
import { IntakeBrandBar } from '@/components/IntakeBrandBar';
import { bandLabel, decisionLabel, formatWhen, statusLabel } from '@/lib/case-labels';
import { intakeThemeClass, intakeThemeStyle } from '@/lib/intake-theme';
import { absoluteTitle, scenarioTitle } from '@/lib/page-title';
import { POLICY_SECTIONS } from '@/lib/hardship-policy';
import { param, type SearchParams } from '@/lib/params';
import { getScenario } from '@/scenarios';
import { getCase } from '@/server/cases';

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ ticketId: string }>;
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const { ticketId } = await params;
  const id = decodeURIComponent(ticketId);
  const requested = param(await searchParams, 'scenario')?.trim() ?? '';
  if (requested && !getScenario(requested)) return absoluteTitle('Case not found');
  const scenario = getScenario(requested || 'lakeline-hardship');
  if (!scenario) return absoluteTitle(id);
  const meta = scenarioTitle(id, scenario);
  if (await getCase(id)) return meta;
  const missing = `Case not found · ${scenario.brandName}`;
  return {
    ...meta,
    title: { absolute: missing },
    openGraph: { ...meta.openGraph, title: missing },
    twitter: { ...meta.twitter, title: missing },
  };
}

export default async function CasePage({
  params,
  searchParams,
}: {
  params: Promise<{ ticketId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { ticketId } = await params;
  const scenarioId = param(await searchParams, 'scenario')?.trim() ?? 'lakeline-hardship';
  const scenario = getScenario(scenarioId);
  const item = await getCase(decodeURIComponent(ticketId));
  if (!item || !scenario) notFound();
  const loan = item.history.loan;
  const failed = item.rules.filter((rule) => rule.result === 'fail').length;

  return (
    <div className={intakeThemeClass(scenario)} style={intakeThemeStyle(scenario)}>
      <IntakeBrandBar scenario={scenario} current="review" />
      <section className="page-head case-head-band">
        <div className="wrap">
          <p className="case-back">
            <Link href={`/intake/review?scenario=${scenario.id}`}>Back to the queue</Link>
          </p>
          <p className="eyebrow">Case review</p>
          <h1>{item.ticketId}</h1>
          <p>
            {item.request.fullName} · {item.request.loanNumber}
          </p>
          <div className="case-tags">
            <span className="badge badge-on-dark" data-band={item.band}>
              {decisionLabel(item.decision)}
            </span>
            <span className="status-chip status-on-dark" data-status={item.status}>
              {statusLabel(item.status)}
            </span>
            <span className="case-band-on-dark">{bandLabel(item.band)}</span>
          </div>
        </div>
      </section>
      <div className="wrap section case-layout">
        <div className="case-main">
          <section className="card" aria-labelledby="case-request">
            <h2 id="case-request">Customer request</h2>
            <dl className="fact-list">
              <Fact label="Name" value={item.request.fullName} />
              <Fact label="Loan" value={item.request.loanNumber} />
              <Fact label="Email" value={item.request.email} />
              <Fact label="Requested change" value={item.request.requestedChange} />
              <Fact label="Callback" value={item.request.callbackWindow} />
            </dl>
            <h3 className="sub-title">Reason</h3>
            <blockquote className="request-quote">{item.request.reason || '—'}</blockquote>
          </section>

          <CaseOutputs artifacts={item.artifacts} />

          <section className="card why-panel" aria-labelledby="case-decision">
            <div className="card-head">
              <h2 id="case-decision">Decision</h2>
              <span className="badge" data-band={item.band} title={item.decision}>
                {decisionLabel(item.decision)}
              </span>
            </div>
            <p className="decision-code">
              Decision code <code>{item.decision}</code>
            </p>
            <p>{item.reasoning}</p>
            <h3 className="sub-title">
              Why <span className="muted">· {item.rules.length} policy checks, {failed} failed</span>
            </h3>
            <div className="rule-list">
              {item.rules.map((rule) => {
                const section = POLICY_SECTIONS.find((entry) => entry.id === rule.id);
                return (
                  <article key={rule.id} className={`rule rule-${rule.result}`}>
                    <div className="rule-head">
                      <Link href={`/intake/policy?scenario=${scenario.id}#${rule.id}`}>
                        Policy §{section?.number ?? rule.id} {rule.title}
                      </Link>{' '}
                      <span className={`result-chip ${rule.result === 'pass' ? 'pass' : 'fail'}`}>{rule.result === 'pass' ? 'Pass' : 'Fail'}</span>
                    </div>
                    <p className="rule-detail">{rule.detail}</p>
                    <ul className="criteria">
                      {rule.criteria.map((check) => (
                        <li key={check.label} className={`criterion criterion-${check.result}`}>
                          <span className={check.result === 'pass' ? 'pass' : 'fail'}>{check.result === 'pass' ? 'Pass' : 'Fail'}</span>{' '}
                          <span>
                            {check.label}. <span className="muted">{check.detail}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>
          </section>

          <CaseActions ticketId={item.ticketId} draft={item.draft} status={item.status} />
        </div>

        <aside className="case-side" aria-label="Case context">
          <CaseTimeline activity={item.activity} />
          <section className="card" aria-labelledby="case-loan">
            <h2 id="case-loan">Loan on file</h2>
            {loan ? (
              <dl className="fact-list fact-list-tight">
                <Fact label="Status" value={loan.status} />
                <Fact label="Balance" value={money(loan.balance)} />
                <Fact label="Days past due" value={String(loan.daysPastDue)} />
                <Fact label="On-time payments" value={String(loan.totalOnTimePayments)} />
                <Fact label="Extensions in 12 months" value={String(loan.extensionsLast12Months)} />
                <Fact label="Flags" value={loan.flags?.length ? loan.flags.join(', ') : 'None'} />
                <Fact label="Vehicle" value={loan.vehicle} />
              </dl>
            ) : (
              <p className="alert alert-error">The loan number was not found.</p>
            )}
            <h3 className="sub-title">Prior tickets</h3>
            {item.history.priorTickets.length === 0 ? (
              <p className="muted">No earlier tickets on file.</p>
            ) : (
              <ul className="plain-list">
                {item.history.priorTickets.map((ticket) => (
                  <li key={ticket.id}>
                    <strong>{ticket.id}</strong>: {ticket.summary}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card" aria-labelledby="case-compliance">
            <div className="card-head">
              <h2 id="case-compliance">Compliance review</h2>
              <span className={`result-chip ${item.compliance.verdict === 'Clear' ? 'pass' : 'warn'}`}>Verdict: {item.compliance.verdict}</span>
            </div>
            <h3 className="sub-title">Edits</h3>
            {item.compliance.edits.length === 0 ? (
              <p className="muted">No edits.</p>
            ) : (
              <ul className="plain-list">
                {item.compliance.edits.map((edit) => (
                  <li key={edit}>{edit}</li>
                ))}
              </ul>
            )}
            <h3 className="sub-title">Required disclosures</h3>
            <ul className="criteria">
              {item.compliance.disclosures.map((itemDisclosure) => (
                <li key={itemDisclosure.id} className={`criterion criterion-${itemDisclosure.present ? 'pass' : 'fail'}`}>
                  <span className={itemDisclosure.present ? 'pass' : 'fail'}>{itemDisclosure.present ? 'Present' : 'Missing'}</span>{' '}
                  <span>{itemDisclosure.label}</span>
                </li>
              ))}
            </ul>
          </section>

          {item.handoff && (
            <section className="card handoff-card" aria-labelledby="case-handoff">
              <h2 id="case-handoff">Escalation handoff</h2>
              <p className="handoff-team">{item.handoff.team}</p>
              <p>{item.handoff.reason}</p>
            </section>
          )}

          {item.log.some((entry) => entry.action !== 'seeded') && (
            <section className="card" aria-labelledby="case-review-log">
              <h2 id="case-review-log">Review log</h2>
              <ol className="timeline">
                {item.log
                  .filter((entry) => entry.action !== 'seeded')
                  .map((entry, index) => (
                    <li key={`${entry.at}-${index}`}>
                      <span className="timeline-action">{entry.action}</span>
                      <span className="muted">
                        {entry.by} · <time dateTime={entry.at}>{formatWhen(entry.at)}</time>
                      </span>
                    </li>
                  ))}
              </ol>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value?: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value || '—'}</dd>
    </>
  );
}

function money(value: number | undefined): string {
  if (value === undefined) return '—';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
