import { flyloSupport } from './flylo-support';
import { lakelineHardship } from './lakeline-hardship';
import { publicHotel } from './public-hotel';
import type { ScenarioConfig } from './types';

const SCENARIOS: readonly ScenarioConfig[] = [flyloSupport, lakelineHardship, publicHotel];

export function listScenarios(): ScenarioConfig[] {
  return [...SCENARIOS];
}

export function getScenario(id: string): ScenarioConfig | undefined {
  const key = id.trim();
  return SCENARIOS.find((scenario) => scenario.id === key);
}

export function scenarioPath(scenario: ScenarioConfig): string {
  if (scenario.legacyPayload) return '/support/';
  return `/intake?scenario=${encodeURIComponent(scenario.id)}`;
}
