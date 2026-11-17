import type { CSSProperties } from 'react';
import type { ScenarioConfig } from '@/scenarios/types';

export function intakeThemeStyle(scenario: ScenarioConfig): CSSProperties {
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
    '--sky': '#f3fbfa',
    '--sky-2': '#d5f3ef',
  } as CSSProperties;
}
