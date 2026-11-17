import type { Metadata } from 'next';
import { scenarioDescription } from '@/lib/page-title';
import { lakelineHardship } from '@/scenarios/lakeline-hardship';

const description = scenarioDescription(lakelineHardship);

export const metadata: Metadata = {
  title: {
    default: `Intake · ${lakelineHardship.brandName}`,
    template: '%s',
  },
  description,
  openGraph: {
    title: `Intake · ${lakelineHardship.brandName}`,
    description,
  },
  twitter: {
    title: `Intake · ${lakelineHardship.brandName}`,
    description,
  },
};

export default function IntakeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
