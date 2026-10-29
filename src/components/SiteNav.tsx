'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

// The support page carries the voice call code, so it is prefetched when someone heads for the
// link (hover, focus, touch) instead of on every page load.
const LINKS = [
  { href: '/', label: 'Book', match: (path: string) => path === '/' || path.startsWith('/results') || path.startsWith('/checkout'), prefetchOnIntent: false },
  { href: '/support/', label: 'Support', match: (path: string) => path.startsWith('/support'), prefetchOnIntent: true },
];

export function SiteNav() {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  return (
    <nav className="site-nav" aria-label="Main">
      {LINKS.map((link) => {
        const prefetch = link.prefetchOnIntent ? () => router.prefetch(link.href) : undefined;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={link.match(pathname) ? 'page' : undefined}
            prefetch={link.prefetchOnIntent ? false : undefined}
            onMouseEnter={prefetch}
            onFocus={prefetch}
            onTouchStart={prefetch}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
