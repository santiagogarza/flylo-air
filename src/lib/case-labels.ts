import type { PriorityBand } from '@/lib/hardship-policy';

const DECISIONS: Record<string, string> = {
  APPROVE_EXTENSION: 'Approve extension',
  APPROVE_DUE_DATE_CHANGE: 'Approve due-date change',
  OFFER_PAYMENT_PLAN: 'Offer payment plan',
  ESCALATE: 'Escalate',
};

const STATUSES: Record<string, string> = {
  needs_review: 'Needs review',
  sent: 'Sent',
  edited_sent: 'Edited & sent',
  escalated: 'Escalated',
  rejected: 'Rejected',
  changes_requested: 'Changes requested',
};

const BANDS: Record<PriorityBand, string> = {
  compliance: 'Compliance stop',
  escalation: 'Escalation',
  plan: 'Payment plan',
  approval: 'Approval',
};

export function decisionLabel(decision: string): string {
  return DECISIONS[decision] ?? decision.replaceAll('_', ' ').toLowerCase().replace(/^./, (first) => first.toUpperCase());
}

export function statusLabel(status: string): string {
  return STATUSES[status] ?? status.replaceAll('_', ' ');
}

export function bandLabel(band: PriorityBand): string {
  return BANDS[band] ?? band;
}

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}
