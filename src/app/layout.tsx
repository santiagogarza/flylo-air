import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { LogoMark } from '@/components/icons';
import { SiteNav } from '@/components/SiteNav';
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
        <header className="site-header">
          <div className="wrap">
            <Link href="/" className="brand" aria-label="FlyLo-Air home">
              <LogoMark className="brand-mark" />
              <span className="brand-text">
                FlyLo<span className="brand-air">-Air</span>
              </span>
            </Link>
            <SiteNav />
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <footer className="site-footer">
          <div className="wrap">
            <p>
              <span className="sample-badge">SAMPLE</span>
              FlyLo-Air is a fictional airline. Flights, prices and bookings are made up. No real payments are taken.
            </p>
            <p>
              <Link href="/support/">Contact support</Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
