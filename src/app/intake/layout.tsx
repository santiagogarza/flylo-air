import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    default: 'Intake',
    template: '%s',
  },
};

export default function IntakeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
