import type { CSSProperties } from 'react';
import type { ScenarioConfig } from '@/scenarios/types';

export function intakeThemeClass(scenario: Pick<ScenarioConfig, 'appearance'>): string {
  return scenario.appearance === 'editorial' ? 'intake-theme intake-editorial' : 'intake-theme';
}

export function intakeThemeStyle(scenario: ScenarioConfig): CSSProperties {
  const editorial = scenario.appearance === 'editorial';
  const brand = scenario.brandColor;
  const brandDark = scenario.brandColorDark ?? '#115e59';
  const navy = scenario.brandNavy ?? '#0b1f33';
  return {
    '--intake-brand': brand,
    '--intake-brand-dark': brandDark,
    '--intake-navy': navy,
    '--blue': brand,
    '--blue-dark': brandDark,
    '--navy': navy,
    '--navy-2': navy,
    '--sky': editorial ? '#f3f3f3' : '#f3fbfa',
    '--sky-2': editorial ? '#e4e4e4' : '#d5f3ef',
    ...(editorial
      ? {
          '--ink': '#111111',
          '--ink-soft': '#3f3f3f',
          '--line': '#dedede',
          '--surface': '#ffffff',
        }
      : {}),
  } as CSSProperties;
}
