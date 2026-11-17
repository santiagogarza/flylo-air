import { artifactCount, artifactKey, BOTS, type ArtifactStatus, type ArtifactType, type CaseActivity, type CaseArtifact } from '@/lib/case-artifacts';
import { formatWhen } from '@/lib/case-labels';

const TYPE_LABEL: Record<ArtifactType, string> = {
  doc: 'Document',
  sheet: 'Spreadsheet',
  email_draft: 'Email draft',
  calendar: 'Calendar',
  pr: 'Pull request',
  record: 'Record',
};

const STATUS_LABEL: Record<ArtifactStatus, string> = {
  drafted: 'Drafted',
  created: 'Created',
  logged: 'Logged',
  held: 'Held',
  updated: 'Updated',
  sent: 'Sent',
  failed: 'Failed',
};

export function CaseOutputs({ artifacts }: { artifacts: CaseArtifact[] }) {
  const ordered = [...artifacts].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.label.localeCompare(b.label));
  return (
    <section className="card outputs-card" aria-labelledby="case-outputs">
      <div className="card-head">
        <h2 id="case-outputs">Outputs</h2>
        <span className="outputs-count">{artifactCount({ artifacts })}</span>
      </div>
      <p className="mock-note">Created by the Lakeline bots. Nothing is emailed until a person sends it.</p>
      {ordered.length === 0 ? (
        <p className="muted">Nothing has been produced for this case.</p>
      ) : (
        <ul className="output-list">
          {ordered.map((item) => (
            <li key={artifactKey(item)} className="output-row">
              <span className="output-icon" data-type={item.type} title={TYPE_LABEL[item.type]}>
                <ArtifactIcon type={item.type} />
                <span className="visually-hidden">{TYPE_LABEL[item.type]}</span>
              </span>
              <span className="output-body">
                <a className="output-label" href={item.url} target="_blank" rel="noreferrer">
                  {item.label}
                </a>
                <span className="output-meta">
                  <span>{item.by}</span>
                  <time dateTime={item.createdAt}>{formatWhen(item.createdAt)}</time>
                </span>
              </span>
              <span className="artifact-status" data-status={item.status}>
                {STATUS_LABEL[item.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CaseTimeline({ activity }: { activity: CaseActivity[] }) {
  const groups = BOTS.map((bot) => ({
    bot,
    entries: activity.filter((entry) => entry.bot === bot).sort((a, b) => a.at.localeCompare(b.at) || a.action.localeCompare(b.action)),
  }));
  return (
    <section className="card timeline-card" aria-labelledby="case-activity">
      <h2 id="case-activity">Activity</h2>
      <ol className="bot-pipeline">
        {groups.map((group) => (
          <li key={group.bot} data-state={group.entries.length ? 'done' : 'waiting'}>
            {group.bot}
          </li>
        ))}
      </ol>
      {activity.length === 0 ? (
        <p className="muted">No bot activity yet.</p>
      ) : (
        <div className="bot-groups">
          {groups.map((group) => (
            <section key={group.bot} className="bot-group" aria-label={group.bot}>
              <h3 className="bot-name" data-bot={group.bot}>
                {group.bot}
              </h3>
              {group.entries.length === 0 ? (
                <p className="muted bot-empty">No {group.bot.toLowerCase()} step.</p>
              ) : (
                <ol className="timeline">
                  {group.entries.map((entry) => (
                    <li key={`${entry.bot}-${entry.at}-${entry.action}`}>
                      <span className="timeline-action">{entry.action}</span>
                      {entry.detail && <span className="timeline-detail">{entry.detail}</span>}
                      <time className="muted" dateTime={entry.at}>
                        {formatWhen(entry.at)}
                      </time>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function ArtifactIcon({ type }: { type: ArtifactType }) {
  const common = { className: 'btn-icon', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, focusable: false };
  if (type === 'doc') {
    return (
      <svg {...common}>
        <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
        <path d="M14 3v5h5M8 13h8M8 17h6" />
      </svg>
    );
  }
  if (type === 'sheet') {
    return (
      <svg {...common}>
        <rect x="4" y="3" width="16" height="18" rx="1" />
        <path d="M4 9h16M4 15h16M10 3v18" />
      </svg>
    );
  }
  if (type === 'email_draft') {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M4 7l8 6 8-6" />
      </svg>
    );
  }
  if (type === 'calendar') {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="15" rx="1" />
        <path d="M8 3v4M16 3v4M4 10h16" />
      </svg>
    );
  }
  if (type === 'pr') {
    return (
      <svg {...common}>
        <circle cx="7" cy="6" r="2" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="17" cy="12" r="2" />
        <path d="M7 8v8M9 12h6" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </svg>
  );
}
