import type { Metadata } from 'next';
import { MilesDashboard } from '@/components/MilesDashboard';

export const metadata: Metadata = { title: 'FlyLo Miles' };

export const dynamic = 'force-dynamic';

export default function MilesPage() {
  return <MilesDashboard nowIso={new Date().toISOString()} />;
}
