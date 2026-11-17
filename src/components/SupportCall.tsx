'use client';

import { IntakeForm } from '@/components/IntakeForm';
import { flyloSupport } from '@/scenarios/flylo-support';

export function SupportCall() {
  return <IntakeForm scenario={flyloSupport} />;
}
