import type { Metadata } from 'next';
import type { ScenarioConfig } from '@/scenarios/types';

type ScenarioMeta = Pick<ScenarioConfig, 'brandName' | 'title' | 'tagline'>;

/** Description for a scenario page, taken from the scenario itself. */
export function scenarioDescription(scenario: ScenarioMeta): string {
  const tagline = scenario.tagline?.trim();
  return tagline || `${scenario.brandName}. ${scenario.title}.`;
}

function titled(full: string, description?: string): Metadata {
  return {
    title: { absolute: full },
    ...(description ? { description } : {}),
    openGraph: { title: full, ...(description ? { description } : {}) },
    twitter: { title: full, ...(description ? { description } : {}) },
  };
}

/** Document title and description for a known scenario. Absolute, so the FlyLo-Air template never applies. */
export function scenarioTitle(title: string, scenario: ScenarioMeta): Metadata {
  const full = `${title} · ${scenario.brandName}`;
  return titled(full, scenarioDescription(scenario));
}

/** Document title for an intake page that has no scenario brand. Description stays with the intake layout. */
export function absoluteTitle(title: string): Metadata {
  return titled(title);
}
