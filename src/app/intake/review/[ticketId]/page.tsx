import type { Metadata } from 'next';
import Link from 'next/link';
import { CaseActions } from '@/components/CaseActions';
import { intakeThemeStyle } from '@/lib/intake-theme';
import { POLICY_SECTIONS } from '@/lib/hardship-policy';
import { param, type SearchParams } from '@/lib/params';
import { getScenario } from '@/scenarios';
import { getCase } from '@/server/cases';

export async function generateMetadata({ params }: { params: Promise<{ ticketId: string }> }): Promise<Metadata> {
  const { ticketId } = await params;
  return { title: decodeURIComponent(ticketId) };
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
  const item = getCase(decodeURIComponent(ticketId));
  if (!item || !scenario) {
    return (
      <section className="page-head">
        <div className="wrap">
          <h1>Case not found</h1>
          <p>
            <Link href={`/intake/review?scenario=${scenarioId}`}>Back to the queue</Link>
          </p>
        </div>
      </section>
    );
  }
  const loan = item.history.loan;

  return (
    <div className="intake-theme" style={intakeThemeStyle(scenario)}>
      <section className="page-head">
        <div className="wrap">
          <p className="eyebrow">{item.decision}</p>
          <h1>{item.ticketId}</h1>
          <p>
            {item.request.fullName} · {item.request.loanNumber}
          </p>
          <p>
            <Link href={`/intake/review?scenario=${scenario.id}`}>Back to the queue</Link>
          </p>
        </div>
      </section>
      <div className="wrap section case-stack">
        <section className="card">
          <h2>Customer request</h2>
          <dl className="fact-list">
            <Fact label="Name" value={item.request.fullName} />
            <Fact label="Loan" value={item.request.loanNumber} />
            <Fact label="Email" value={item.request.email} />
            <Fact label="Requested change" value={item.request.requestedChange} />
            <Fact label="Callback" value={item.request.callbackWindow} />
            <Fact label="Reason" value={item.request.reason} />
          </dl>
        </section>
        <section className="card">
          <h2>Loan on file</h2>
          {loan ? (
            <dl className="fact-list">
              <Fact label="Status" value={loan.status} />
              <Fact label="Balance" value={money(loan.balance)} />
              <Fact label="Days past due" value={String(loan.daysPastDue)} />
              <Fact label="On-time payments" value={String(loan.totalOnTimePayments)} />
              <Fact label="Extensions in 12 months" value={String(loan.extensionsLast12Months)} />
              <Fact label="Flags" value={loan.flags?.length ? loan.flags.join(', ') : 'None'} />
              <Fact label="Vehicle" value={loan.vehicle} />
            </dl>
          ) : (
            <p>The loan number was not found.</p>
          )}
          <h3>Prior tickets</h3>
          {item.history.priorTickets.length === 0 ? (
            <p>No earlier tickets on file.</p>
          ) : (
            <ul>
              {item.history.priorTickets.map((ticket) => (
                <li key={ticket.id}>
                  {ticket.id}: {ticket.summary}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2>Decision</h2>
          <p>{item.decision}</p>
          <p>{item.reasoning}</p>
          <h3>Why</h3>
          {item.rules.map((rule) => {
            const section = POLICY_SECTIONS.find((entry) => entry.id === rule.id);
            return (
              <article key={rule.id} className="rule">
                <p>
                  <Link href={`/intake/policy?scenario=${scenario.id}#${rule.id}`}>
                    Policy §{section?.number ?? rule.id} {rule.title}
                  </Link>{' '}
                  <span className={rule.result === 'pass' ? 'pass' : 'fail'}>{rule.result === 'pass' ? 'Pass' : 'Fail'}</span>
                </p>
                <p>{rule.detail}</p>
                <ul>
                  {rule.criteria.map((check) => (
                    <li key={check.label}>
                      <span className={check.result === 'pass' ? 'pass' : 'fail'}>{check.result === 'pass' ? 'Pass' : 'Fail'}</span> {check.label}. {check.detail}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </section>
        <section className="card">
          <h2>Compliance review</h2>
          <p>Verdict: {item.compliance.verdict}</p>
          <h3>Edits</h3>
          {item.compliance.edits.length === 0 ? <p>No edits.</p> : <ul>{item.compliance.edits.map((edit) => <li key={edit}>{edit}</li>)}</ul>}
          <h3>Required disclosures</h3>
          <ul>
            {item.compliance.disclosures.map((itemDisclosure) => (
              <li key={itemDisclosure.id}>
                <span className={itemDisclosure.present ? 'pass' : 'fail'}>{itemDisclosure.present ? 'Present' : 'Missing'}</span> {itemDisclosure.label}
              </li>
            ))}
          </ul>
        </section>
        {item.handoff && (
          <section className="card">
            <h2>Escalation handoff</h2>
            <p>{item.handoff.team}</p>
            <p>{item.handoff.reason}</p>
          </section>
        )}
        <CaseActions ticketId={item.ticketId} draft={item.draft} status={item.status} />
        <section className="card">
          <h2>Activity</h2>
          <ul>
            {item.log.map((entry, index) => (
              <li key={`${entry.at}-${index}`}>
                {entry.at} · {entry.action} · {entry.by}
              </li>
            ))}
          </ul>
        </section>
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
