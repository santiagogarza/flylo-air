import type { Metadata, Viewport } from 'next';
import { SiteChrome } from '@/components/SiteChrome';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'FlyLo-Air · Fly more, pay less',
    template: '%s · FlyLo-Air',
  },
  description: 'FlyLo-Air is a fictional airline. This is a SAMPLE site for workshop demos.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0b2545',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
