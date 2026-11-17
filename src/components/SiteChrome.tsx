'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoMark } from '@/components/icons';
import { SiteNav } from '@/components/SiteNav';

function isIntakePath(pathname: string): boolean {
  return pathname === '/intake' || pathname.startsWith('/intake/');
}

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/';
  if (isIntakePath(pathname)) {
    return (
      <>
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <footer className="site-footer">
          <div className="wrap">
            <p>
              <span className="sample-badge">SAMPLE</span>
              Fictional sample. No real payments are taken and nothing is emailed.
            </p>
          </div>
        </footer>
      </>
    );
  }

  return (
    <>
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
    </>
  );
}
