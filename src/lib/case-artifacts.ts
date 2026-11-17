export const ARTIFACT_TYPES = ['doc', 'sheet', 'email_draft', 'calendar', 'pr', 'record'] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const ARTIFACT_STATUSES = ['drafted', 'created', 'logged', 'held', 'updated', 'sent', 'failed'] as const;
export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number];

export const BOTS = ['Intake', 'Servicing', 'Compliance', 'Escalation'] as const;
export type BotName = (typeof BOTS)[number];

export type CaseArtifact = {
  type: ArtifactType;
  label: string;
  url: string;
  createdAt: string;
  status: ArtifactStatus;
  by: BotName;
};

export type CaseActivity = {
  at: string;
  bot: BotName;
  action: string;
  detail?: string;
};

export function artifactCount(item: { artifacts?: readonly unknown[] }): number {
  return item.artifacts?.length ?? 0;
}

export function artifactKey(item: Pick<CaseArtifact, 'type' | 'label' | 'url'>): string {
  return [item.type, item.label.trim().toLowerCase(), item.url.trim()].join('|');
}
